"""
Incremental Email Classifier

Finds unclassified emails in Qdrant and classifies them incrementally.
Assumes emails are already embedded and stored in Qdrant by your existing pipeline.
"""

import asyncio
import httpx
import logging
from typing import Dict, List, Set, Optional
from datetime import datetime
import json
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class IncrementalEmailClassifier:
    """Incrementally classify unclassified emails from Qdrant"""
    
    def __init__(
        self,
        api_base_url: str = "http://localhost:8000",
        qdrant_host: str = "localhost", 
        qdrant_port: int = 6333,
        collection_name: str = "email_embeddings",
        sqlite_db_path: str = "./data/email_filter.db",
        batch_size: int = 10,
        check_interval: int = 60  # seconds
    ):
        self.api_base_url = api_base_url
        self.qdrant_host = qdrant_host
        self.qdrant_port = qdrant_port
        self.collection_name = collection_name
        self.sqlite_db_path = sqlite_db_path
        self.batch_size = batch_size
        self.check_interval = check_interval
        
        # Track what we've processed
        self.processed_emails: Set[str] = set()
        
        # Clients
        self.qdrant_client = None
        self.sqlite_client = None
        self.http_client = None
    
    async def initialize(self):
        """Initialize clients"""
        try:
            from vector_store_client import QdrantClient
            from sqlite_client import SQLiteEmailClient
            
            # Qdrant client
            self.qdrant_client = QdrantClient(
                host=self.qdrant_host,
                port=self.qdrant_port, 
                collection_name=self.collection_name
            )
            
            # SQLite client (for updating importance)
            if os.path.exists(self.sqlite_db_path):
                self.sqlite_client = SQLiteEmailClient(self.sqlite_db_path)
                if not self.sqlite_client.connect():
                    logger.warning("Could not connect to SQLite - will skip database updates")
                    self.sqlite_client = None
            
            # HTTP client for classification API
            self.http_client = httpx.AsyncClient(timeout=60.0)
            
            logger.info("Incremental classifier initialized")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize: {e}")
            return False
    
    async def get_unclassified_emails(self) -> Dict[str, List[str]]:
        """Get unclassified emails from Qdrant, grouped by user"""
        try:
            # Get all emails from Qdrant
            scroll_result = self.qdrant_client.client.scroll(
                collection_name=self.collection_name,
                limit=10000,  # Adjust based on your email volume
                with_payload=True,
                with_vectors=False
            )
            
            points, _ = scroll_result
            unclassified_by_user = {}
            
            for point in points:
                email_id = point.payload.get('emailId')
                user_id = point.payload.get('userId')
                
                if not email_id or not user_id:
                    continue
                
                # Skip if already processed
                if email_id in self.processed_emails:
                    continue
                
                # Check if email is classified in SQLite
                if await self.is_email_classified(email_id):
                    self.processed_emails.add(email_id)
                    continue
                
                # Add to unclassified list
                if user_id not in unclassified_by_user:
                    unclassified_by_user[user_id] = []
                
                unclassified_by_user[user_id].append(email_id)
            
            # Log summary
            total_unclassified = sum(len(emails) for emails in unclassified_by_user.values())
            logger.info(f"Found {total_unclassified} unclassified emails across {len(unclassified_by_user)} users")
            
            return unclassified_by_user
            
        except Exception as e:
            logger.error(f"Error getting unclassified emails: {e}")
            return {}
    
    async def is_email_classified(self, email_id: str) -> bool:
        """Check if email is already classified in SQLite"""
        if not self.sqlite_client:
            return False
        
        try:
            cursor = self.sqlite_client.connection.cursor()
            cursor.execute("""
                SELECT importance FROM emails 
                WHERE id = ? AND importance IS NOT NULL AND importance != 'unclassified'
            """, (email_id,))
            
            result = cursor.fetchone()
            return result is not None
            
        except Exception as e:
            logger.error(f"Error checking if email {email_id} is classified: {e}")
            return False
    
    async def user_has_trained_model(self, user_id: str) -> bool:
        """Check if user has a trained classification model"""
        try:
            response = await self.http_client.get(f"{self.api_base_url}/stats/{user_id}")
            if response.status_code == 200:
                stats = response.json()
                return stats.get('total_examples', 0) >= 2
            return False
        except Exception as e:
            logger.error(f"Error checking model for user {user_id}: {e}")
            return False
    
    async def classify_email_batch(self, user_id: str, email_ids: List[str]) -> Optional[List[Dict]]:
        """Classify a batch of emails"""
        try:
            response = await self.http_client.post(
                f"{self.api_base_url}/classify",
                json={
                    "user_id": user_id,
                    "email_ids": email_ids,
                    "return_confidence": True
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get('results', [])
            else:
                logger.error(f"Classification failed for user {user_id}: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error classifying batch for user {user_id}: {e}")
            return None
    
    async def update_email_importance(self, email_id: str, is_important: bool, confidence: float):
        """Update email importance in SQLite"""
        if not self.sqlite_client:
            return
        
        try:
            cursor = self.sqlite_client.connection.cursor()
            importance = "important" if is_important else "not_important"
            
            # Use correct column name and set user_labeled to 0 (AI-labeled)
            cursor.execute("""
                UPDATE emails 
                SET importance = ?, importance_confidence = ?, user_labeled = 0
                WHERE id = ?
            """, (importance, confidence, email_id))
            
            self.sqlite_client.connection.commit()
            
            logger.info(f"✅ Updated {email_id}: {importance} ({confidence:.3f}) [AI-labeled]")
            
        except Exception as e:
            logger.error(f"❌ Error updating email {email_id}: {e}")
    
    async def process_user_emails(self, user_id: str, email_ids: List[str]):
        """Process all emails for a specific user"""
        
        # Check if user has a trained model
        if not await self.user_has_trained_model(user_id):
            logger.info(f"User {user_id} has no trained model, skipping {len(email_ids)} emails")
            self.processed_emails.update(email_ids)
            return
        
        logger.info(f"Classifying {len(email_ids)} emails for user {user_id}")
        
        # Process in batches
        for i in range(0, len(email_ids), self.batch_size):
            batch = email_ids[i:i + self.batch_size]
            
            logger.info(f"Processing batch {i//self.batch_size + 1}/{(len(email_ids)-1)//self.batch_size + 1} for user {user_id}")
            
            # Classify batch
            results = await self.classify_email_batch(user_id, batch)
            
            if results:
                # Update database with results
                for result in results:
                    email_id = result['email_id']
                    is_important = result['is_important']
                    confidence = result['confidence']
                    
                    # Update SQLite
                    await self.update_email_importance(email_id, is_important, confidence)
                    
                    # Log result
                    status = "🔴 IMPORTANT" if is_important else "⚪ NOT IMPORTANT"
                    logger.info(f"  {email_id}: {status} ({confidence:.3f})")
                
                # Mark as processed
                self.processed_emails.update(batch)
                
            else:
                logger.error(f"Failed to classify batch for user {user_id}")
                # Still mark as processed to avoid infinite retries
                self.processed_emails.update(batch)
            
            # Small delay between batches to avoid overwhelming the API
            await asyncio.sleep(1)
    
    async def run_classification_cycle(self):
        """Run one complete classification cycle"""
        logger.info("Starting classification cycle...")
        
        # Get unclassified emails
        unclassified_by_user = await self.get_unclassified_emails()
        
        if not unclassified_by_user:
            logger.info("No unclassified emails found")
            return
        
        # Process each user's emails
        for user_id, email_ids in unclassified_by_user.items():
            await self.process_user_emails(user_id, email_ids)
        
        logger.info("Classification cycle completed")
    
    async def run_continuously(self):
        """Run the classifier continuously"""
        logger.info(f"Starting incremental email classifier (checking every {self.check_interval}s)")
        
        while True:
            try:
                await self.run_classification_cycle()
                
                logger.info(f"Waiting {self.check_interval}s before next cycle...")
                await asyncio.sleep(self.check_interval)
                
            except KeyboardInterrupt:
                logger.info("Classifier stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in classification cycle: {e}")
                await asyncio.sleep(self.check_interval)
    
    async def run_once(self):
        """Run classification once and exit"""
        logger.info("Running one-time classification...")
        await self.run_classification_cycle()
        logger.info("One-time classification completed")
    
    async def cleanup(self):
        """Cleanup resources"""
        if self.http_client:
            await self.http_client.aclose()
        
        if self.sqlite_client:
            self.sqlite_client.disconnect()
        
        logger.info("Cleanup completed")

async def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Incremental Email Classifier")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Classifier API URL")
    parser.add_argument("--qdrant-host", default="localhost", help="Qdrant host")
    parser.add_argument("--qdrant-port", type=int, default=6333, help="Qdrant port")
    parser.add_argument("--collection", default="email_embeddings", help="Qdrant collection")
    parser.add_argument("--db-path", default="./data/email_filter.db", help="SQLite database path")
    parser.add_argument("--batch-size", type=int, default=10, help="Batch size for classification")
    parser.add_argument("--interval", type=int, default=60, help="Check interval in seconds")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    
    args = parser.parse_args()
    
    # Create classifier
    classifier = IncrementalEmailClassifier(
        api_base_url=args.api_url,
        qdrant_host=args.qdrant_host,
        qdrant_port=args.qdrant_port,
        collection_name=args.collection,
        sqlite_db_path=args.db_path,
        batch_size=args.batch_size,
        check_interval=args.interval
    )
    
    # Initialize
    if not await classifier.initialize():
        logger.error("Failed to initialize classifier")
        return
    
    try:
        if args.once:
            await classifier.run_once()
        else:
            await classifier.run_continuously()
    finally:
        await classifier.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
