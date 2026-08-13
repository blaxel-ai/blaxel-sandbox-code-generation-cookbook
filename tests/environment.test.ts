import { afterEach, describe, expect, it, vi } from "vitest";
import { lifecycleOptionsFromEnvironment } from "../examples/environment.js";

describe("example environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires an explicitly built Sandbox image", () => {
    vi.stubEnv("BL_SANDBOX_IMAGE", "");

    expect(() => lifecycleOptionsFromEnvironment()).toThrow(
      "BL_SANDBOX_IMAGE is required",
    );
  });

  it("uses private previews, idle expiration, and a narrow session renewal window", () => {
    vi.stubEnv("BL_SANDBOX_IMAGE", "workspace/codegen-runtime:version");
    vi.stubEnv("BL_SANDBOX_MAX_AGE", "");
    vi.stubEnv("BL_PREVIEW_PUBLIC", "false");

    const config = lifecycleOptionsFromEnvironment();

    expect(config.previewPublic).toBe(false);
    expect(config.expirationPolicies).toEqual([
      { type: "ttl-idle", value: "7d", action: "delete" },
    ]);
    expect(config.sessionDurationMs).toBe(10 * 60 * 1000);
    expect(config.sessionRenewalWindowMs).toBe(60 * 1000);
  });

  it("accepts an explicit maximum age and optional proxy domains", () => {
    vi.stubEnv("BL_SANDBOX_IMAGE", "workspace/codegen-runtime:version");
    vi.stubEnv("BL_SANDBOX_MAX_AGE", "30d");
    vi.stubEnv(
      "BL_SANDBOX_ALLOWED_DOMAINS",
      "registry.npmjs.org, github.com",
    );

    const config = lifecycleOptionsFromEnvironment();

    expect(config.expirationPolicies).toEqual([
      { type: "ttl-idle", value: "7d", action: "delete" },
      { type: "ttl-max-age", value: "30d", action: "delete" },
    ]);
    expect(config.allowedDomains).toEqual(["registry.npmjs.org", "github.com"]);
  });

  it("rejects a renewal window that is as long as the session", () => {
    vi.stubEnv("BL_SANDBOX_IMAGE", "workspace/codegen-runtime:version");
    vi.stubEnv("BL_SESSION_MINUTES", "1");
    vi.stubEnv("BL_SESSION_RENEWAL_SECONDS", "60");

    expect(() => lifecycleOptionsFromEnvironment()).toThrow(
      "BL_SESSION_RENEWAL_SECONDS",
    );
  });
});
