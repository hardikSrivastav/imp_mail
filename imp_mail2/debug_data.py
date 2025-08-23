#!/usr/bin/env python3
"""
Debug Data Consistency

This script checks the current state of emails in SQLite and compares
with what the AI classifier would predict.
"""

import asyncio
import sys
import os
import json
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from sqlite_client import SQLiteEmailClient
import httpx

async def check_database_status():
    """Check current database state"""
    print("🔍 Checking SQLite Database Status")
    print("=" * 50)
    
    # Connect to database
    db_path = '../data/emails.db'
    client = SQLiteEmailClient(db_path)
    
    if not client.connect():
        print("❌ Failed to connect to database")
        return
    
    try:
        # Get database stats
        stats = client.get_database_stats()
        print(f"📊 Database Statistics:")
        print(f"   Total emails: {stats.get('total_emails', 0)}")
        print(f"   Labeled emails: {stats.get('labeled_emails', 0)}")
        print(f"   Important emails: {stats.get('important_emails', 0)}")
        print(f"   Total users: {stats.get('total_users', 0)}")
        print()
        
        # Check importance distribution
        cursor = client.connection.cursor()
        cursor.execute("""
            SELECT importance, COUNT(*) as count 
            FROM emails 
            GROUP BY importance
        """)
        
        print("📈 Importance Distribution:")
        for row in cursor.fetchall():
            print(f"   {row['importance']}: {row['count']} emails")
        print()
        
        # Get sample unclassified emails
        cursor.execute("""
            SELECT id, subject, sender, importance, user_labeled
            FROM emails 
            WHERE importance = 'unclassified'
            LIMIT 5
        """)
        
        unclassified = cursor.fetchall()
        if unclassified:
            print("📝 Sample Unclassified Emails:")
            for email in unclassified:
                print(f"   ID: {email['id'][:8]}... | Subject: {email['subject'][:50]}...")
        else:
            print("✅ No unclassified emails found!")
        print()
        
        # Check if we have any user with enough training data
        cursor.execute("""
            SELECT user_id, COUNT(*) as labeled_count
            FROM emails 
            WHERE user_labeled = 1 AND importance != 'unclassified'
            GROUP BY user_id
        """)
        
        users_with_labels = cursor.fetchall()
        print("👤 Users with Training Data:")
        if users_with_labels:
            for user in users_with_labels:
                user_id = user['user_id'][:8] + "..."
                count = user['labeled_count']
                status = "✅ Ready for AI" if count >= 10 else f"❌ Need {10-count} more"
                print(f"   User {user_id}: {count} labels | {status}")
        else:
            print("   ❌ No users have labeled emails yet!")
            
    finally:
        client.disconnect()

async def check_fastapi_status():
    """Check if FastAPI service is running and has trained models"""
    print("\n🤖 Checking FastAPI Service Status")
    print("=" * 50)
    
    api_url = "http://localhost:8000"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Health check
            response = await client.get(f"{api_url}/health")
            if response.status_code == 200:
                print("✅ FastAPI service is running")
            else:
                print(f"❌ FastAPI health check failed: {response.status_code}")
                return
            
            # Check for trained models (this will fail, but we can see the error)
            try:
                response = await client.get(f"{api_url}/stats/test_user")
                if response.status_code == 200:
                    stats = response.json()
                    print(f"📊 Sample Model Stats: {stats}")
                elif response.status_code == 404:
                    print("❌ No trained models found")
                else:
                    print(f"❌ Error checking model stats: {response.status_code}")
            except Exception as e:
                print(f"❌ Error checking model stats: {e}")
                
    except Exception as e:
        print(f"❌ FastAPI service not accessible: {e}")

async def check_qdrant_status():
    """Check if Qdrant is accessible"""
    print("\n🔍 Checking Qdrant Status")
    print("=" * 50)
    
    try:
        from vector_store_client import QdrantClient
        
        client = QdrantClient(host="localhost", port=6333, collection_name="email_embeddings")
        
        # Try to get collection info
        try:
            info = client.client.get_collection("email_embeddings")
            print(f"✅ Qdrant is running")
            print(f"📊 Collection info: {info.points_count} points")
        except Exception as e:
            print(f"❌ Qdrant collection error: {e}")
            
    except Exception as e:
        print(f"❌ Qdrant not accessible: {e}")

async def main():
    """Run all checks"""
    print("🔧 Email Classification Debug Tool")
    print("=" * 50)
    
    await check_database_status()
    await check_fastapi_status()
    await check_qdrant_status()
    
    print("\n💡 Recommendations:")
    print("1. Make sure you have labeled at least 10 emails via bulk labeling")
    print("2. Ensure FastAPI service is running: python email_classifier_service.py")
    print("3. Ensure Qdrant is running on localhost:6333")
    print("4. Run the classifier: python run_classifier.py")

if __name__ == "__main__":
    asyncio.run(main())
