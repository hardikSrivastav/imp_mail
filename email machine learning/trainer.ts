import { preferenceStore } from "./preferenceStore";
import { PreferenceModelMetadata } from "./types";

/**
 * Placeholder trainer. Validates selections and returns metadata only.
 */
export async function trainUserPreferenceModel(userId: string): Promise<PreferenceModelMetadata> {
  const prefs = preferenceStore.get(userId);
  if (!prefs) {
    throw new Error("No preferences found for user");
  }

  if (prefs.likedEmailIds.length < 5 || prefs.dislikedEmailIds.length < 5) {
    throw new Error("At least 5 liked and 5 disliked emails are required");
  }

  const modelVersion = `v${Date.now()}`;

  // No ML yet; just return metadata
  return {
    userId,
    modelVersion,
    trainedAt: new Date().toISOString(),
    trainingSummary: {
      likedCount: prefs.likedEmailIds.length,
      dislikedCount: prefs.dislikedEmailIds.length,
      notes: "Framework only; no embeddings or model persisted.",
    },
  };
}
