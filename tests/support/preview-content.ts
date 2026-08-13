const transientStatuses = new Set([404, 502, 503, 504]);

export async function waitForPreviewContent(input: {
  url: string;
  requestHeaders: Record<string, string>;
  expectedText: string;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (input.timeoutMs ?? 15_000);
  let lastDetail = "no response";

  do {
    try {
      const response = await fetch(input.url, {
        headers: input.requestHeaders,
        redirect: "manual",
      });
      if (response.ok) {
        const html = await response.text();
        const content = [html];
        const previewOrigin = new URL(input.url).origin;
        const sources = Array.from(
          html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g),
          (match) => match[1],
        );

        for (const source of sources) {
          if (!source) continue;
          const assetUrl = new URL(source, input.url);
          if (assetUrl.origin !== previewOrigin) {
            throw new Error(
              `Preview referenced a cross-origin script: ${assetUrl.origin}`,
            );
          }
          const asset = await fetch(assetUrl, {
            headers: input.requestHeaders,
            redirect: "manual",
          });
          if (!asset.ok) {
            lastDetail = `${asset.status} while loading ${assetUrl.pathname}`;
            continue;
          }
          content.push(await asset.text());
        }

        if (content.join("\n").includes(input.expectedText)) return;
        lastDetail = "preview responded without the expected generated text";
      } else {
        lastDetail = `${response.status} ${await response.text()}`;
        if (!transientStatuses.has(response.status)) break;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Preview referenced a cross-origin script:")
      ) {
        throw error;
      }
      lastDetail = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (Date.now() < deadline);

  throw new Error(`Preview content did not become ready: ${lastDetail}`);
}
