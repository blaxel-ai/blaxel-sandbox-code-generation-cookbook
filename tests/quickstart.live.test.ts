import "dotenv/config";
import { SandboxInstance } from "@blaxel/core";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { waitForPreviewContent } from "./support/preview-content.js";

const describeLive =
  process.env.RUN_BLAXEL_QUICKSTART_TESTS === "1" ? describe : describe.skip;
const sandboxName = `codegen-quickstart-test-${randomUUID().slice(0, 8)}`;
const execFileAsync = promisify(execFile);

async function runQuickstart(): Promise<string> {
  const result = await execFileAsync("npm", ["run", "quickstart"], {
    cwd: process.cwd(),
    env: { ...process.env, BL_QUICKSTART_SANDBOX: sandboxName },
    maxBuffer: 5 * 1024 * 1024,
    timeout: 300_000,
  });
  return `${result.stdout}\n${result.stderr}`;
}

function previewUrl(output: string): string {
  const match = output.match(/Preview ready: (https:\/\/\S+)/);
  if (!match?.[1]) throw new Error("Quickstart did not print a preview URL");
  return match[1];
}

describeLive("quickstart retained Sandbox lifecycle", () => {
  afterAll(async () => {
    await SandboxInstance.delete(sandboxName).catch(() => undefined);
  });

  it(
    "installs once, reuses dependencies, and serves both revisions at one URL",
    async () => {
      const first = await runQuickstart();
      expect(first).toContain(`Created ${sandboxName}`);
      expect(first).toContain("Generated source revision: 1");
      expect(first).toContain(
        "Dependencies: installed into the Sandbox from package-lock.json",
      );
      expect(first).toContain("✓ built in");
      const firstUrl = previewUrl(first);
      await waitForPreviewContent({
        url: firstUrl,
        requestHeaders: {},
        expectedText: "Build the product loop. Delegate the execution layer.",
      });

      const second = await runQuickstart();
      expect(second).toContain(`Returned to ${sandboxName}`);
      expect(second).toContain("Generated source revision: 2");
      expect(second).toContain("Dependencies: reused existing node_modules");
      expect(second).toContain(
        "Catalog: updated App.tsx; retained CatalogStatus.tsx.",
      );
      expect(second).toContain("✓ built in");
      const secondUrl = previewUrl(second);
      expect(secondUrl).toBe(firstUrl);
      await waitForPreviewContent({
        url: secondUrl,
        requestHeaders: {},
        expectedText: "The next edit shipped from the same Sandbox.",
      });

      const sandbox = await SandboxInstance.get(sandboxName);
      expect(
        await sandbox.fs.read("/blaxel/quickstart/.quickstart-ready"),
      ).toBe("2");
      const retainedDependencies = await sandbox.process.exec({
        name: "verify-retained-dependencies",
        command: "test -d node_modules",
        workingDir: "/blaxel/quickstart",
        waitForCompletion: true,
        timeout: 30,
      });
      expect(retainedDependencies.exitCode).toBe(0);
      expect(
        await sandbox.fs.read("/blaxel/quickstart/src/CatalogStatus.tsx"),
      ).toContain("Shared catalog component retained across edits.");
    },
    600_000,
  );
});
