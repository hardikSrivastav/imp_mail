#!/bin/bash

echo "Updating package-lock.json with new dependencies..."

# Remove existing lock file to force fresh install
rm -f package-lock.json

# Install dependencies (this will create a new package-lock.json)
npm install

echo "Dependencies updated successfully!"
echo "You can now run: docker-compose build"
