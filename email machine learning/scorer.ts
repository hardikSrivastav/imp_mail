import { ScoreResult } from "./types";

/**
 * Placeholder scorer. Does not implement ML/vector search.
 * Returns a constant unclassified score.
 */
export async function scoreEmailWithCurrentModel(userId: string, emailId: string): Promise<ScoreResult> {
  return {
    emailId,
    score: 0.5,
    label: "unclassified",
    modelVersion: "untrained",
  };
}
