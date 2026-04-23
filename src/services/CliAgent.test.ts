import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { CommitResponse } from "./AiGenerator/schemas";
import { buildCodexArgs, renderOutputSchema } from "./CliAgent";

describe("CliAgent", () => {
  it("builds codex args that run non-interactively in a read-only sandbox", () => {
    expect(buildCodexArgs({ outputFilepath: "/tmp/final-message.txt" })).toStrictEqual([
      "-a",
      "never",
      "exec",
      "--sandbox",
      "read-only",
      "--output-last-message",
      "/tmp/final-message.txt",
      "-",
    ]);
  });

  it("adds an output schema path for structured responses", () => {
    expect(
      buildCodexArgs({
        outputFilepath: "/tmp/final-message.txt",
        outputSchemaFilepath: "/tmp/output-schema.json",
      }),
    ).toStrictEqual([
      "-a",
      "never",
      "exec",
      "--sandbox",
      "read-only",
      "--output-last-message",
      "/tmp/final-message.txt",
      "--output-schema",
      "/tmp/output-schema.json",
      "-",
    ]);
  });

  it("renders a JSON schema for structured codex responses", async () => {
    const schemaDocument = JSON.parse(await Effect.runPromise(renderOutputSchema(CommitResponse)));

    expect(schemaDocument.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schemaDocument.type).toBe("object");
    expect(schemaDocument.properties.message).toMatchObject({ type: "string" });
    expect(schemaDocument.required).toContain("message");
    expect(schemaDocument.$defs.CommitResponse.type).toBe("object");
  });
});
