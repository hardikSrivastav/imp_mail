# Backend Routes (to add later)

Proposed endpoints (Express, under `/api/preferences`):

- `GET /api/preferences` → fetch current selections for the authenticated user
- `PUT /api/preferences` → save liked/disliked selections
  - body: `{ likedEmailIds: string[], dislikedEmailIds: string[] }`
- `POST /api/preferences/train` → triggers training job, returns `PreferenceModelMetadata`
- `POST /api/preferences/score/:id` → returns `ScoreResult` for a single email id

Note: For now, these endpoints will use the in-memory `preferenceStore`. Replace with a persistent DB implementation later.