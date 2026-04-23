import { Schema } from "effect";

class CommitResponse extends Schema.Class<CommitResponse>("CommitResponse")({
  message: Schema.String,
}) {}

export { CommitResponse };
