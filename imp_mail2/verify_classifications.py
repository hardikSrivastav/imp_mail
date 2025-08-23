"""
Email Classification Verification Script

This script fetches the actual email content and lets you verify
whether the model's classifications are accurate.
"""

import asyncio
import httpx
import json
from typing import List, Dict, Any
from datetime import datetime

# Configuration
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "email_embeddings"
API_BASE_URL = "http://localhost:8000"

async def get_email_content_from_sqlite(email_ids: List[str]) -> Dict[str, Dict]:
    """
    Fetch actual email content from SQLite database
    Note: This is a placeholder - you'll need to adapt this to your SQLite setup
    """
    # This would connect to your SQLite database to get full email content
    # For now, we'll return empty dict and rely on Qdrant metadata
    return {}

async def verify_email_classifications():
    """Verify the accuracy of email classifications"""
    
    print("🔍 Email Classification Verification")
    print("=" * 60)
    
    try:
        from vector_store_client import QdrantClient
        
        # Initialize Qdrant client
        qdrant_client = QdrantClient(
            host=QDRANT_HOST,
            port=QDRANT_PORT,
            collection_name=COLLECTION_NAME
        )
        
        print("✅ Connected to Qdrant database")
        
        # Get some sample emails for testing
        print("\n📧 Fetching sample emails for verification...")
        
        scroll_result = qdrant_client.client.scroll(
            collection_name=COLLECTION_NAME,
            limit=15,
            with_payload=True,
            with_vectors=False
        )
        
        points, _ = scroll_result
        sample_emails = []
        
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
        
        if len(sample_emails) < 10:
            print(f"❌ Need at least 10 emails, found {len(sample_emails)}")
            return
        
        # Use the same logic as the test script
        training_emails = sample_emails[:10]
        test_emails = sample_emails[10:15] if len(sample_emails) > 10 else sample_emails[5:10]
        
        print(f"📚 Using {len(training_emails)} emails for training")
        print(f"🎯 Verifying {len(test_emails)} classified emails")
        
        # First, let's train the model (same as test script)
        async with httpx.AsyncClient(timeout=30.0) as client:
            
            # Simulate training (5 important, 5 not important)
            import random
            important_emails = random.sample(training_emails, 5)
            unimportant_emails = [e for e in training_emails if e not in important_emails]
            
            labeled_examples = []
            for email in important_emails:
                labeled_examples.append({
                    "email_id": email['email_id'],
                    "is_important": True,
                    "confidence": 1.0
                })
            
            for email in unimportant_emails:
                labeled_examples.append({
                    "email_id": email['email_id'],
                    "is_important": False,
                    "confidence": 1.0
                })
            
            # Train the model
            training_request = {
                "user_id": "verification_user",
                "labeled_examples": labeled_examples,
                "retrain": True
            }
            
            print("\n🤖 Training model for verification...")
            train_response = await client.post(f"{API_BASE_URL}/train", json=training_request)
            
            if train_response.status_code != 200:
                print(f"❌ Training failed: {train_response.text}")
                return
            
            print("✅ Model trained successfully")
            
            # Now classify the test emails
            test_email_ids = [email['email_id'] for email in test_emails]
            
            classification_request = {
                "user_id": "verification_user",
                "email_ids": test_email_ids,
                "return_confidence": True
            }
            
            print("\n🔮 Classifying test emails...")
            classify_response = await client.post(f"{API_BASE_URL}/classify", json=classification_request)
            
            if classify_response.status_code != 200:
                print(f"❌ Classification failed: {classify_response.text}")
                return
            
            results = classify_response.json()
            
            print(f"\n📊 VERIFICATION RESULTS")
            print("=" * 60)
            
            # Now let's get detailed information about each classified email
            for i, result in enumerate(results['results']):
                email_id = result['email_id']
                is_important = result['is_important']
                confidence = result['confidence']
                reasoning = result.get('reasoning', 'No reasoning provided')
                
                # Find the corresponding email data
                email_data = next((e for e in test_emails if e['email_id'] == email_id), None)
                
                print(f"\n📧 EMAIL {i+1}: {email_id}")
                print("-" * 40)
                
                if email_data:
                    print(f"👤 User ID: {email_data['user_id']}")
                    print(f"📅 Created: {email_data['created_at']}")
                    print(f"🤖 Embedding Model: {email_data['embedding_model']}")
                
                # Get additional details from Qdrant
                try:
                    email_details = await qdrant_client.get_email_by_id(email_id)
                    if email_details and email_details.get('metadata'):
                        metadata = email_details['metadata']
                        print(f"📍 Qdrant ID: {email_details.get('qdrant_id', 'N/A')}")
                        
                        # Show any additional metadata
                        for key, value in metadata.items():
                            if key not in ['emailId', 'userId', 'createdAt', 'embeddingModel']:
                                print(f"📋 {key}: {value}")
                
                except Exception as e:
                    print(f"⚠️  Could not fetch additional details: {e}")
                
                # Show classification result
                importance_icon = "🔴" if is_important else "⚪"
                importance_text = "IMPORTANT" if is_important else "NOT IMPORTANT"
                
                print(f"\n🎯 CLASSIFICATION:")
                print(f"   {importance_icon} {importance_text}")
                print(f"   🎲 Confidence: {confidence:.3f}")
                print(f"   💭 Reasoning: {reasoning}")
                
                # Ask for manual verification
                print(f"\n❓ MANUAL VERIFICATION:")
                print(f"   Based on the information above, does this classification seem accurate?")
                
                # You could add interactive input here if desired
                # user_input = input("   Enter 'y' for correct, 'n' for incorrect, 's' to skip: ")
                
                print("\n" + "="*60)
            
            # Summary
            print(f"\n📈 SUMMARY:")
            print(f"   • Total emails classified: {len(results['results'])}")
            print(f"   • Important: {sum(1 for r in results['results'] if r['is_important'])}")
            print(f"   • Not Important: {sum(1 for r in results['results'] if not r['is_important'])}")
            print(f"   • Average Confidence: {sum(r['confidence'] for r in results['results']) / len(results['results']):.3f}")
            print(f"   • Model Version: {results['model_version']}")
            
            print(f"\n💡 TO IMPROVE ACCURACY:")
            print(f"   1. Provide more training examples (currently using 10)")
            print(f"   2. Use actual email content/subject for better context")
            print(f"   3. Add domain-specific features (sender reputation, keywords)")
            print(f"   4. Collect user feedback on these classifications")
            
    except ImportError:
        print("❌ qdrant-client not installed. Install with: pip install qdrant-client")
    except Exception as e:
        print(f"❌ Error during verification: {e}")
        import traceback
        traceback.print_exc()

async def interactive_verification():
    """Interactive verification where you can manually check each classification"""
    
    print("🎯 Interactive Email Classification Verification")
    print("=" * 60)
    print("This will show you each classified email and let you verify accuracy.")
    print()
    
    await verify_email_classifications()

if __name__ == "__main__":
    print("🔍 Starting Email Classification Verification...")
    print()
    print("This script will:")
    print("1. Connect to your Qdrant database")
    print("2. Train a model with sample data")
    print("3. Classify 5 test emails")
    print("4. Show detailed information for manual verification")
    print()
    
    try:
        asyncio.run(interactive_verification())
    except KeyboardInterrupt:
        print("\n⏹️  Verification interrupted by user")
    except Exception as e:
        print(f"\n❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()
