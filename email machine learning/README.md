# Email Machine Learning (Framework)

This directory contains scaffolding for learning user preferences from emails. Do not implement ML/vector search here yet — only interfaces, data flow, and stubs.

## Overview
- Preference selection: user picks ≥5 liked and ≥5 disliked emails.
- Training job: materializes a user preference model from selections.
- Scoring: assigns importance score/label for new emails.

## Modules
- `types.ts`: Shared types and interfaces
- `preferenceStore.ts`: CRUD for selections (backed by DB later)
- `trainer.ts`: Orchestrates training; returns a `PreferenceModelMetadata`
- `scorer.ts`: Scores emails using the current model (placeholder)
- `routes.md`: Backend endpoints to integrate (Express routes already exist for emails; add preference routes later)

## Next steps
- Wire `preferenceStore` to persistent DB tables.
- Implement actual training (prototype-based or vector search).
- Implement scoring and batch classification hook.
