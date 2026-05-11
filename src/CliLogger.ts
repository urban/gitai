import { Logger, Match } from "effect";
import pc from "picocolors";

const cliLogger = Logger.make(({ logLevel, message }) => {
  Match.value(logLevel).pipe(
    Match.when("Info", () => {
      process.stdout.write(`${message}\n`);
    }),
    Match.when("Error", () => {
      process.stderr.write(`${pc.red(`${message}`)}\n`);
    }),
    Match.when("Warn", () => {
      process.stderr.write(`${pc.yellow(`${message}`)}\n`);
    }),
    Match.orElse(() => {
      process.stdout.write(`[${logLevel}] ${message}\n`);
    }),
  );
});

export { cliLogger };
