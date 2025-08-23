export type EmailId = string;

export interface UserPreferences {
  userId: string;
  likedEmailIds: EmailId[]; // >= 5
  dislikedEmailIds: EmailId[]; // >= 5
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface PreferenceModelMetadata {
  userId: string;
  modelVersion: string;
  trainedAt: string; // ISO
  // Any knobs we used to train; no vectors yet
  trainingSummary: {
    likedCount: number;
    dislikedCount: number;
    notes?: string;
  };
}

export interface ScoreResult {
  emailId: EmailId;
  score: number; // 0..1 importance probability
  label: "important" | "not_important" | "unclassified";
  modelVersion: string;
}
