#!/usr/bin/env bun

import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { Command } from "effect/unstable/cli";
import pkg from "../package.json" with { type: "json" };
import { cliLoggerLayer } from "./CliLogger";
import { commandCommit } from "./commands/commit";
import { CliAgent } from "./services/CliAgent";
import { CliPresenter } from "./services/CliPresenter";
import { CommitMessageGenerator } from "./services/CommitMessageGenerator";
import { CommitReview } from "./services/CommitReview";
import { CommitWorkflow } from "./services/CommitWorkflow";
import { GitRepository } from "./services/GitRepository";
import { Templater } from "./services/Templater";
import { WorkIndicator } from "./services/WorkIndicator";

const cli = Command.make("gitai");

const MainLayer = Layer.mergeAll(CommitWorkflow.layer, cliLoggerLayer).pipe(
  Layer.provideMerge(GitRepository.layer),
  Layer.provideMerge(CommitMessageGenerator.layer),
  Layer.provideMerge(CommitReview.layer),
  Layer.provideMerge(CliAgent.layer),
  Layer.provideMerge(CliPresenter.layer),
  Layer.provideMerge(WorkIndicator.layer),
  Layer.provideMerge(Templater.layer),
  Layer.provideMerge(BunServices.layer),
);

const isObjectRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Object(value) === value;

const getErrorMessage = (error: unknown): string => {
  if (isObjectRecord(error) && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return "Command failed";
};

const getCauseMessage = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.findErrorOption(cause);

  if (Option.isSome(error)) {
    return getErrorMessage(error.value);
  }

  return getErrorMessage(Cause.squash(cause));
};

if (import.meta.main) {
  cli.pipe(
    Command.withSubcommands([commandCommit]),
    Command.run({
      version: pkg.version,
    }),
    Effect.tapCause((cause: Cause.Cause<unknown>) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Effect.gen(function* () {
            const presenter = yield* CliPresenter;
            yield* presenter.error(getCauseMessage(cause));
          }),
    ),
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(MainLayer),
    (effect) =>
      BunRuntime.runMain(effect, {
        disableErrorReporting: true,
        teardown: (exit, onExit) => {
          if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
            onExit(1);
            return;
          }

          onExit(0);
        },
      }),
  );
}
