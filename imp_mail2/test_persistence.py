#!/usr/bin/env python3
"""
Test script to demonstrate email classifier persistence functionality.

This script shows how models and training data persist across service restarts.
"""

import requests
import json
import time
import sys
from typing import Dict, Any

class ClassifierPersistenceTest:
    """Test persistence functionality of the email classifier service"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.test_user_id = "test_user_persistence"
        
    def check_service_health(self) -> bool:
        """Check if the service is running"""
        try:
            response = requests.get(f"{self.base_url}/health")
            return response.status_code == 200
        except requests.exceptions.RequestException:
            return False
    
    def get_persistence_status(self) -> Dict[str, Any]:
        """Get current persistence status"""
        try:
            response = requests.get(f"{self.base_url}/persistence/status")
            if response.status_code == 200:
                return response.json()
            else:
                return {"status": "error", "message": f"HTTP {response.status_code}"}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": str(e)}
    
    def bulk_label_emails(self, important_ids: list, unimportant_ids: list) -> Dict[str, Any]:
        """Bulk label emails for training"""
        payload = {
            "user_id": self.test_user_id,
            "important_email_ids": important_ids,
            "unimportant_email_ids": unimportant_ids
        }
        
        try:
            response = requests.post(f"{self.base_url}/bulk-label", json=payload)
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": str(e)}
    
    def get_model_stats(self) -> Dict[str, Any]:
        """Get model statistics"""
        try:
            response = requests.get(f"{self.base_url}/stats/{self.test_user_id}")
            if response.status_code == 200:
                return response.json()
            else:
                return {"status": "error", "message": f"HTTP {response.status_code}"}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": str(e)}
    
    def reset_user_model(self) -> Dict[str, Any]:
        """Reset the test user's model"""
        try:
            response = requests.post(f"{self.base_url}/reset/{self.test_user_id}")
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": str(e)}
    
    def save_all_models(self) -> Dict[str, Any]:
        """Manually save all models"""
        try:
            response = requests.post(f"{self.base_url}/persistence/save-all")
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": str(e)}
    
    def run_persistence_test(self):
        """Run the full persistence test"""
        print("🔬 Email Classifier Persistence Test")
        print("=" * 50)
        
        # Check service health
        print("1. Checking service health...")
        if not self.check_service_health():
            print("❌ Service is not running. Please start the service first.")
            sys.exit(1)
        print("✅ Service is healthy")
        
        # Check initial persistence status
        print("\n2. Checking initial persistence status...")
        status = self.get_persistence_status()
        print(f"📊 Persistence status: {json.dumps(status, indent=2)}")
        
        # Reset user model to start fresh
        print(f"\n3. Resetting model for user: {self.test_user_id}")
        reset_result = self.reset_user_model()
        print(f"🔄 Reset result: {reset_result}")
        
        # Add some training data
        print("\n4. Adding training data...")
        important_emails = [
            "email_001_important",
            "email_002_important", 
            "email_003_important",
            "email_004_important",
            "email_005_important"
        ]
        
        unimportant_emails = [
            "email_101_spam",
            "email_102_spam",
            "email_103_spam", 
            "email_104_spam",
            "email_105_spam"
        ]
        
        label_result = self.bulk_label_emails(important_emails, unimportant_emails)
        print(f"🏷️  Labeling result: {json.dumps(label_result, indent=2)}")
        
        # Check model stats after training
        print("\n5. Checking model stats after training...")
        stats = self.get_model_stats()
        print(f"📈 Model stats: {json.dumps(stats, indent=2)}")
        
        # Force save all models
        print("\n6. Manually saving all models...")
        save_result = self.save_all_models()
        print(f"💾 Save result: {json.dumps(save_result, indent=2)}")
        
        # Check persistence status after saving
        print("\n7. Checking persistence status after saving...")
        final_status = self.get_persistence_status()
        print(f"📊 Final persistence status: {json.dumps(final_status, indent=2)}")
        
        # Instructions for testing restart
        print("\n" + "=" * 50)
        print("🎯 PERSISTENCE TEST INSTRUCTIONS")
        print("=" * 50)
        print("1. The model has been trained and saved to disk")
        print("2. Now restart the email classifier service:")
        print("   docker-compose restart email-classifier")
        print("3. After restart, run this script again to verify persistence")
        print("4. The model should load automatically with the same stats")
        print("\n✅ Test setup complete!")

def main():
    """Main test function"""
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        print("🔍 Verifying persistence after restart...")
        test = ClassifierPersistenceTest()
        
        if not test.check_service_health():
            print("❌ Service is not running")
            sys.exit(1)
        
        print("✅ Service is healthy after restart")
        
        # Check if our test user's model is loaded
        stats = test.get_model_stats()
        if stats.get("total_examples", 0) > 0:
            print(f"✅ Model persisted! Found {stats['total_examples']} training examples")
            print(f"📊 Model stats: {json.dumps(stats, indent=2)}")
        else:
            print("❌ Model did not persist - no training examples found")
        
        # Check persistence status
        status = test.get_persistence_status()
        print(f"📊 Persistence status: {json.dumps(status, indent=2)}")
        
    else:
        # Run initial setup
        test = ClassifierPersistenceTest()
        test.run_persistence_test()

if __name__ == "__main__":
    main()
