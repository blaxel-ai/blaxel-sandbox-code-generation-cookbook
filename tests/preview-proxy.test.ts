import { describe, expect, it, vi } from "vitest";
import {
  fetchPreviewUpstream,
  previewTargetUrl,
} from "../examples/web/vite.config.js";

describe("previewTargetUrl", () => {
  it("keeps normal preview paths on the configured origin", () => {
    const target = previewTargetUrl(
      "https://private.preview.bl.run/base",
      "/assets/app.js?revision=2",
    );

    expect(target.href).toBe(
      "https://private.preview.bl.run/base/assets/app.js?revision=2",
    );
  });

  it.each([
    "/http://attacker.example/collect",
    "//attacker.example/collect",
    "/https:%2F%2Fattacker.example/collect",
  ])("never resolves an attacker-shaped path off-origin: %s", (requestUrl) => {
    const target = previewTargetUrl(
      "https://private.preview.bl.run/base",
      requestUrl,
    );

    expect(target.origin).toBe("https://private.preview.bl.run");
  });

  it("never forwards the preview header across an automatic redirect", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://attacker.example/collect" },
        }),
    );

    const response = await fetchPreviewUpstream(
      "https://private.preview.bl.run/base",
      "/redirect",
      "GET",
      { "X-Blaxel-Preview-Token": "private-token" },
      fetcher,
    );

    expect(response.status).toBe(302);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://private.preview.bl.run/base/redirect"),
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
