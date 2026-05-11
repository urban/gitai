import { Effect, FileSystem, Layer, Path, PlatformError, Schema, Context } from "effect";
import { compileTemplate, type TemplateVars } from "./compileTemplate";

class TemplaterError extends Schema.TaggedErrorClass<TemplaterError>()("TemplaterError", {
  message: Schema.NonEmptyString,
  cause: Schema.optional(Schema.Unknown),
}) {}

class Templater extends Context.Service<
  Templater,
  {
    readonly load: (
      url: URL,
    ) => Effect.Effect<
      string,
      TemplaterError | PlatformError.PlatformError | PlatformError.BadArgument,
      never
    >;
    readonly compile: (
      template: string,
      vars: TemplateVars,
    ) => Effect.Effect<string, TemplaterError, never>;
  }
>()("@urban/gitai/services/Templater/Templater") {
  static readonly layer = Layer.effect(
    Templater,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const load = Effect.fn("Templater.load")(function* (url: URL) {
        const filepath = yield* path.fromFileUrl(url);
        const exists = yield* fs.exists(filepath);
        if (!exists) {
          return yield* TemplaterError.make({
            message: `${filepath} does not exist`,
          });
        }
        const template = yield* fs.readFileString(filepath);
        return template;
      });

      const compile = Effect.fn("Templater.compile")(
        function* (template: string, vars: TemplateVars) {
          const compiledTemplate = yield* compileTemplate(template, vars);
          return compiledTemplate;
        },
        Effect.mapError(
          () =>
            new TemplaterError({
              message: "Review template contains invalid function calls",
            }),
        ),
      );
      return Templater.of({
        load,
        compile,
      });
    }),
  );
}

export { Templater, TemplaterError };
