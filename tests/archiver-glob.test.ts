import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

/**
 * glob 10.5.0 (GHSA-3g3m-2fjr-6pw4) and minimatch 9.0.9 (GHSA-g3hv-75wg-m249) reach this project only through
 * @blaxel/core -> archiver -> archiver-utils. The copies are overridden to glob 14.0.2 (which brings
 * minimatch 11). The test loads archiver the way @blaxel/core does, checks the resolved versions and runs the
 * archiver-utils glob path (file.expand) and archiver's own glob, so a major move that breaks them fails here.
 */
function requireFrom(pkgDir: string) {
  return createRequire(join(realpathSync(pkgDir), "package.json"));
}

function findPackage(req: NodeJS.Require, name: string) {
  const dir = (req.resolve.paths(name) ?? [])
    .map((base) => join(base, name))
    .find((c) => existsSync(join(c, "package.json")));
  // Fail rather than fall back: a copy outside this chain would prove nothing.
  if (!dir) throw new Error(`cannot resolve ${name}`);
  return dir;
}

function atLeast(version: string, floor: string) {
  const a = version.split(".").map(Number);
  const b = floor.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

describe("archiver glob chain (glob/minimatch overrides)", () => {
  const coreDir = findPackage(createRequire(import.meta.url), "@blaxel/core");
  const archiverDir = findPackage(requireFrom(coreDir), "archiver");
  const utilsDir = findPackage(requireFrom(archiverDir), "archiver-utils");
  const utilsReq = requireFrom(utilsDir);
  const globDir = findPackage(utilsReq, "glob");
  const minimatchDir = findPackage(requireFrom(globDir), "minimatch");

  it("resolves patched glob and minimatch for archiver-utils", () => {
    const glob = JSON.parse(readFileSync(join(globDir, "package.json"), "utf8")).version;
    const minimatch = JSON.parse(readFileSync(join(minimatchDir, "package.json"), "utf8")).version;
    expect(atLeast(glob, "14.0.2")).toBe(true);
    expect(atLeast(minimatch, "11.0.1")).toBe(true);
  });

  it("expands patterns with archiver-utils and zips a tree with archiver", async () => {
    const root = mkdtempSync(join(tmpdir(), "archiver-glob-"));
    mkdirSync(join(root, "src", "nested"), { recursive: true });
    writeFileSync(join(root, "src", "a.txt"), "a");
    writeFileSync(join(root, "src", "nested", "b.txt"), "b");
    writeFileSync(join(root, "src", "skip.log"), "c");

    const { file } = utilsReq("archiver-utils") as {
      file: { expand: (opts: { cwd: string }, patterns: string[]) => string[] };
    };
    const expanded = file.expand({ cwd: root }, ["src/**/*.txt"]).sort();
    expect(expanded).toEqual(["src/a.txt", "src/nested/b.txt"]);

    const archiver = requireFrom(archiverDir)(archiverDir) as (
      format: string,
      opts?: object,
    ) => NodeJS.ReadableStream & {
      glob: (pattern: string, opts: object) => void;
      finalize: () => Promise<void>;
      pointer: () => number;
    };
    const zip = archiver("zip");
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => {
      sink.on("end", resolve);
      zip.on("error", reject);
    });
    zip.pipe(sink);
    zip.glob("src/**/*.txt", { cwd: root });
    await zip.finalize();
    await done;
    const out = Buffer.concat(chunks).toString("latin1");
    expect(out).toContain("src/a.txt");
    expect(out).toContain("src/nested/b.txt");
    expect(out).not.toContain("skip.log");
  });
});
