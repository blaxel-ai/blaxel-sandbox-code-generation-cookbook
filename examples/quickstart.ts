import "dotenv/config";
import { SandboxInstance, settings } from "@blaxel/core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  isApplicationMissingPath,
  sandboxConsoleUrl,
  sandboxInventoryUrl,
} from "../src/index.js";
import { loadFixture } from "./load-fixture.js";

const sandboxName =
  process.env.BL_QUICKSTART_SANDBOX?.trim() || "codegen-quickstart";
const image =
  process.env.BL_QUICKSTART_IMAGE?.trim() || "blaxel/nextjs:latest";
const region = process.env.BL_REGION?.trim() || "us-pdx-1";
const workingDirectory = "/blaxel/quickstart";
const markerPath = `${workingDirectory}/.quickstart-ready`;
const catalogStatusPath = `${workingDirectory}/src/CatalogStatus.tsx`;
const runId = Date.now().toString(36);

const sandbox = await SandboxInstance.createIfNotExists({
  name: sandboxName,
  image,
  memory: 4096,
  region,
  externalId: sandboxName,
  labels: { "managed-by": "sandboxed-code-generation-quickstart" },
  lifecycle: {
    expirationPolicies: [
      { type: "ttl-idle", value: "24h", action: "delete" },
    ],
  },
});

const retainedMarker = await readOptionalText(markerPath);
const retainedCatalogStatus = await readOptionalText(catalogStatusPath);
const reusableCatalog = Boolean(retainedMarker && retainedCatalogStatus);
const revision = reusableCatalog ? 2 : 1;
const appSource = await readFile(
  path.resolve(
    revision === 1
      ? "fixtures/valid-component/src/App.tsx"
      : "fixtures/updated-component/src/App.tsx",
  ),
  "utf8",
);
const files = reusableCatalog
  ? [{ path: "src/App.tsx", content: appSource }]
  : Object.entries({
      ...(await loadFixture(path.resolve("fixtures/broken-component"))),
      "src/App.tsx": appSource,
    }).map(([path, content]) => ({ path, content }));

const environmentMessage = reusableCatalog
  ? `Returned to ${sandboxName}; the working environment is still here.`
  : retainedMarker
    ? `Returned to ${sandboxName}; preparing the component catalog.`
    : `Created ${sandboxName}; preparing the working environment.`;
console.log(environmentMessage);
console.log(`Generated source revision: ${revision}`);

await sandbox.fs.writeTree(files, workingDirectory);

async function runStep(name: string, command: string, timeout: number) {
  console.log(`\n${name}`);
  const result = await sandbox.process.exec({
    name: `${name}-${runId}`,
    command,
    workingDir: workingDirectory,
    waitForCompletion: true,
    timeout,
    onLog: (line) => console.log(line),
  });
  if (result.exitCode !== 0) {
    throw new Error(`${name} failed:\n${result.stderr || result.logs}`);
  }
}

await runStep(
  "install-dependencies",
  [
    "if test -d node_modules; then",
    "echo 'Dependencies: reused existing node_modules';",
    "elif test -f package-lock.json; then",
    "npm ci --ignore-scripts --no-audit --no-fund",
    "&& echo 'Dependencies: installed into the Sandbox from package-lock.json';",
    "else npm install --ignore-scripts --no-audit --no-fund",
    "&& echo 'Dependencies: installed into the Sandbox without a lockfile'; fi",
  ].join(" "),
  180,
);
await runStep("check-and-build", "npm run typecheck && npm run build", 180);
await sandbox.fs.read(catalogStatusPath);
await sandbox.fs.write(markerPath, String(revision));

await sandbox.process.kill("quickstart-preview").catch(() => undefined);
await sandbox.process.exec({
  name: "quickstart-preview",
  command: "npm run preview -- --host $HOST",
  workingDir: workingDirectory,
  waitForCompletion: false,
  waitForPorts: [4173],
  keepAlive: false,
  timeout: 30,
});

const preview = await sandbox.previews.createIfNotExists({
  metadata: { name: "quickstart-preview" },
  spec: { port: 4173, public: true, ttl: "1h" },
});

console.log(`\nPreview ready: ${preview.spec.url}`);
if (revision === 1) {
  console.log("Revision 1 is live. Open the preview and inspect it before continuing.");
  console.log(
    "After you have seen revision 1, run the quickstart again to apply revision 2 in the same environment.",
  );
} else {
  console.log("Revision 2 rebuilt in the retained Sandbox.");
  console.log("Catalog: updated App.tsx; retained CatalogStatus.tsx.");
}

console.log("\nInspect the proof:");
console.log(`Sandbox in Blaxel: ${sandboxConsoleUrl(settings.workspace, sandboxName)}`);
console.log(`Sandbox inventory in Blaxel: ${sandboxInventoryUrl(settings.workspace)}`);
console.log(`CLI verification: bl get sandbox ${sandboxName}`);
console.log(`Open the Sandbox terminal: bl connect sandbox ${sandboxName}`);
console.log(
  `Inside the Sandbox terminal, run: cat ${markerPath} && test -d ${workingDirectory}/node_modules && test -f ${catalogStatusPath} && echo 'dependencies and sibling component retained'`,
);
console.log("Disconnect from the Sandbox terminal: press Ctrl+D");
console.log("How Sandboxes work: https://docs.blaxel.ai/Sandboxes/Overview");

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await sandbox.fs.read(filePath);
  } catch (error) {
    if (isApplicationMissingPath(error)) return "";
    throw error;
  }
}
