import { SandboxInstance } from "@blaxel/core";
import "./styles.css";

type BuildResponse = {
  project: { id: string; revision: number };
  outcome: {
    ok: boolean;
    sandboxName: string;
    projected: boolean;
    replaced: boolean;
    steps: Array<{
      name: string;
      exitCode: number;
      status: string;
      stderr: string;
    }>;
    failure?: { step: string; result: { stderr: string } };
  };
  artifactPath?: string;
  sandboxUrl?: string;
  access?: {
    session: {
      name: string;
      url: string;
      token: string;
      expiresAt: string;
    };
    preview: { name: string; url: string; public: boolean };
  };
};

const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const state = document.querySelector<HTMLElement>("#state")!;
const log = document.querySelector<HTMLElement>("#log")!;
const preview = document.querySelector<HTMLIFrameElement>("#preview")!;
const placeholder = document.querySelector<HTMLElement>("#preview-placeholder")!;
const sandboxLink = document.querySelector<HTMLAnchorElement>("#sandbox-link")!;

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  state.textContent = "Building";
  log.textContent = "Preparing the retained Sandbox...";
  sandboxLink.hidden = true;
  sandboxLink.removeAttribute("href");

  try {
    const response = await fetch("/api/build", {
      method: "POST",
      headers: { "X-Cookbook-Action": "build" },
    });
    const result = (await response.json()) as BuildResponse & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Build request failed");

    if (!result.outcome.ok || !result.access) {
      state.textContent = "Needs correction";
      log.textContent =
        result.outcome.failure?.result.stderr ?? "The build did not complete.";
      return;
    }

    const sandbox = await SandboxInstance.fromSession({
      ...result.access.session,
      expiresAt: new Date(result.access.session.expiresAt),
    });
    const retainedRevision = await sandbox.fs.read(
      "/workspace/project/.cookbook-revision",
    );

    state.textContent = "Preview ready";
    log.textContent = [
      `Host revision: ${result.project.revision}`,
      `Sandbox revision: ${retainedRevision.trim()}`,
      `Working copy projected: ${result.outcome.projected}`,
      `Replacement created: ${result.outcome.replaced}`,
      `Artifact: ${result.artifactPath}`,
      "Browser connection: scoped Sandbox session; preview proxy token stays on the backend",
    ].join("\n");

    if (result.sandboxUrl) {
      sandboxLink.href = result.sandboxUrl;
      sandboxLink.hidden = false;
    }

    preview.src = "http://127.0.0.1:3001/";
    preview.hidden = false;
    placeholder.hidden = true;
  } catch (error) {
    state.textContent = "Stopped";
    log.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    runButton.disabled = false;
  }
});
