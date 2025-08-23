#!/usr/bin/env python3
"""
Quick Fix: Manually update a few emails to test data consistency

This script manually updates a few unclassified emails to test if both pages
show the same data after SQLite is updated.
"""

import sys
import os
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from sqlite_client import SQLiteEmailClient

def main():
    """Manually update a few emails for testing"""
    print("🔧 Quick Fix: Manually updating some emails")
    print("=" * 50)
    
    # Connect to database
    db_path = '../data/emails.db'
    client = SQLiteEmailClient(db_path)
    
    if not client.connect():
        print("❌ Failed to connect to database")
        return 1
    
    try:
        cursor = client.connection.cursor()
        
        # Get some unclassified emails
        cursor.execute("""
            SELECT id, subject, sender
            FROM emails 
            WHERE importance = 'unclassified'
            LIMIT 5
        """)
        
        unclassified = cursor.fetchall()
        
        if not unclassified:
            print("✅ No unclassified emails found!")
            return 0
            
        print(f"📝 Found {len(unclassified)} unclassified emails")
        
        # Update first 2 as important, next 2 as not important
        for i, email in enumerate(unclassified):
            email_id = email['id']
            subject = email['subject'][:50] + "..."
            
            if i < 2:
                importance = "important"
                confidence = 0.85
            else:
                importance = "not_important" 
                confidence = 0.75
                
            # Update the email
            cursor.execute("""
                UPDATE emails 
                SET importance = ?, importance_confidence = ?, user_labeled = 0
                WHERE id = ?
            """, (importance, confidence, email_id))
            
            print(f"✅ Updated: {subject} → {importance} ({confidence})")
        
        client.connection.commit()
        print(f"\n🎯 Updated {len(unclassified)} emails!")
        print("Now check both /emails and /worth-it pages - they should show the same data!")
        
        return 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1
        
    finally:
        client.disconnect()

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
