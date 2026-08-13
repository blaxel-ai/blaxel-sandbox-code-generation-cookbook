import "dotenv/config";
import { settings } from "@blaxel/core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { defineConfig, type Plugin } from "vite";
import {
  BlaxelRuntimeAdapter,
  FileArtifactStore,
  FileProjectStore,
  GeneratedCodeBuildService,
  ProjectNotFoundError,
  sandboxConsoleUrl,
  StaticRepairStrategy,
  SandboxLifecycle,
} from "../../src/index.js";
import { loadFixture } from "../load-fixture.js";
import { lifecycleOptionsFromEnvironment } from "../environment.js";

const projectId = "generated-component-demo";
const previewProxyPort = 3001;
const stateRoot = path.resolve(".cookbook-state");
const projects = new FileProjectStore(path.join(stateRoot, "projects"));
const artifacts = new FileArtifactStore(path.join(stateRoot, "artifacts"));
let lifecycle: SandboxLifecycle | undefined;
let previewProxyAccess:
  | { url: string; requestHeaders: Record<string, string> }
  | undefined;

function demoLifecycle(): SandboxLifecycle {
  lifecycle ??= new SandboxLifecycle(
    new BlaxelRuntimeAdapter(),
    lifecycleOptionsFromEnvironment(),
  );
  return lifecycle;
}

async function seedProject(): Promise<void> {
  try {
    await projects.load(projectId);
  } catch (error) {
    if (!(error instanceof ProjectNotFoundError)) throw error;
    await projects.save({
      id: projectId,
      revision: 1,
      files: await loadFixture(path.resolve("fixtures/broken-component")),
    });
  }
}

async function buildService(): Promise<GeneratedCodeBuildService> {
  await seedProject();
  const repairedApp = await readFile(
    path.resolve("fixtures/valid-component/src/App.tsx"),
    "utf8",
  );
  return new GeneratedCodeBuildService(
    projects,
    artifacts,
    demoLifecycle(),
    new StaticRepairStrategy({ "src/App.tsx": repairedApp }),
  );
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

export function previewTargetUrl(baseUrl: string, requestUrl: string): URL {
  const target = new URL(baseUrl);
  const incoming = new URL(requestUrl, "http://preview.local");
  const basePath = target.pathname.endsWith("/")
    ? target.pathname
    : `${target.pathname}/`;

  target.pathname = `${basePath}${incoming.pathname.replace(/^\/+/, "")}`;
  target.search = incoming.search;
  target.hash = "";
  return target;
}

export function fetchPreviewUpstream(
  baseUrl: string,
  requestUrl: string,
  method: string,
  requestHeaders: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return fetcher(previewTargetUrl(baseUrl, requestUrl), {
    method,
    headers: requestHeaders,
    redirect: "manual",
  });
}

async function proxyPreview(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!previewProxyAccess) {
    sendJson(response, 404, { error: "Build the preview first" });
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Preview proxy is read-only" });
    return;
  }

  try {
    const upstream = await fetchPreviewUpstream(
      previewProxyAccess.url,
      request.url ?? "/",
      request.method,
      previewProxyAccess.requestHeaders,
    );
    if (upstream.status >= 300 && upstream.status < 400) {
      sendJson(response, 502, { error: "Preview redirects are not allowed" });
      return;
    }

    response.statusCode = upstream.status;
    for (const header of [
      "cache-control",
      "content-type",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(header);
      if (value) response.setHeader(header, value);
    }
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("Preview proxy request failed", error);
    sendJson(response, 502, { error: "Preview request failed" });
  }
}

function cookbookApi(): Plugin {
  return {
    name: "cookbook-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/build",
        async (request: IncomingMessage, response: ServerResponse) => {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Use POST for this endpoint" });
            return;
          }
          if (request.headers["x-cookbook-action"] !== "build") {
            sendJson(response, 403, { error: "Missing trusted action header" });
            return;
          }

          try {
            const service = await buildService();
            const result = await service.build(projectId);
            previewProxyAccess = result.access
              ? {
                  url: result.access.preview.url,
                  requestHeaders: result.access.preview.requestHeaders,
                }
              : undefined;
            sendJson(
              response,
              200,
              result.access
                ? {
                    ...result,
                    sandboxUrl: sandboxConsoleUrl(
                      settings.workspace,
                      result.outcome.sandboxName,
                    ),
                    access: {
                      session: result.access.session,
                      preview: {
                        name: result.access.preview.name,
                        url: result.access.preview.url,
                        public: result.access.preview.public,
                      },
                    },
                  }
                : result,
            );
          } catch (error) {
            console.error("Build request failed", error);
            sendJson(response, 500, {
              error: "Build request failed. Check the server terminal for details.",
            });
          }
        },
      );

      const previewServer = createServer((request, response) => {
        void proxyPreview(request, response);
      });
      previewServer.listen(previewProxyPort, "127.0.0.1");
      server.httpServer?.once("close", () => previewServer.close());
    },
  };
}

export default defineConfig({
  root: path.resolve("examples/web"),
  plugins: [cookbookApi()],
  server: { port: 3000, cors: false },
});
