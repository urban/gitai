import { Option } from "effect";
import { Flag } from "effect/unstable/cli";

const CONTEXT_LINES_DEFAULT = 3; // Same as git's default

export const contextLinesOption = Flag.integer("contextLines").pipe(
  Flag.optional,
  Flag.withAlias("cli"),
  Flag.withDefault(Option.some(CONTEXT_LINES_DEFAULT)),
  Flag.withDescription(`Number of context lines for git diff (default: ${CONTEXT_LINES_DEFAULT})`),
);
