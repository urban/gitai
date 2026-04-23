import { Schema } from "effect";
import { GitCommit } from "../GitClient";

const formatCommitsForPrompt = (commits: ReadonlyArray<Schema.Schema.Type<typeof GitCommit>>) => {
  return commits
    .map((commit) => {
      const body = commit.body ? `\n\n${commit.body}` : "";
      return `**Commit ${commit.shortHash}** (${commit.date})
Author: ${commit.author}
Subject: ${commit.subject}${body}

---`;
    })
    .join("\n\n");
};

export { formatCommitsForPrompt };
