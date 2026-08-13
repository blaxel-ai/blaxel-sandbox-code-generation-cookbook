import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function loadFixture(
  directory: string,
  root = directory,
): Promise<Record<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, await loadFixture(absolutePath, root));
    } else if (entry.isFile()) {
      files[path.relative(root, absolutePath)] = await readFile(
        absolutePath,
        "utf8",
      );
    }
  }

  return files;
}
