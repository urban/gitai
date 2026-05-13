import { Config, Effect, Layer, Logger, Match, References } from "effect";
import pc from "picocolors";

const stringifyJson = (value: unknown): string | undefined => {
  try {
    return JSON.stringify(value) ?? undefined;
  } catch {
    return undefined;
  }
};

const formatValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value === undefined) {
    return "undefined";
  }

  return stringifyJson(value) ?? String(value);
};

const formatMessage = (message: unknown): string => {
  const parts = Array.isArray(message) ? message : [message];
  return parts.map(formatValue).join(" ");
};

const formatFieldValue = (value: unknown): string => {
  const rendered = formatValue(value);
  return /^[A-Za-z0-9_./:@-]+$/u.test(rendered) ? rendered : (stringifyJson(rendered) ?? rendered);
};

const formatDebugContext = ({ date, fiber }: Logger.Options<unknown>): string => {
  const annotations = fiber.getRef(References.CurrentLogAnnotations);
  const annotationFields = Object.entries(annotations).map(
    ([key, value]) => `${key}=${formatFieldValue(value)}`,
  );
  const spanFields = fiber
    .getRef(References.CurrentLogSpans)
    .map(([label, startedAt]) => `${label}=${date.getTime() - startedAt}ms`);
  const fields = [...spanFields, ...annotationFields];

  return fields.length === 0 ? "" : ` ${fields.join(" ")}`;
};

const cliLogger = Logger.make<unknown, void>((options) => {
  const { logLevel, message } = options;
  const renderedMessage = formatMessage(message);

  Match.value(logLevel).pipe(
    Match.when("Info", () => {
      process.stdout.write(`${renderedMessage}\n`);
    }),
    Match.when("Error", () => {
      process.stderr.write(`${pc.red(renderedMessage)}\n`);
    }),
    Match.when("Warn", () => {
      process.stderr.write(`${pc.yellow(renderedMessage)}\n`);
    }),
    Match.when("Fatal", () => {
      process.stderr.write(`${pc.red(`[${logLevel}] ${renderedMessage}`)}\n`);
    }),
    Match.orElse(() => {
      process.stderr.write(
        `${pc.dim(`[${logLevel}] ${renderedMessage}${formatDebugContext(options)}`)}\n`,
      );
    }),
  );
});

const cliLoggerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const isDebug = yield* Config.boolean("DEBUG").pipe(Config.withDefault(false));
    const minimumLogLevel = isDebug ? "Debug" : "Info";

    return Logger.layer([cliLogger]).pipe(
      Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, minimumLogLevel)),
    );
  }),
);

export { cliLogger, cliLoggerLayer };
