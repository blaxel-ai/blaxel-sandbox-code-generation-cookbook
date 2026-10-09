import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// axios is not a direct dependency: it is installed because @blaxel/core
// declares it (`axios: ^1.9.0`). @blaxel/core 0.3.11's dist never imports it,
// so no production path in this repo calls axios today. This test loads the
// copy @blaxel/core resolves (not a hoisted phantom from the repo root) and
// proves the bumped version still does a real HTTP round-trip, so a future
// @blaxel/core that does use it gets a working client.
const coreRequire = createRequire(
  path.join(process.cwd(), "node_modules/@blaxel/core/package.json"),
);

describe("axios resolved by @blaxel/core", () => {
  it("is at least 1.20.0 and round-trips a JSON POST over loopback", async () => {
    const version = coreRequire("axios/package.json").version as string;
    const [major = 0, minor = 0] = version.split(".").map(Number);
    expect(major > 1 || (major === 1 && minor >= 20)).toBe(true);

    const axios = coreRequire("axios");
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ method: req.method, echoed: JSON.parse(body) }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await axios.post(`http://127.0.0.1:${port}/echo`, { hello: "sandbox" }, { proxy: false });
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ method: "POST", echoed: { hello: "sandbox" } });
    } finally {
      server.close();
    }
  });
});
