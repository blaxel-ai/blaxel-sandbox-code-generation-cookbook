import { SandboxInstance } from "@blaxel/core";
import { zipSync } from "fflate";
import { randomUUID } from "node:crypto";
import type {
  CommandInput,
  CommandResult,
  PreviewGrant,
  RuntimeAdapter,
  SessionGrant,
  SandboxCreateInput,
  SandboxFile,
  SandboxHandle,
} from "./types.js";

type SandboxSdk = Pick<
  typeof SandboxInstance,
  "get" | "createIfNotExists" | "delete"
>;

export type BlaxelRuntimeAdapterOptions = {
  archiveFileThreshold?: number;
  archiveByteThreshold?: number;
};

const DEFAULT_ARCHIVE_FILE_THRESHOLD = 100;
const DEFAULT_ARCHIVE_BYTE_THRESHOLD = 1024 * 1024;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export class BlaxelRuntimeAdapter implements RuntimeAdapter {
  private readonly sandboxes = new Map<string, SandboxInstance>();
  private readonly archiveFileThreshold: number;
  private readonly archiveByteThreshold: number;

  constructor(
    options: BlaxelRuntimeAdapterOptions = {},
    private readonly sandboxSdk: SandboxSdk = SandboxInstance,
  ) {
    this.archiveFileThreshold =
      options.archiveFileThreshold ?? DEFAULT_ARCHIVE_FILE_THRESHOLD;
    this.archiveByteThreshold =
      options.archiveByteThreshold ?? DEFAULT_ARCHIVE_BYTE_THRESHOLD;
  }

  async connectSandbox(name: string): Promise<SandboxHandle> {
    try {
      const sandbox = await this.sandboxSdk.get(name);
      if (
        sandbox.status === "DELETING" ||
        sandbox.status === "TERMINATED"
      ) {
        throw {
          origin: "platform",
          code: "WORKLOAD_NOT_FOUND",
          retryable: false,
          status: 404,
        };
      }
      if (
        sandbox.status === "FAILED" ||
        sandbox.status === "DEACTIVATED" ||
        sandbox.status === "DEACTIVATING"
      ) {
        throw {
          origin: "platform",
          code: "WORKLOAD_UNAVAILABLE",
          retryable: true,
          status: 503,
        };
      }
      this.sandboxes.set(name, sandbox);
      return this.toHandle(sandbox);
    } catch (error) {
      throw this.normalizeConnectError(error);
    }
  }

  async createSandbox(input: SandboxCreateInput): Promise<SandboxHandle> {
    const sandbox = await this.sandboxSdk.createIfNotExists({
      name: input.name,
      image: input.image,
      memory: input.memoryMb,
      region: input.region,
      lifecycle: { expirationPolicies: input.expirationPolicies },
      externalId: input.externalId,
      ...(input.allowedDomains.length > 0
        ? { network: { proxy: { allowedDomains: input.allowedDomains } } }
        : {}),
      labels: input.labels,
    });
    this.sandboxes.set(input.name, sandbox);
    return this.toHandle(sandbox);
  }

  async deleteSandbox(name: string): Promise<void> {
    await this.sandboxSdk.delete(name);
    this.sandboxes.delete(name);
  }

  async resetDirectory(sandboxName: string, path: string): Promise<void> {
    const normalizedPath = `/${path.split("/").filter(Boolean).join("/")}`;
    if (normalizedPath === "/" || normalizedPath === "/workspace") {
      throw new Error(
        `Refusing to reset protected Sandbox directory: ${normalizedPath}`,
      );
    }
    const sandbox = await this.sandbox(sandboxName);
    await sandbox.fs.rm(normalizedPath, true).catch((error: unknown) => {
      if (!this.isMissingPath(error)) throw error;
    });
    await sandbox.fs.mkdir(normalizedPath);
  }

  async writeFiles(
    sandboxName: string,
    destinationPath: string,
    files: SandboxFile[],
  ): Promise<void> {
    const sandbox = await this.sandbox(sandboxName);
    const byteLength = files.reduce(
      (total, file) => total + Buffer.byteLength(file.content, "utf8"),
      0,
    );
    if (
      files.length < this.archiveFileThreshold &&
      byteLength < this.archiveByteThreshold
    ) {
      await sandbox.fs.writeTree(files, destinationPath);
      return;
    }

    const entries: Record<string, Uint8Array> = {};
    for (const file of files) {
      if (
        file.path.startsWith("/") ||
        file.path.split("/").some((segment) => !segment || segment === "..")
      ) {
        throw new Error(`Archive file path is not allowed: ${file.path}`);
      }
      entries[file.path] = new Uint8Array(Buffer.from(file.content, "utf8"));
    }
    // fflate only writes archives here; extraction happens inside the sandbox with `unzip`.
    const archive = Buffer.from(zipSync(entries, { level: 6 }));

    const archivePath = `/tmp/codegen-projection-${randomUUID()}.zip`;
    await sandbox.fs.writeBinary(archivePath, archive);
    const result = await sandbox.process.exec({
      name: `project-files-${randomUUID()}`,
      command: `archive=${shellQuote(archivePath)}; trap 'rm -f "$archive"' EXIT; unzip -oq "$archive" -d ${shellQuote(destinationPath)}`,
      waitForCompletion: true,
      timeout: 60,
    });
    if (result.exitCode !== 0 || result.status === "failed") {
      throw new Error(`Archive projection failed: ${result.stderr || result.logs}`);
    }
  }

  async readText(sandboxName: string, path: string): Promise<string> {
    return (await this.sandbox(sandboxName)).fs.read(path);
  }

  async readBinary(sandboxName: string, path: string): Promise<Uint8Array> {
    const blob = await (await this.sandbox(sandboxName)).fs.readBinary(path);
    return new Uint8Array(await blob.arrayBuffer());
  }

  async execute(input: CommandInput): Promise<CommandResult> {
    const sandbox = await this.sandbox(input.sandboxName);
    const waitForCompletion = input.waitForCompletion ?? true;
    const requiresPolling = waitForCompletion && input.timeoutSeconds > 60;
    const request = {
      name: input.name,
      command: input.command,
      workingDir: input.workingDirectory,
      ...(requiresPolling ? {} : { timeout: input.timeoutSeconds }),
      waitForCompletion: requiresPolling ? false : waitForCompletion,
      ...(input.waitForPorts ? { waitForPorts: input.waitForPorts } : {}),
      ...(input.keepAlive !== undefined ? { keepAlive: input.keepAlive } : {}),
    };
    let result;
    let processName = input.name;
    try {
      const started = await sandbox.process.exec(request);
      processName = started.name || input.name;
      result = requiresPolling
        ? await sandbox.process.wait(processName, {
            maxWait: input.timeoutSeconds * 1000,
            interval: 1000,
          })
        : started;
    } catch (error) {
      if (waitForCompletion) {
        await sandbox.process.kill(processName).catch(() => undefined);
      }
      throw error;
    }

    return {
      name: result.name,
      exitCode: result.exitCode,
      status: result.status,
      logs: result.logs,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async createSession(
    sandboxName: string,
    expiresAt: Date,
    renewalWindowMs: number,
  ): Promise<SessionGrant> {
    const sandbox = await this.sandbox(sandboxName);
    const session = await sandbox.sessions.createIfExpired(
      { expiresAt },
      renewalWindowMs,
    );
    return {
      name: session.name,
      url: session.url,
      token: session.token,
      expiresAt:
        session.expiresAt instanceof Date
          ? session.expiresAt
          : new Date(session.expiresAt),
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
    const sandbox = await this.sandbox(input.sandboxName);
    const desired = {
      metadata: { name: input.name },
      spec: {
        port: input.port,
        public: input.public,
        ttl: input.ttl,
      },
    };
    let preview = await sandbox.previews.createIfNotExists(desired);
    if (
      preview.spec.port !== input.port ||
      preview.spec.public !== input.public ||
      preview.spec.ttl !== input.ttl
    ) {
      await sandbox.previews.delete(input.name);
      preview = await sandbox.previews.createIfNotExists(desired);
    }
    const url = preview.spec.url;
    if (!url) throw new Error("Preview was created without a URL");

    if (input.public) {
      return {
        name: preview.name,
        url,
        public: true,
        requestHeaders: {},
      };
    }

    const token = await preview.tokens.create(input.tokenExpiresAt);
    return {
      name: preview.name,
      url,
      public: false,
      requestHeaders: { "X-Blaxel-Preview-Token": token.value },
      token: token.value,
      tokenExpiresAt:
        token.expiresAt instanceof Date
          ? token.expiresAt
          : new Date(token.expiresAt),
    };
  }

  private async sandbox(name: string): Promise<SandboxInstance> {
    const existing = this.sandboxes.get(name);
    if (existing) return existing;

    const sandbox = await this.sandboxSdk.get(name);
    this.sandboxes.set(name, sandbox);
    return sandbox;
  }

  private toHandle(sandbox: SandboxInstance): SandboxHandle {
    const handle: SandboxHandle = { name: sandbox.metadata.name };
    if (sandbox.status !== undefined) handle.status = sandbox.status;
    return handle;
  }

  private normalizeConnectError(error: unknown): unknown {
    if (typeof error !== "object" || error === null) return error;
    const record = error as Record<string, unknown>;
    const response =
      typeof record.response === "object" && record.response !== null
        ? (record.response as Record<string, unknown>)
        : undefined;
    const responseData =
      typeof response?.data === "object" && response.data !== null
        ? (response.data as Record<string, unknown>)
        : undefined;
    const nestedError =
      typeof responseData?.error === "object" && responseData.error !== null
        ? (responseData.error as Record<string, unknown>)
        : undefined;
    const structuredCode =
      typeof nestedError?.code === "string"
        ? nestedError.code
        : typeof record.code === "string" && !/^\d+$/.test(record.code)
          ? record.code
          : undefined;
    if (
      structuredCode === "WORKLOAD_NOT_FOUND" ||
      structuredCode === "WORKLOAD_UNAVAILABLE"
    ) {
      return error;
    }

    const status = [record.status, response?.status, record.code]
      .map((value) =>
        typeof value === "string" && /^\d+$/.test(value)
          ? Number(value)
          : value,
      )
      .find((value): value is number => typeof value === "number");

    if (status === 404) {
      return {
        origin: "platform",
        code: "WORKLOAD_NOT_FOUND",
        retryable: false,
        status: 404,
        cause: error,
      };
    }

    if (
      status === 502 ||
      status === 503 ||
      status === 504
    ) {
      return {
        origin: "platform",
        code: "WORKLOAD_UNAVAILABLE",
        retryable: true,
        status,
        cause: error,
      };
    }

    return error;
  }

  private isMissingPath(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const record = error as Record<string, unknown>;
    const response =
      typeof record.response === "object" && record.response !== null
        ? (record.response as Record<string, unknown>)
        : undefined;
    return (
      record.code === 404 ||
      record.status === 404 ||
      response?.status === 404
    );
  }
}
