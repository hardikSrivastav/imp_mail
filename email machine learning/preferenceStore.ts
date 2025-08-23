import { UserPreferences, EmailId } from "./types";

/**
 * In-memory stub storage. Replace with DB persistence later.
 */
const memoryStore: Record<string, UserPreferences> = {};

function nowIso(): string {
  return new Date().toISOString();
}

export const preferenceStore = {
  get(userId: string): UserPreferences | null {
    return memoryStore[userId] ?? null;
  },

  save(userId: string, liked: EmailId[], disliked: EmailId[]): UserPreferences {
    const existing = memoryStore[userId];
    const newRecord: UserPreferences = {
      userId,
      likedEmailIds: Array.from(new Set(liked)),
      dislikedEmailIds: Array.from(new Set(disliked)),
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    memoryStore[userId] = newRecord;
    return newRecord;
  },

  clear(userId: string): void {
    delete memoryStore[userId];
  },
};
