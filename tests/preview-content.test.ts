import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForPreviewContent } from "./support/preview-content.js";

afterEach(() => vi.unstubAllGlobals());

describe("preview content verification", () => {
  it("finds expected generated text in a same-origin script bundle", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<script type="module" src="/assets/app.js"></script>'),
      )
      .mockResolvedValueOnce(
        new Response("Build the product loop. Delegate the execution layer."),
      );
    vi.stubGlobal("fetch", fetcher);

    await waitForPreviewContent({
      url: "https://private.preview.bl.run/",
      requestHeaders: { "X-Blaxel-Preview-Token": "private-token" },
      expectedText: "Build the product loop. Delegate the execution layer.",
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL("https://private.preview.bl.run/assets/app.js"),
      expect.objectContaining({
        headers: { "X-Blaxel-Preview-Token": "private-token" },
        redirect: "manual",
      }),
    );
  });

  it("never sends preview headers to a cross-origin script", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response('<script src="https://attacker.example/app.js"></script>'),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      waitForPreviewContent({
        url: "https://private.preview.bl.run/",
        requestHeaders: { "X-Blaxel-Preview-Token": "private-token" },
        expectedText: "expected text",
        timeoutMs: 1,
      }),
    ).rejects.toThrow("Preview referenced a cross-origin script");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
