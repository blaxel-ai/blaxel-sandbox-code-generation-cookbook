import { createHash } from "node:crypto";

function slug(value: string): string {
  const replaced = value.toLocaleLowerCase().replace(/[^a-z0-9-]+/g, "-");
  let start = 0;
  let end = replaced.length;

  while (start < end && replaced.charCodeAt(start) === 45) start += 1;
  while (end > start && replaced.charCodeAt(end - 1) === 45) end -= 1;

  const normalized = replaced.slice(start, end).slice(0, 32);

  return normalized || "project";
}

export function sandboxNameForProject(projectId: string): string {
  const digest = createHash("sha256").update(projectId).digest("hex").slice(0, 8);
  return `codegen-${slug(projectId)}-${digest}`;
}

export function previewNameForProject(projectId: string): string {
  const digest = createHash("sha256").update(projectId).digest("hex").slice(0, 8);
  return `preview-${digest}`;
}
