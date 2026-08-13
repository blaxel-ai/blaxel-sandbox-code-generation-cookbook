export type RuntimeErrorDetails = {
  code?: string;
  origin?: string;
  retryable?: boolean;
  status?: number;
};

export type ErrorDisposition =
  | "retry"
  | "replace-sandbox"
  | "correct-request"
  | "fail";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : undefined;
}

function firstString(records: UnknownRecord[], key: string): string | undefined {
  for (const record of records) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function firstBoolean(
  records: UnknownRecord[],
  key: string,
): boolean | undefined {
  for (const record of records) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function firstNumber(records: UnknownRecord[], key: string): number | undefined {
  for (const record of records) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

export function runtimeErrorDetails(error: unknown): RuntimeErrorDetails {
  const root = asRecord(error);
  if (!root) return {};

  const response = asRecord(root.response);
  const responseData = asRecord(response?.data);
  const nestedError = asRecord(responseData?.error) ?? asRecord(root.error);
  const records = [root, response ?? {}, responseData ?? {}, nestedError ?? {}];

  const details: RuntimeErrorDetails = {};
  const code = firstString(records, "code");
  const origin = firstString(records, "origin");
  const retryable = firstBoolean(records, "retryable");
  const status =
    firstNumber(records, "status") ?? firstNumber(records, "statusCode");

  if (code !== undefined) details.code = code;
  if (origin !== undefined) details.origin = origin;
  if (retryable !== undefined) details.retryable = retryable;
  if (status !== undefined) details.status = status;
  return details;
}

export function classifyRuntimeError(error: unknown): ErrorDisposition {
  const details = runtimeErrorDetails(error);

  if (
    (details.origin !== undefined && details.origin !== "platform") ||
    (details.status === 404 &&
      details.origin !== "platform" &&
      details.code !== "WORKLOAD_NOT_FOUND" &&
      details.code !== "WORKLOAD_UNAVAILABLE")
  ) {
    return "correct-request";
  }

  if (details.code === "WORKLOAD_NOT_FOUND") {
    return "replace-sandbox";
  }

  if (details.code === "WORKLOAD_UNAVAILABLE") {
    return "retry";
  }

  if (details.status === 401 || details.status === 403) {
    return "fail";
  }

  if (details.retryable === true) {
    return "retry";
  }

  return "fail";
}

export function isApplicationMissingPath(error: unknown): boolean {
  const details = runtimeErrorDetails(error);
  return details.status === 404 && details.origin !== "platform";
}
