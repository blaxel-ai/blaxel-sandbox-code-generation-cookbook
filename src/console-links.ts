const BLAXEL_CONSOLE_ORIGIN = "https://app.blaxel.ai";

export function sandboxConsoleUrl(
  workspace: string,
  sandboxName: string,
): string {
  return `${workspaceConsoleBase(workspace)}/sandbox/${encodeURIComponent(requiredSegment(sandboxName, "Sandbox name"))}`;
}

export function sandboxInventoryUrl(workspace: string): string {
  return `${workspaceConsoleBase(workspace)}/sandboxes`;
}

function workspaceConsoleBase(workspace: string): string {
  return `${BLAXEL_CONSOLE_ORIGIN}/${encodeURIComponent(requiredSegment(workspace, "Workspace"))}/global-agentic-network`;
}

function requiredSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required to build a console link`);
  return normalized;
}
