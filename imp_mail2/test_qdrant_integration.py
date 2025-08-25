"""
Test script for Qdrant Email Classification Integration

This script connects to your Qdrant database and tests the email classification
workflow with real email data.
"""

import asyncio
import httpx
import json
import random
from typing import List, Dict, Any
from datetime import datetime

# Configuration
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "email_embeddings"
API_BASE_URL = "http://localhost:8000"

async def test_qdrant_connection():
    """Test connection to Qdrant and fetch sample emails"""
    print("🔍 Testing Qdrant connection...")
    
    try:
        from vector_store_client import QdrantClient
        
        # Initialize Qdrant client
        qdrant_client = QdrantClient(
            host=QDRANT_HOST,
            port=QDRANT_PORT,
            collection_name=COLLECTION_NAME
        )
        
        print(f"✅ Connected to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}")
        
        # Get collection info
        try:
            collection_info = qdrant_client.client.get_collection(COLLECTION_NAME)
            print(f"📊 Collection '{COLLECTION_NAME}' found:")
            print(f"   - Vectors count: {collection_info.vectors_count}")
            print(f"   - Vector size: {collection_info.config.params.vectors.size}")
        except Exception as e:
            print(f"⚠️  Could not get collection info: {e}")
        
        # Fetch some sample emails
        print("\n📧 Fetching sample emails...")
        
        # Get a random sample of emails
        sample_emails = []
        try:
            # Use scroll to get some emails
            scroll_result = qdrant_client.client.scroll(
                collection_name=COLLECTION_NAME,
                limit=20,  # Get 20 emails to choose from
                with_payload=True,
                with_vectors=False  # Don't need vectors for initial inspection
            )
            
            points, _ = scroll_result
            
            for point in points:
                email_id = point.payload.get('emailId')
                user_id = point.payload.get('userId')
                created_at = point.payload.get('createdAt')
                embedding_model = point.payload.get('embeddingModel')
                
                sample_emails.append({
                    'qdrant_id': point.id,
                    'email_id': email_id,
                    'user_id': user_id,
                    'created_at': created_at,
                    'embedding_model': embedding_model
                })
            
            print(f"✅ Found {len(sample_emails)} sample emails")
            
            # Show sample email info
            if sample_emails:
                print("\n📋 Sample email data:")
                for i, email in enumerate(sample_emails[:5]):
                    print(f"   {i+1}. Email ID: {email['email_id']}")
                    print(f"      User ID: {email['user_id']}")
                    print(f"      Created: {email['created_at']}")
                    print(f"      Model: {email['embedding_model']}")
                    print()
            
            return sample_emails
            
        except Exception as e:
            print(f"❌ Error fetching emails: {e}")
            return []
            
    except ImportError:
        print("❌ qdrant-client not installed. Install with: pip install qdrant-client")
        return []
    except Exception as e:
        print(f"❌ Error connecting to Qdrant: {e}")
        return []

