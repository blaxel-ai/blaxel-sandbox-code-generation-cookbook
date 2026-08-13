import { describe, expect, it } from "vitest";
import {
  classifyRuntimeError,
  runtimeErrorDetails,
} from "../src/lifecycle/error-policy.js";

describe("runtime error policy", () => {
  it("retries workload unavailability", () => {
    expect(
      classifyRuntimeError({
        origin: "platform",
        code: "WORKLOAD_UNAVAILABLE",
        retryable: true,
      }),
    ).toBe("retry");
  });

  it("replaces a missing workload", () => {
    expect(
      classifyRuntimeError({
        response: {
          data: {
            error: {
              origin: "platform",
              code: "WORKLOAD_NOT_FOUND",
              retryable: false,
            },
          },
          status: 404,
        },
      }),
    ).toBe("replace-sandbox");
  });

  it("keeps application failures out of the replacement path", () => {
    expect(
      classifyRuntimeError({
        origin: "application",
        code: "FILE_NOT_FOUND",
        status: 404,
      }),
    ).toBe("correct-request");
  });

  it("treats a 404 without a platform origin as an application error", () => {
    expect(classifyRuntimeError({ status: 404, code: "FILE_NOT_FOUND" })).toBe(
      "correct-request",
    );
  });

  it("extracts nested structured error details", () => {
    expect(
      runtimeErrorDetails({
        response: {
          status: 503,
          data: {
            error: {
              origin: "platform",
              code: "WORKLOAD_UNAVAILABLE",
              retryable: true,
            },
          },
        },
      }),
    ).toEqual({
      origin: "platform",
      code: "WORKLOAD_UNAVAILABLE",
      retryable: true,
      status: 503,
    });
  });
});
