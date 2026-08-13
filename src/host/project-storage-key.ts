import { createHash } from "node:crypto";

export function projectStorageKey(projectId: string): string {
  const readable = readableProjectId(projectId);
  const digest = createHash("sha256").update(projectId).digest("hex").slice(0, 12);

  return `${readable}-${digest}`;
}

function readableProjectId(projectId: string): string {
  let readable = "";

  for (const character of projectId) {
    if (readable.length >= 48) break;

    const code = character.charCodeAt(0);
    const isAsciiLetter =
      (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    const isDigit = code >= 48 && code <= 57;
    const isLiteral = character === "." || character === "_";

    if (isAsciiLetter || isDigit || isLiteral) {
      readable += character;
    } else if (readable && !readable.endsWith("-")) {
      readable += "-";
    }
  }

  while (readable.endsWith("-")) readable = readable.slice(0, -1);
  return readable || "project";
}
