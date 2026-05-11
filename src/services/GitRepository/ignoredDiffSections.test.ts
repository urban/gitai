import { describe, expect, it } from "vitest";
import {
  filterIgnoredDiffSections,
  getIgnoredDiffSectionHeaders,
  isIgnoredDiffPath,
} from "./ignoredDiffSections";

const sourceDiff = [
  "diff --git a/src/app.ts b/src/app.ts\n",
  "index 1111111..2222222 100644\n",
  "--- a/src/app.ts\n",
  "+++ b/src/app.ts\n",
  "@@ -1 +1 @@\n",
  "-old\n",
  "+new\n",
].join("");

const lockfileDiff = [
  "diff --git a/bun.lock b/bun.lock\n",
  "index 3333333..4444444 100644\n",
  "--- a/bun.lock\n",
  "+++ b/bun.lock\n",
  "@@ -1 +1 @@\n",
  "-old lock\n",
  "+new lock\n",
].join("");

const coverageDiff = [
  "diff --git a/coverage/coverage-summary.json b/coverage/coverage-summary.json\n",
  "index 5555555..6666666 100644\n",
  "--- a/coverage/coverage-summary.json\n",
  "+++ b/coverage/coverage-summary.json\n",
  "@@ -1 +1 @@\n",
  "-{}\n",
  '+{"total":{}}\n',
].join("");

describe("ignoredDiffSections", () => {
  it("identifies ignored paths", () => {
    expect(isIgnoredDiffPath("bun.lock")).toBe(true);
    expect(isIgnoredDiffPath("src/node_modules/pkg/index.ts")).toBe(true);
    expect(isIgnoredDiffPath("coverage/nested/report.json")).toBe(true);
    expect(isIgnoredDiffPath("src/app.ts")).toBe(false);
  });

  it("filters ignored diff sections and keeps source changes", () => {
    const diff = `${sourceDiff}${lockfileDiff}${coverageDiff}`;

    expect(filterIgnoredDiffSections(diff)).toBe(sourceDiff);
  });

  it("reports ignored diff headers for debug logging", () => {
    const diff = `${sourceDiff}${lockfileDiff}${coverageDiff}`;

    expect(getIgnoredDiffSectionHeaders(diff)).toStrictEqual([
      "diff --git a/bun.lock b/bun.lock",
      "diff --git a/coverage/coverage-summary.json b/coverage/coverage-summary.json",
    ]);
  });
});
