import "dotenv/config";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BlaxelRuntimeAdapter,
  FileArtifactStore,
  FileProjectStore,
  GeneratedCodeBuildService,
  StaticRepairStrategy,
  SandboxLifecycle,
} from "../src/index.js";
import { SandboxInstance } from "@blaxel/core";
import { loadFixture } from "../examples/load-fixture.js";
import { lifecycleOptionsFromEnvironment } from "../examples/environment.js";
import { waitForPreviewContent } from "./support/preview-content.js";

const describeLive =
  process.env.RUN_BLAXEL_LIVE_TESTS === "1" ? describe : describe.skip;
const projectId = `codegen-live-${Date.now()}`;
const standbyWaitMs = Number(process.env.BL_STANDBY_WAIT_MS ?? "20000");

describeLive("Blaxel live code generation lifecycle", () => {
  let stateRoot = "";
  let lifecycle: SandboxLifecycle;

  afterAll(async () => {
    await lifecycle?.delete(projectId).catch(() => undefined);
    if (stateRoot) await rm(stateRoot, { recursive: true, force: true });
  });

  it(
    "repairs, builds, reconnects, and recovers from replacement",
    async () => {
      stateRoot = await mkdtemp(path.join(os.tmpdir(), "codegen-cookbook-"));
      const projects = new FileProjectStore(path.join(stateRoot, "projects"));
      const artifacts = new FileArtifactStore(path.join(stateRoot, "artifacts"));
      const runtimeConfig = lifecycleOptionsFromEnvironment();

      await projects.save({
        id: projectId,
        revision: 1,
        files: await loadFixture(path.resolve("fixtures/broken-component")),
      });
      const repairedApp = await readFile(
        path.resolve("fixtures/valid-component/src/App.tsx"),
        "utf8",
      );
      const runtime = new BlaxelRuntimeAdapter({ archiveFileThreshold: 1 });
      lifecycle = new SandboxLifecycle(runtime, runtimeConfig);
      const service = new GeneratedCodeBuildService(
        projects,
        artifacts,
        lifecycle,
        new StaticRepairStrategy({ "src/App.tsx": repairedApp }),
      );

      const built = await service.build(projectId);
      expect(built.outcome.ok).toBe(true);
      expect(built.project.revision).toBe(2);
      expect(built.artifactPath).toBeTruthy();
      expect(built.access?.preview.url).toMatch(/^https:\/\//);
      expect(built.access?.preview.public).toBe(false);
      expect(built.access?.preview.token).toBeTruthy();
      await waitForPreviewContent({
        url: built.access!.preview.url,
        requestHeaders: built.access!.preview.requestHeaders,
        expectedText: "Build the product loop. Delegate the execution layer.",
      });

      const browserSandbox = await SandboxInstance.fromSession(
        built.access!.session,
      );
      expect(
        await browserSandbox.fs.read("/workspace/project/.cookbook-revision"),
      ).toBe("2");
      const reusedAccess = await lifecycle.access(projectId);
      expect(reusedAccess.session.name).toBe(built.access?.session.name);

      const identity = await runtime.execute({
        sandboxName: built.outcome.sandboxName,
        name: "verify-non-root",
        command: "id -u",
        workingDirectory: "/workspace/project",
        timeoutSeconds: 60,
      });
      expect(identity.stdout.trim()).not.toBe("0");

      await new Promise((resolve) => setTimeout(resolve, standbyWaitMs));
      const reconnectLifecycle = new SandboxLifecycle(
        new BlaxelRuntimeAdapter({ archiveFileThreshold: 1 }),
        runtimeConfig,
      );
      const retained = await reconnectLifecycle.prepare(
        await projects.load(projectId),
      );
      expect(retained.replaced).toBe(false);
      expect(retained.projected).toBe(false);

      await reconnectLifecycle.delete(projectId);
      const replacement = await reconnectLifecycle.prepare(
        await projects.load(projectId),
      );
      expect(replacement.replaced).toBe(true);
      expect(replacement.projected).toBe(true);
      lifecycle = reconnectLifecycle;
    },
    600_000,
  );
});
