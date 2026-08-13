import type {
  SandboxExpirationPolicy,
  SandboxLifecycleOptions,
} from "../src/index.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required. Build and push images/codegen, then use the returned image reference.`,
    );
  }
  return value;
}

function expirationPolicies(): SandboxExpirationPolicy[] {
  const policies: SandboxExpirationPolicy[] = [
    {
      type: "ttl-idle",
      value: process.env.BL_SANDBOX_IDLE_TTL?.trim() || "7d",
      action: "delete",
    },
  ];
  const maximumAge = process.env.BL_SANDBOX_MAX_AGE?.trim();
  if (maximumAge) {
    policies.push({ type: "ttl-max-age", value: maximumAge, action: "delete" });
  }
  return policies;
}

export function lifecycleOptionsFromEnvironment(): SandboxLifecycleOptions {
  const sessionDurationMs =
    Number(process.env.BL_SESSION_MINUTES ?? "10") * 60 * 1000;
  const sessionRenewalWindowMs =
    Number(process.env.BL_SESSION_RENEWAL_SECONDS ?? "60") * 1000;
  if (!Number.isFinite(sessionDurationMs) || sessionDurationMs <= 0) {
    throw new Error("BL_SESSION_MINUTES must be a positive number");
  }
  if (
    !Number.isFinite(sessionRenewalWindowMs) ||
    sessionRenewalWindowMs < 0 ||
    sessionRenewalWindowMs >= sessionDurationMs
  ) {
    throw new Error(
      "BL_SESSION_RENEWAL_SECONDS must be non-negative and shorter than the session duration",
    );
  }

  return {
    region: process.env.BL_REGION?.trim() || "us-pdx-1",
    image: requiredEnvironment("BL_SANDBOX_IMAGE"),
    expirationPolicies: expirationPolicies(),
    allowedDomains: (process.env.BL_SANDBOX_ALLOWED_DOMAINS ?? "")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean),
    previewPublic: process.env.BL_PREVIEW_PUBLIC === "true",
    sessionDurationMs,
    sessionRenewalWindowMs,
  };
}
