#!/usr/bin/env sh
set -e

FILE="/app/dist/services/embedding/VectorEmbeddingService.js"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

if grep -q "_embedding" "$FILE"; then
  echo "FOUND _embedding in $FILE"
  nl -ba "$FILE" | sed -n '90,140p'
  exit 2
else
  echo "OK: No _embedding suffix found in $FILE"
fi
