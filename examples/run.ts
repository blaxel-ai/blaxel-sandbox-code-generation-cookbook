import "dotenv/config";
import { settings } from "@blaxel/core";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  BlaxelRuntimeAdapter,
  FileArtifactStore,
  FileProjectStore,
  GeneratedCodeBuildService,
  ProjectNotFoundError,
  sandboxConsoleUrl,
  sandboxInventoryUrl,
  StaticRepairStrategy,
  SandboxLifecycle,
} from "../src/index.js";
import { loadFixture } from "./load-fixture.js";
import { lifecycleOptionsFromEnvironment } from "./environment.js";

const stateRoot = path.resolve(".cookbook-state");
const projectId = "generated-component-demo";
const projectStore = new FileProjectStore(path.join(stateRoot, "projects"));
const artifactStore = new FileArtifactStore(path.join(stateRoot, "artifacts"));

await mkdir(stateRoot, { recursive: true });

try {
  await projectStore.load(projectId);
} catch (error) {
  if (!(error instanceof ProjectNotFoundError)) throw error;
  await projectStore.save({
    id: projectId,
    revision: 1,
    files: await loadFixture(path.resolve("fixtures/broken-component")),
  });
}

const repairedApp = await readFile(
  path.resolve("fixtures/valid-component/src/App.tsx"),
  "utf8",
);
const lifecycle = new SandboxLifecycle(
  new BlaxelRuntimeAdapter(),
  lifecycleOptionsFromEnvironment(),
);
const service = new GeneratedCodeBuildService(
  projectStore,
  artifactStore,
  lifecycle,
  new StaticRepairStrategy({ "src/App.tsx": repairedApp }),
);

const result = await service.build(projectId);

if (!result.outcome.ok) {
  console.error(result.outcome.failure.result.stderr);
  process.exitCode = 1;
} else {
  console.log(`Revision ${result.project.revision} passed all checks.`);
  console.log(`Artifact: ${result.artifactPath}`);
  console.log(`Private preview resource: ${result.access?.preview.url}`);
  console.log(
    "The preview token is not logged, so this URL is not directly openable from the CLI.",
  );
  console.log("Run npm run example:web for the backend-proxied viewing path.");
  console.log("The Sandbox remains available until its expiration policy applies.");
  console.log("\nInspect the retained Sandbox:");
  console.log(
    `Sandbox in Blaxel: ${sandboxConsoleUrl(settings.workspace, result.outcome.sandboxName)}`,
  );
  console.log(`Sandbox inventory in Blaxel: ${sandboxInventoryUrl(settings.workspace)}`);
  console.log(`CLI verification: bl get sandbox ${result.outcome.sandboxName}`);
}
