#!/usr/bin/env python3
"""
Run Incremental Email Classifier

This script runs the incremental classifier once to apply AI predictions 
to all unclassified emails in the SQLite database.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from incremental_classifier import IncrementalEmailClassifier

async def main():
    """Run the incremental classifier once"""
    
    # Configuration
    config = {
        'api_base_url': os.getenv('FASTAPI_URL', 'http://localhost:8000'),
        'qdrant_host': os.getenv('QDRANT_HOST', 'localhost'),
        'qdrant_port': int(os.getenv('QDRANT_PORT', '6333')),
        'collection_name': os.getenv('QDRANT_COLLECTION', 'email_embeddings'),
        'sqlite_db_path': os.getenv('SQLITE_DB_PATH', '../data/emails.db'),
        'batch_size': 10
    }
    
    print("🤖 Starting Incremental Email Classifier")
    print(f"📊 FastAPI URL: {config['api_base_url']}")
    print(f"🔍 Qdrant: {config['qdrant_host']}:{config['qdrant_port']}")
    print(f"💾 SQLite DB: {config['sqlite_db_path']}")
    print("=" * 50)
    
    # Create classifier
    classifier = IncrementalEmailClassifier(
        api_base_url=config['api_base_url'],
        qdrant_host=config['qdrant_host'],
        qdrant_port=config['qdrant_port'],
        collection_name=config['collection_name'],
        sqlite_db_path=config['sqlite_db_path'],
        batch_size=config['batch_size']
    )
    
    # Initialize
    print("🔧 Initializing classifier...")
    if not await classifier.initialize():
        print("❌ Failed to initialize classifier")
        return 1
    
    try:
        print("🚀 Running classification cycle...")
        await classifier.run_once()
        print("✅ Classification completed successfully!")
        return 0
        
    except Exception as e:
        print(f"❌ Classification failed: {e}")
        return 1
        
    finally:
        await classifier.cleanup()

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
