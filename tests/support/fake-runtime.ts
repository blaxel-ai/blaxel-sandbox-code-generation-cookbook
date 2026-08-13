import path from "node:path";
import type {
  CommandInput,
  CommandResult,
  PreviewGrant,
  RuntimeAdapter,
  SessionGrant,
  SandboxCreateInput,
  SandboxFile,
  SandboxHandle,
} from "../../src/runtime/types.js";

type FakeSandbox = {
  files: Map<string, string | Uint8Array>;
};

export class FakeRuntimeAdapter implements RuntimeAdapter {
  readonly sandboxes = new Map<string, FakeSandbox>();
  readonly connectErrors: unknown[] = [];
  readonly deleteErrors: unknown[] = [];
  readonly executionInputs: CommandInput[] = [];
  creates = 0;
  deletes = 0;
  projections = 0;
  executions = 0;
  sessions = 0;
  previews = 0;
  readonly createInputs: SandboxCreateInput[] = [];

  async connectSandbox(name: string): Promise<SandboxHandle> {
    const queuedError = this.connectErrors.shift();
    if (queuedError) throw queuedError;
    if (!this.sandboxes.has(name)) {
      throw {
        origin: "platform",
        code: "WORKLOAD_NOT_FOUND",
        retryable: false,
        status: 404,
      };
    }
    return { name, status: "DEPLOYED" };
  }

  async createSandbox(input: SandboxCreateInput): Promise<SandboxHandle> {
    this.creates += 1;
    this.createInputs.push(input);
    if (!this.sandboxes.has(input.name)) {
      this.sandboxes.set(input.name, { files: new Map() });
    }
    return { name: input.name, status: "DEPLOYED" };
  }

  async deleteSandbox(name: string): Promise<void> {
    this.deletes += 1;
    const queuedError = this.deleteErrors.shift();
    if (queuedError) {
      if (
        typeof queuedError === "object" &&
        queuedError !== null &&
        "code" in queuedError &&
        queuedError.code === "WORKLOAD_NOT_FOUND"
      ) {
        this.sandboxes.delete(name);
      }
      throw queuedError;
    }
    this.sandboxes.delete(name);
  }

  async resetDirectory(sandboxName: string, directory: string): Promise<void> {
    const sandbox = this.requireSandbox(sandboxName);
    for (const filePath of sandbox.files.keys()) {
      if (filePath === directory || filePath.startsWith(`${directory}/`)) {
        sandbox.files.delete(filePath);
      }
    }
  }

  async writeFiles(
    sandboxName: string,
    destinationPath: string,
    files: SandboxFile[],
  ): Promise<void> {
    this.projections += 1;
    const sandbox = this.requireSandbox(sandboxName);
    for (const file of files) {
      sandbox.files.set(
        path.posix.join(destinationPath, file.path),
        file.content,
      );
    }
  }

  async readText(sandboxName: string, filePath: string): Promise<string> {
    const value = this.requireSandbox(sandboxName).files.get(filePath);
    if (value === undefined) {
      throw {
        origin: "application",
        code: "FILE_NOT_FOUND",
        retryable: false,
        status: 404,
      };
    }
    if (typeof value !== "string") return new TextDecoder().decode(value);
    return value;
  }

  async readBinary(
    sandboxName: string,
    filePath: string,
  ): Promise<Uint8Array> {
    const value = this.requireSandbox(sandboxName).files.get(filePath);
    if (value === undefined) {
      throw { origin: "application", status: 404 };
    }
    return typeof value === "string" ? new TextEncoder().encode(value) : value;
  }

  async execute(input: CommandInput): Promise<CommandResult> {
    this.executions += 1;
    this.executionInputs.push(input);
    const sandbox = this.requireSandbox(input.sandboxName);

    if (input.command === "npm run typecheck") {
      const app = sandbox.files.get(`${input.workingDirectory}/src/App.tsx`);
      if (typeof app === "string" && app.includes("const accent: string = 42")) {
        return this.result(input.name, 2, "Type 'number' is not assignable to type 'string'.");
      }
    }

    if (input.command === "npm run build") {
      sandbox.files.set(
        `${input.workingDirectory}/dist/index.html`,
        "<main>compiled</main>",
      );
    }

    if (input.command.includes("generated-artifact.tgz")) {
      sandbox.files.set(
        "/tmp/generated-artifact.tgz",
        new TextEncoder().encode("compiled-artifact"),
      );
    }

    return this.result(
      input.name,
      0,
      input.waitForCompletion === false ? "Process started" : "Command completed",
    );
  }

  async createSession(
    sandboxName: string,
    expiresAt: Date,
    _renewalWindowMs: number,
  ): Promise<SessionGrant> {
    this.requireSandbox(sandboxName);
    this.sessions += 1;
    return {
      name: "browser-session",
      url: `https://${sandboxName}.session.example.test`,
      token: "session-token",
      expiresAt,
    };
  }

  async createPreview(input: {
    sandboxName: string;
    name: string;
    port: number;
    public: boolean;
    ttl: string;
    tokenExpiresAt: Date;
  }): Promise<PreviewGrant> {
    this.requireSandbox(input.sandboxName);
    this.previews += 1;
    const url = `https://${input.name}.preview.example.test`;
    return {
      name: input.name,
      url,
      public: input.public,
      requestHeaders: input.public
        ? {}
        : { "X-Blaxel-Preview-Token": "preview-token" },
      ...(input.public
        ? {}
        : {
            token: "preview-token",
            tokenExpiresAt: input.tokenExpiresAt,
          }),
    };
  }

  private requireSandbox(name: string): FakeSandbox {
    const sandbox = this.sandboxes.get(name);
    if (!sandbox) throw new Error(`Sandbox not found: ${name}`);
    return sandbox;
  }

  private result(name: string, exitCode: number, message: string): CommandResult {
    return {
      name,
      exitCode,
      status: exitCode === 0 ? "completed" : "failed",
      logs: message,
      stdout: exitCode === 0 ? message : "",
      stderr: exitCode === 0 ? "" : message,
    };
  }
}
