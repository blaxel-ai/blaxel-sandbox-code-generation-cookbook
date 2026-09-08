import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { describe, expect, it } from "vitest";

describe("production dependency runtime hardening", () => {
  it("uses the MCP SDK AJV runtime with fast-uri validation for malformed authorities", () => {
    const validator = new AjvJsonSchemaValidator();

    expect(() =>
      validator.getValidator({
        $id: "https://schema.example/root",
        $defs: {
          blocked: {
            $id: "http://user@[@127.0.0.1:8123/admin",
            type: "string",
          },
        },
        type: "object",
      }),
    ).toThrow("URI host is malformed");

    const ajvValidator = validator as unknown as {
      _ajv: {
        opts: {
          uriResolver: {
            serialize(component: {
              scheme: string;
              host: string;
              port: string;
              path: string;
            }): string;
          };
        };
      };
    };

    expect(() =>
      ajvValidator._ajv.opts.uriResolver.serialize({
        scheme: "http",
        host: "trusted.example",
        port: "@127.0.0.1:8124",
        path: "/app",
      }),
    ).toThrow("URI port is malformed");
  });

  it("parses Blaxel TOML config and rejects prototype-pollution payloads safely", () => {
    const coreEntry = pathToFileURL(
      path.join(process.cwd(), "node_modules/@blaxel/core/dist/esm/index.js"),
    ).href;

    const safeWorkspace = mkdtempSync(path.join(tmpdir(), "blaxel-core-env-safe-"));
    writeFileSync(
      path.join(safeWorkspace, "blaxel.toml"),
      `
[env]
SAFE_VALUE = "present"
BOOLEAN_VALUE = true
NUMBER_VALUE = 42
ARRAY_VALUE = ["one", "two"]
INLINE_TABLE = { nested = "value" }
MULTILINE_VALUE = """line one
line two"""
`,
    );

    const safeResult = spawnSync(
      process.execPath,
      ["--input-type=module", "-", coreEntry],
      {
        cwd: safeWorkspace,
        encoding: "utf8",
        input: `
          const coreEntry = process.argv[2];
          const { env } = await import(coreEntry);
          console.log(JSON.stringify({
            safeValue: env.SAFE_VALUE,
            booleanValue: env.BOOLEAN_VALUE,
            numberValue: env.NUMBER_VALUE,
            arrayValue: env.ARRAY_VALUE,
            inlineTable: env.INLINE_TABLE,
            multilineValue: env.MULTILINE_VALUE,
          }));
        `,
      },
    );

    expect(safeResult.status).toBe(0);
    expect(safeResult.stderr).toBe("");
    expect(JSON.parse(safeResult.stdout.trim())).toEqual({
      safeValue: "present",
      booleanValue: true,
      numberValue: 42,
      arrayValue: ["one", "two"],
      inlineTable: { nested: "value" },
      multilineValue: "line one\nline two",
    });

    const maliciousWorkspace = mkdtempSync(
      path.join(tmpdir(), "blaxel-core-env-malicious-"),
    );
    writeFileSync(
      path.join(maliciousWorkspace, "blaxel.toml"),
      `
[env.a.b]
y = 1

[env.a.b.y.__proto__.__proto__]
polluted = "yes"
`,
    );

    const maliciousResult = spawnSync(
      process.execPath,
      ["--input-type=module", "-", coreEntry],
      {
        cwd: maliciousWorkspace,
        encoding: "utf8",
        input: `
          const coreEntry = process.argv[2];
          delete Object.prototype.polluted;
          await import(coreEntry);
          console.log(JSON.stringify({
            polluted: Object.prototype.polluted ?? null,
            inherited: ({}).polluted ?? null,
          }));
        `,
      },
    );

    expect(maliciousResult.status).toBe(0);
    expect(maliciousResult.stderr).toBe("");
    expect(JSON.parse(maliciousResult.stdout.trim())).toEqual({
      polluted: null,
      inherited: null,
    });
  });
});