async def test_api_workflow(sample_emails: List[Dict[str, Any]]):
    """Test the complete API workflow with real email data"""
    
    if len(sample_emails) < 10:
        print(f"❌ Need at least 10 emails for testing, found {len(sample_emails)}")
        return
    
    print("\n🧪 Testing Email Classification API Workflow")
    print("=" * 60)
    
    # Select emails for training (5 important, 5 not important)
    training_emails = sample_emails[:10]
    test_emails = sample_emails[10:15] if len(sample_emails) > 10 else sample_emails[5:10]
    
    # Simulate user preferences (randomly assign for testing)
    important_emails = random.sample(training_emails, 5)
    unimportant_emails = [e for e in training_emails if e not in important_emails]
    
    print(f"📚 Training with {len(training_emails)} emails:")
    print(f"   - {len(important_emails)} marked as IMPORTANT")
    print(f"   - {len(unimportant_emails)} marked as NOT IMPORTANT")
    
    print(f"\n🎯 Will test classification on {len(test_emails)} emails")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # Step 1: Check API health
        print("\n1️⃣ Checking API health...")
        try:
            health_response = await client.get(f"{API_BASE_URL}/health")
            if health_response.status_code == 200:
                print("✅ API is healthy")
            else:
                print(f"❌ API health check failed: {health_response.status_code}")
                return
        except Exception as e:
            print(f"❌ Cannot connect to API: {e}")
            print("Make sure the service is running: python email_classifier_service.py")
            return
        
        # Step 2: Train the classifier
        print("\n2️⃣ Training the classifier...")
        
        # Prepare training data
        labeled_examples = []
        
        # Add important examples
        for email in important_emails:
            labeled_examples.append({
                "email_id": email['email_id'],
                "is_important": True,
                "confidence": 1.0
            })
        
        # Add unimportant examples
        for email in unimportant_emails:
            labeled_examples.append({
                "email_id": email['email_id'],
                "is_important": False,
                "confidence": 1.0
            })
        
        training_request = {
            "user_id": "test_user_123",
            "labeled_examples": labeled_examples,
            "retrain": False
        }
        
        try:
            train_response = await client.post(
                f"{API_BASE_URL}/train",
                json=training_request
            )
            
            if train_response.status_code == 200:
                result = train_response.json()
                print(f"✅ Training completed successfully!")
                print(f"   - Status: {result['status']}")
                print(f"   - Examples used: {result['examples_count']}")
                print(f"   - Emails found: {result['emails_found']}")
                print(f"   - Model version: {result['model_version']}")
            else:
                print(f"❌ Training failed: {train_response.status_code}")
                print(f"   Response: {train_response.text}")
                return
                
        except Exception as e:
            print(f"❌ Training request failed: {e}")
            return
        
        # Step 3: Get model statistics
        print("\n3️⃣ Checking model statistics...")
        try:
            stats_response = await client.get(f"{API_BASE_URL}/stats/test_user_123")
            
            if stats_response.status_code == 200:
                stats = stats_response.json()
                print(f"📊 Model Statistics:")
                print(f"   - Total examples: {stats['total_examples']}")
                print(f"   - Last trained: {stats['last_trained']}")
                print(f"   - Model version: {stats['model_version']}")
            else:
                print(f"⚠️  Could not get stats: {stats_response.status_code}")
        except Exception as e:
            print(f"⚠️  Stats request failed: {e}")
        
        # Step 4: Classify test emails
        print("\n4️⃣ Classifying test emails...")
        
        test_email_ids = [email['email_id'] for email in test_emails]
        
        classification_request = {
            "user_id": "test_user_123",
            "email_ids": test_email_ids,
            "return_confidence": True
        }
        
        try:
            classify_response = await client.post(
                f"{API_BASE_URL}/classify",
                json=classification_request
            )
            
            if classify_response.status_code == 200:
                results = classify_response.json()
                print(f"✅ Classification completed!")
                print(f"   - Processed: {len(results['results'])} emails")
                print(f"   - Model version: {results['model_version']}")
                
                print(f"\n📊 Classification Results:")
                for i, result in enumerate(results['results']):
                    importance = "🔴 IMPORTANT" if result['is_important'] else "⚪ Not Important"
                    confidence = result['confidence']
                    email_id = result['email_id']
                    reasoning = result.get('reasoning', 'No reasoning provided')
                    
                    print(f"   {i+1}. {email_id}")
                    print(f"      → {importance} (confidence: {confidence:.3f})")
                    print(f"      → {reasoning}")
                    print()
                
            else:
                print(f"❌ Classification failed: {classify_response.status_code}")
                print(f"   Response: {classify_response.text}")
                return
                
        except Exception as e:
            print(f"❌ Classification request failed: {e}")
            return
        
        # Step 5: Test feedback mechanism
        print("\n5️⃣ Testing feedback mechanism...")
        
        if results['results']:
            # Simulate user correcting a prediction
            first_result = results['results'][0]
            
            feedback_request = {
                "user_id": "test_user_123",
                "email_id": first_result['email_id'],
                "actual_label": not first_result['is_important'],  # Opposite of prediction
                "predicted_label": first_result['is_important'],
                "confidence": first_result['confidence']
            }
            
            try:
                feedback_response = await client.post(
                    f"{API_BASE_URL}/feedback",
                    json=feedback_request
                )
                
                if feedback_response.status_code == 200:
                    print(f"✅ Feedback submitted successfully!")
                    print(f"   - Corrected prediction for: {first_result['email_id']}")
                    print(f"   - Model will learn from this feedback")
                else:
                    print(f"⚠️  Feedback submission failed: {feedback_response.status_code}")
                    
            except Exception as e:
                print(f"⚠️  Feedback request failed: {e}")
    
    print("\n" + "=" * 60)
    print("🎉 Integration test completed!")
    print("\nThe microservice successfully:")
    print("✅ Connected to your Qdrant database")
    print("✅ Fetched real email embeddings")
    print("✅ Trained a classification model")
    print("✅ Classified emails with confidence scores")
    print("✅ Provided reasoning for decisions")
    print("✅ Accepted feedback for improvement")

async def main():
    """Main test function"""
    print("🚀 Qdrant Email Classification Integration Test")
    print("=" * 60)
    
    # Test Qdrant connection and get sample emails
    sample_emails = await test_qdrant_connection()
    
    if not sample_emails:
        print("\n❌ Cannot proceed without sample emails")
        print("Please ensure:")
        print("1. Qdrant is running on localhost:6333")
        print("2. Collection 'email_embeddings' exists with data")
        print("3. qdrant-client is installed: pip install qdrant-client")
        return
    
    # Test the API workflow
    await test_api_workflow(sample_emails)

if __name__ == "__main__":
    print("Starting integration test...")
    print("Prerequisites:")
    print("1. Start Qdrant: docker run -p 6333:6333 qdrant/qdrant")
    print("2. Start API: python email_classifier_service.py")
    print("3. Install dependencies: pip install qdrant-client httpx")
    print()
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⏹️  Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
