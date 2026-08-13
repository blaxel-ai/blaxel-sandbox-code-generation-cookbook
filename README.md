# Sandboxed code generation cookbook

[![CI](https://github.com/blaxel-ai/blaxel-sandbox-code-generation-cookbook/actions/workflows/ci.yml/badge.svg)](https://github.com/blaxel-ai/blaxel-sandbox-code-generation-cookbook/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Generated code becomes a product feature when it can run somewhere: files, dependencies, commands, build output, and a preview that survives the next edit.

This cookbook starts with that loop in one Blaxel Sandbox. Run it once to build a small component catalog. Run it again to update one component in the same working environment without reinstalling dependencies or replacing its sibling component. Then use the production reference when the application needs durable source revisions, private previews, scoped browser access, recovery, and a reviewed runtime image.

## Get to a preview

Prerequisites:

- Node.js 20.19–20.x, or Node.js 22.12 or later
- a [Blaxel account](https://app.blaxel.ai/login?mode=signup&utm_source=github&utm_medium=referral&utm_campaign=sandboxed_code_generation_cookbook)
- the [Blaxel CLI](https://docs.blaxel.ai/cli-reference/introduction) authenticated with `bl login`

Install the repository and run the quickstart:

```bash
npm install
bl login
npm run quickstart
```

For service authentication, copy `.env.example` to `.env` and set `BL_WORKSPACE` and `BL_API_KEY` instead.

The quickstart uses the official `blaxel/nextjs:latest` Hub image. `BL_QUICKSTART_IMAGE` can override it when another compatible image is required. The generated fixture includes a lockfile so its dependency graph remains repeatable. The quickstart:

1. Creates or reconnects to `codegen-quickstart` with `createIfNotExists`.
2. Writes a small generated React component catalog into the Sandbox.
3. Streams dependency, type-check, and build output as it runs.
4. Starts a preview and prints the URL.
5. Leaves the working environment available for the next run.

Open the printed preview before continuing. Revision 1 stays live at that URL until the next invocation, so this is the moment to inspect it or capture a screenshot. After you have seen revision 1, run `npm run quickstart` again. The revision marker, `node_modules`, and `CatalogStatus.tsx` are still in the Sandbox. The second run writes only the new `App.tsx`, then rebuilds against the retained catalog and dependencies.

In a fresh Sandbox, the first run builds revision 1 and reports that dependencies were installed. The second run applies a visible revision 2 in the same Sandbox and reports that `node_modules` and the sibling catalog component were retained. Both runs print a clickable preview, a direct link to the retained Sandbox in Blaxel, a Sandbox inventory link, and CLI and terminal verification commands.

The output ends with a proof trail shaped like this:

```text
Created codegen-quickstart; preparing the working environment.
Generated source revision: 1
Dependencies: installed into the Sandbox from package-lock.json
Preview ready: https://...
Revision 1 is live. Open the preview and inspect it before continuing.
After you have seen revision 1, run the quickstart again to apply revision 2 in the same environment.

Inspect the proof:
Sandbox in Blaxel: https://app.blaxel.ai/<workspace>/global-agentic-network/sandbox/codegen-quickstart
Sandbox inventory in Blaxel: https://app.blaxel.ai/<workspace>/global-agentic-network/sandboxes
CLI verification: bl get sandbox codegen-quickstart
Open the Sandbox terminal: bl connect sandbox codegen-quickstart
Inside the Sandbox terminal, run: cat /blaxel/quickstart/.quickstart-ready && test -d /blaxel/quickstart/node_modules && test -f /blaxel/quickstart/src/CatalogStatus.tsx && echo 'dependencies and sibling component retained'
Disconnect from the Sandbox terminal: press Ctrl+D
How Sandboxes work: https://docs.blaxel.ai/Sandboxes/Overview
```

`bl connect sandbox` opens an interactive terminal session, similar to SSH. After it connects, paste the printed check command. It should report the current revision marker and `dependencies and sibling component retained`; press `Ctrl+D` to return to the local terminal.

On the second run, the opening lines change to:

```text
Returned to codegen-quickstart; the working environment is still here.
Generated source revision: 2
Dependencies: reused existing node_modules
Revision 2 rebuilt in the retained Sandbox.
Catalog: updated App.tsx; retained CatalogStatus.tsx.
```

The quickstart preview is public because the fixture contains no private source, credentials, or data. The production reference below uses a private preview and keeps its token on the backend.

### Map one application environment to one Sandbox

The quickstart derives one Sandbox identity for the application environment, not one identity per generated component. Components inside that environment share the working tree, installed dependencies, build tools, and preview process. In an integrating product, use a host-owned project or environment ID for the Sandbox mapping and keep component IDs inside the source tree.

If several agent operations can write to the same component catalog concurrently, the application must serialize those writes or add distributed ownership and idempotency. Shared Sandbox state provides common working context, but it does not resolve conflicting writes for the application.

To connect a product interface directly to the retained Sandbox without exposing Blaxel credentials, run the [browser example](#run-the-browser-example). It issues a scoped [Client-side Session](https://docs.blaxel.ai/Sandboxes/Sessions) from the backend.

## Clean up the retained Sandbox

The quickstart Sandbox has a 24-hour idle cleanup policy. To remove it immediately, use the exact name printed by the example and review it before deletion:

```bash
bl get sandbox <sandbox-name>
bl delete sandbox <sandbox-name>
```

Sandbox deletion is permanent and removes its retained working environment. The example does not run this cleanup automatically. Set `BL_QUICKSTART_SANDBOX` when a different name is needed.

## Run with your AI coding harness

If you use Claude Code, Codex, ChatGPT Work, or another AI coding assistant with access to this repository and a terminal, open the repository as its workspace and paste the following prompt:

```text
Review this repository and help me experience the smallest Sandboxed code generation lifecycle.

1. Read README.md and examples/quickstart.ts before acting. Do not change the source files.
2. Check that Node.js 20.19–20.x or Node.js 22.12 or later and the Blaxel CLI are installed, `bl` is authenticated, and the target region defaults to `us-pdx-1`. Never ask me to paste credentials or print them in commands or logs.
3. Explain that the quickstart creates or reconnects to one retained Sandbox and creates a one-hour public preview for a reviewed, non-sensitive fixture. It does not create an Agent Drive.
4. Check whether the default `codegen-quickstart` Sandbox already exists. If it does, do not delete it; choose one new bounded `BL_QUICKSTART_SANDBOX` name and report it. Preserve that exact name across both stages by running each invocation as `BL_QUICKSTART_SANDBOX=<chosen-name> npm run quickstart`. Install dependencies with `npm install`.
5. Stage 1: run the quickstart exactly once. Verify revision 1, successful type-check and build output, dependency installation, and the preview text `Build the product loop. Delegate the execution layer.` Open the preview in a browser so I can visually inspect it. If browser capture is available, capture revision 1 as visual evidence.
6. Return a concise revision 1 checkpoint with the relevant terminal lines, the clickable preview, the retained Sandbox link, the exact Sandbox name, and the revision 1 capture when available. Explain that revision 1 will stay live until the next invocation. Then stop and ask me to inspect it and reply `continue`. Do not run the second invocation in the same turn.
7. Stage 2 begins only after I explicitly reply `continue`: run the quickstart exactly once more using the same Sandbox name. Verify revision 2, `Dependencies: reused existing node_modules`, `Catalog: updated App.tsx; retained CatalogStatus.tsx.`, the same preview URL, and the updated preview text `The next edit shipped from the same Sandbox.` Open the updated preview in a browser. If browser capture is available, capture revision 2 and present the before-and-after visual evidence.
8. Before ending the second stage, perform the retained-state verification yourself. Use the printed `bl connect sandbox <sandbox-name>` command to open an interactive Sandbox terminal, run the printed check command, record the revision marker and `dependencies and sibling component retained` output, and press `Ctrl+D` to disconnect. Do not merely tell me to run the check. In the response, report the result and include a clearly labeled optional manual sequence with the connect command, the command to run after connecting, and the disconnect step.
9. End the second stage with a concise proof trail. Quote the relevant build and retained-state terminal lines, include the clickable preview and the printed links for the retained Sandbox and Sandbox inventory, include the exact `bl get sandbox` command, and link to the Sandbox documentation. Explain what each proof point establishes without claiming that the console alone proves the generated preview content.
10. Explain the aha moment in plain language: one component changed, while its sibling component, installed dependencies, and working environment stayed in the same Sandbox. The next build used the retained catalog instead of starting from an empty machine.
11. If anything fails, identify the exact missing prerequisite and give me the smallest next action. Do not run the production example, browser example, custom-image push, Docker checks, or opt-in live tests, and do not delete the Sandbox unless I ask.
```

## The execution loop in native SDK calls

The complete runnable example is [examples/quickstart.ts](examples/quickstart.ts). Its core path uses the Blaxel SDK directly:

```ts
const sandbox = await SandboxInstance.createIfNotExists({
  name: "codegen-quickstart",
  image: "blaxel/nextjs:latest",
  memory: 4096,
  region: "us-pdx-1",
});

await sandbox.fs.writeTree(files, "/blaxel/quickstart");

await sandbox.process.exec({
  name: "check-and-build",
  command: "npm run typecheck && npm run build",
  workingDir: "/blaxel/quickstart",
  waitForCompletion: true,
  onLog: (line) => console.log(line),
});

const preview = await sandbox.previews.createIfNotExists({
  metadata: { name: "quickstart-preview" },
  spec: { port: 4173, public: true, ttl: "1h" },
});
```

The product still owns generated source, the agent or model loop, user authorization, and how the result appears in the interface. Blaxel supplies the working environment and its filesystem, processes, lifecycle, and preview routing.

## From quickstart to production adaptation

The rest of this repository shows how a product team can add production boundaries without changing that execution loop.

| Concern | Quickstart | Production reference |
| --- | --- | --- |
| Source | Local fixture | Host-owned `ProjectStore` with durable revisions |
| Runtime | Official Hub image | Explicit custom image with a non-root workload user |
| Files | Full catalog projection, then one component update | `writeTree` for small projects and archive projection for larger trees |
| Build output | Streams to the terminal | Structured step results for the repair strategy and product |
| Preview | Public, non-sensitive fixture | Private preview token transported by a backend proxy |
| Browser access | Not needed | Time-limited session scoped to one Sandbox |
| Recovery | Idempotent reconnect | Error-origin classification, bounded retry, replacement, and rehydration |
| Cleanup | 24-hour quickstart cleanup policy | Application-selected policy plus cleanup reconciliation |

Read [the architecture](docs/architecture.md) for the responsibility boundary and [lifecycle and errors](docs/lifecycle-and-errors.md) for recovery behavior.

## Run the production reference

The production reference requires the custom image in `images/codegen/`. It includes Node.js, the build toolchain, archive utilities, and the Sandbox API. Workload processes and filesystem operations run as the non-root `builder` user.

Push it with the Blaxel CLI:

```bash
cd images/codegen
bl push --yes
```

Set `BL_SANDBOX_IMAGE` in `.env` to the returned image reference, then run:

```bash
npm run example
```

The example starts with a TypeScript error, saves the fixture as host-owned revision 1, and projects it into a Sandbox. It returns the build output to a deterministic repair strategy, saves revision 2, rebuilds in the retained environment, exports the artifact, and creates private preview access.

The CLI prints the private preview resource URL but deliberately does not print its token, so that URL is not a directly clickable preview. Run the browser example for the safe, backend-proxied viewing path. The CLI also prints a direct Blaxel link and verification command for the retained Sandbox.

`StaticRepairStrategy` keeps the infrastructure example runnable without a model provider. Replace it with the agent or model loop used by the host product.

If Docker is available locally, `make -C images/codegen test` verifies the image user and toolchain before it is pushed. Pin, scan, and sign the built image according to the organization’s release policy.

## Run the browser example

```bash
npm run example:web
```

Open `http://localhost:3000` and run the build loop. The backend owns Blaxel credentials, Sandbox creation, source revisioning, preview creation, and access-token issuance. The browser receives a scoped Sandbox session for file operations and shows a direct link to inspect the retained Sandbox in Blaxel.

A read-only proxy on the separate `http://127.0.0.1:3001` origin sends the private preview token in the documented header, rejects redirects, and keeps generated code off the trusted UI origin.

The local backend has no application authentication. Keep the demo local. A production backend must authorize the user and project before issuing either credential.

## What the production reference demonstrates

- Durable source remains in a host-side `ProjectStore`.
- A deterministic Sandbox name reconnects each project to its working environment. The external ID records the application mapping on the Sandbox.
- The current source revision is projected only when the working copy is missing or stale.
- Build failures remain code failures and do not reset a healthy working environment.
- Commands longer than the synchronous wait ceiling start asynchronously and use the process wait API.
- A successful build returns a packaged artifact to the host.
- A backend can issue a time-limited Sandbox session and private preview token without exposing workspace credentials.
- Temporary workload unavailability receives the full bounded retry window. A missing Sandbox is replaced and rehydrated from host-owned source.
- The supplied runtime image executes generated code as a non-root workload user.

This is the build-versus-buy boundary demonstrated by the repository: the application owns product semantics and authorization; Blaxel provides the execution primitives underneath them.

## Run the tests

The default suite does not need Blaxel credentials and does not create cloud resources.

```bash
npm run check
```

The opt-in live checks exercise the quickstart, pushed image, and complete lifecycle:

```bash
npm run test:live:quickstart
npm run test:live:image
npm run test:live
```

Repository maintainers can also run the manually dispatched **Live validation** GitHub Actions workflow and select the quickstart, image, lifecycle, or complete suite. The workflow requires `BL_WORKSPACE` and `BL_API_KEY` repository secrets. Image and lifecycle checks also require `BL_SANDBOX_IMAGE` as a repository secret or variable; `BL_REGION` can be supplied as a repository variable.

See the [latest recorded live verification](verification/live-quickstart-2026-08-13.md) for its exact scope, result, and cleanup evidence.

The quickstart live test runs the actual entrypoint twice in one uniquely named test Sandbox. It verifies dependency and sibling-component retention, both generated revisions at one preview URL, and deletes only its own test resource afterward. The production lifecycle test covers archive projection, the asynchronous process path, build and repair, expected private preview content, scoped sessions, retained state after the idle window, replacement, rehydration, and cleanup.

Blaxel does not expose a start or stop API for standby, so the automated test verifies retained state after the documented idle window without claiming to observe the transition itself.

## Use the production lifecycle in an application

```ts
import {
  BlaxelRuntimeAdapter,
  SandboxLifecycle,
} from "./src/index.js";

const lifecycle = new SandboxLifecycle(new BlaxelRuntimeAdapter(), {
  image: process.env.BL_SANDBOX_IMAGE!,
  region: "us-pdx-1",
  expirationPolicies: [
    { type: "ttl-idle", value: "7d", action: "delete" },
  ],
});

const result = await lifecycle.build({
  id: "project-123",
  revision: 7,
  files: {
    "package.json": packageJson,
    "src/App.tsx": generatedComponent,
  },
});
```

Keep project IDs, build commands, working directories, network rules, and expiration policies under trusted orchestration control. The lifecycle validates projected file paths, but generated package scripts and project commands are still untrusted code. The default installer disables package lifecycle scripts, and the supplied image limits workload privileges.

## Lifecycle and recovery

| State | System behavior | What the builder gets |
| --- | --- | --- |
| First build | Create the working environment and project source | A working preview without assembling the execution stack |
| Code failure | Preserve the environment and return build output | Current edits remain available while the code is corrected |
| Standby | Release active connections and retain Sandbox state | Work continues from the same project on return |
| Temporarily unavailable | Retry for the full bounded window | The existing environment gets a recovery window before replacement |
| Sandbox missing | Create a replacement and project the latest host revision | The latest saved work returns in a new environment |
| Invalid path or request | Return the application error without replacement | The request can be corrected without destroying healthy state |
| Successful build | Export the artifact and issue private preview access | The result becomes inspectable and reusable in the host product |

## Readiness boundary

The quickstart is an activation example. The larger implementation is a production reference, not a production framework.

It deliberately leaves application authentication, distributed lifecycle ownership, the product database, model orchestration, external observability, and cleanup reconciliation to the integrating product. These are application responsibilities rather than capabilities that the quickstart asks Blaxel to replace.

Review [security boundaries](docs/security-boundaries.md), [the runtime image](docs/runtime-image.md), and [production adaptation](docs/production-adaptation.md) before using the reference in a multi-tenant product.

## References

- [Sandboxes overview](https://docs.blaxel.ai/Sandboxes/Overview)
- [Code generation tools](https://docs.blaxel.ai/Sandboxes/Codegen-tools)
- [Client-side sessions](https://docs.blaxel.ai/Sandboxes/Sessions)
- [Sandbox best practices](https://docs.blaxel.ai/Sandboxes/best-practices)

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Report suspected vulnerabilities through the private process in [SECURITY.md](SECURITY.md), not through a public issue.
- [Expiration policies](https://docs.blaxel.ai/Sandboxes/Expiration)
- [Processes and commands](https://docs.blaxel.ai/Sandboxes/Processes)
- [Log streaming](https://docs.blaxel.ai/Sandboxes/Log-streaming)
- [File system operations](https://docs.blaxel.ai/Sandboxes/Filesystem)
- [Preview URLs](https://docs.blaxel.ai/Sandboxes/Preview-url)
- [Sandbox images](https://docs.blaxel.ai/Sandboxes/Templates)
- [Non-root workloads](https://docs.blaxel.ai/Sandboxes/Non-root-user)
- [Standby control](https://docs.blaxel.ai/Sandboxes/Standby-control)
- [Blaxel TypeScript SDK](https://github.com/blaxel-ai/sdk-typescript)
