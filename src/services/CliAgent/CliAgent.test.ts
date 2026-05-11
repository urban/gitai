import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { buildCodexArgs, renderOutputSchema } from ".";
import { CommitMessageResponse } from "../CommitMessageGenerator";

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

  it("renders a JSON schema for structured codex responses", () =>
    Effect.runPromise(
      renderOutputSchema(CommitMessageResponse).pipe(
        Effect.map(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)),
        Effect.map((schemaDocument) => {
          expect(schemaDocument).toMatchObject({
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
              message: { type: "string" },
            },
            required: ["message"],
            $defs: {
              CommitMessageResponse: { type: "object" },
            },
          });
        }),
      ),
    ));
});
