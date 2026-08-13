export type SandboxHandle = {
  name: string;
  status?: string;
};

export type SandboxCreateInput = {
  name: string;
  image: string;
  memoryMb: number;
  region: string;
  expirationPolicies: SandboxExpirationPolicy[];
  externalId: string;
  allowedDomains: string[];
  labels: Record<string, string>;
};

export type SandboxExpirationPolicy = {
  type: "ttl-idle" | "ttl-max-age";
  value: string;
  action: "delete";
};

export type SandboxFile = {
  path: string;
  content: string;
};

export type CommandInput = {
  sandboxName: string;
  name: string;
  command: string;
  workingDirectory: string;
  timeoutSeconds: number;
  waitForCompletion?: boolean;
  waitForPorts?: number[];
  keepAlive?: boolean;
};

export type CommandResult = {
  name: string;
  exitCode: number;
  status: string;
  logs: string;
  stdout: string;
  stderr: string;
};

export type SessionGrant = {
  name: string;
  url: string;
  token: string;
  expiresAt: Date;
};

export type PreviewGrant = {
  name: string;
  url: string;
  public: boolean;
  requestHeaders: Record<string, string>;
  token?: string;
  tokenExpiresAt?: Date;
};

export interface RuntimeAdapter {
  connectSandbox(name: string): Promise<SandboxHandle>;
  createSandbox(input: SandboxCreateInput): Promise<SandboxHandle>;
  deleteSandbox(name: string): Promise<void>;
  resetDirectory(sandboxName: string, path: string): Promise<void>;
  writeFiles(
    sandboxName: string,
    destinationPath: string,
    files: SandboxFile[],
  ): Promise<void>;
  readText(sandboxName: string, path: string): Promise<string>;
  readBinary(sandboxName: string, path: string): Promise<Uint8Array>;
  execute(input: CommandInput): Promise<CommandResult>;
  createSession(
    sandboxName: string,
    expiresAt: Date,
    renewalWindowMs: number,
  ): Promise<SessionGrant>;
  createPreview(input: {
    sandboxName: string;
    name: string;
    port: number;
    public: boolean;
    ttl: string;
    tokenExpiresAt: Date;
  }): Promise<PreviewGrant>;
}
