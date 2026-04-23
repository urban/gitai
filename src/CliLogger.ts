import { Logger, Match } from "effect";
import pc from "picocolors";

const cliLogger = Logger.make(({ logLevel, message }) => {
  Match.value(logLevel).pipe(
    Match.when("Info", () => {
      globalThis.console.info(`${message}`);
    }),
    Match.when("Error", () => {
      globalThis.console.error(pc.red(`${message}`));
    }),
    Match.when("Warn", () => {
      globalThis.console.warn(pc.yellow(`${message}`));
    }),
    Match.orElse(() => {
      globalThis.console.log(`[${logLevel}] ${message}`);
    }),
  );
});

export { cliLogger };
