"""
SQLite Client for Email Content

Connects to the SQLite database to fetch actual email content
(subject, sender, body, etc.) that complements the Qdrant embeddings.
"""

import sqlite3
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class SQLiteEmailClient:
    """Client for accessing email content from SQLite database"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.connection = None
    
    def connect(self):
        """Connect to SQLite database"""
        try:
            self.connection = sqlite3.connect(self.db_path)
            self.connection.row_factory = sqlite3.Row  # Enable column access by name
            logger.info(f"Connected to SQLite database: {self.db_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to SQLite database: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from SQLite database"""
        if self.connection:
            self.connection.close()
            self.connection = None
    
    def get_email_by_id(self, email_id: str) -> Optional[Dict[str, Any]]:
        """Get email content by email ID"""
        if not self.connection:
            if not self.connect():
                return None
        
        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT id, user_id, message_id, subject, sender, recipients, 
                       content, html_content, received_at, indexed_at, 
                       importance, importance_confidence, user_labeled, 
                       vector_id, has_attachments, thread_id, labels
                FROM emails 
                WHERE id = ?
            """, (email_id,))
            
            row = cursor.fetchone()
            if row:
                return {
                    'id': row['id'],
                    'userId': row['user_id'],
                    'messageId': row['message_id'],
                    'subject': row['subject'],
                    'sender': row['sender'],
                    'recipients': json.loads(row['recipients']) if row['recipients'] else [],
                    'content': row['content'],
                    'htmlContent': row['html_content'],
                    'receivedAt': row['received_at'],
                    'indexedAt': row['indexed_at'],
                    'importance': row['importance'],
                    'importanceConfidence': row['importance_confidence'],
                    'userLabeled': bool(row['user_labeled']),
                    'vectorId': row['vector_id'],
                    'hasAttachments': bool(row['has_attachments']),
                    'threadId': row['thread_id'],
                    'labels': json.loads(row['labels']) if row['labels'] else []
                }
            return None
            
        except Exception as e:
            logger.error(f"Error fetching email {email_id}: {e}")
            return None
    
    def get_emails_by_ids(self, email_ids: List[str]) -> List[Dict[str, Any]]:
        """Get multiple emails by IDs"""
        if not email_ids:
            return []
        
        if not self.connection:
            if not self.connect():
                return []
        
        try:
            cursor = self.connection.cursor()
            placeholders = ','.join(['?' for _ in email_ids])
            cursor.execute(f"""
                SELECT id, user_id, message_id, subject, sender, recipients, 
                       content, html_content, received_at, indexed_at, 
                       importance, importance_confidence, user_labeled, 
                       vector_id, has_attachments, thread_id, labels
                FROM emails 
                WHERE id IN ({placeholders})
            """, email_ids)
            
            emails = []
            for row in cursor.fetchall():
                emails.append({
                    'id': row['id'],
                    'userId': row['user_id'],
                    'messageId': row['message_id'],
                    'subject': row['subject'],
                    'sender': row['sender'],
                    'recipients': json.loads(row['recipients']) if row['recipients'] else [],
                    'content': row['content'],
                    'htmlContent': row['html_content'],
                    'receivedAt': row['received_at'],
                    'indexedAt': row['indexed_at'],
                    'importance': row['importance'],
                    'importanceConfidence': row['importance_confidence'],
                    'userLabeled': bool(row['user_labeled']),
                    'vectorId': row['vector_id'],
                    'hasAttachments': bool(row['has_attachments']),
                    'threadId': row['thread_id'],
                    'labels': json.loads(row['labels']) if row['labels'] else []
                })
            
            return emails
            
        except Exception as e:
            logger.error(f"Error fetching emails {email_ids}: {e}")
            return []
    
    def get_user_emails(self, user_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get all emails for a specific user"""
        if not self.connection:
            if not self.connect():
                return []
        
        try:
            cursor = self.connection.cursor()
            query = """
                SELECT id, user_id, message_id, subject, sender, recipients, 
                       content, html_content, received_at, indexed_at, 
                       importance, importance_confidence, user_labeled, 
                       vector_id, has_attachments, thread_id, labels
                FROM emails 
                WHERE user_id = ?
                ORDER BY received_at DESC
            """
            
            if limit:
                query += f" LIMIT {limit}"
            
            cursor.execute(query, (user_id,))
            
            emails = []
            for row in cursor.fetchall():
                emails.append({
                    'id': row['id'],
                    'userId': row['user_id'],
                    'messageId': row['message_id'],
                    'subject': row['subject'],
                    'sender': row['sender'],
                    'recipients': json.loads(row['recipients']) if row['recipients'] else [],
                    'content': row['content'],
                    'htmlContent': row['html_content'],
                    'receivedAt': row['received_at'],
                    'indexedAt': row['indexed_at'],
                    'importance': row['importance'],
                    'importanceConfidence': row['importance_confidence'],
                    'userLabeled': bool(row['user_labeled']),
                    'vectorId': row['vector_id'],
                    'hasAttachments': bool(row['has_attachments']),
                    'threadId': row['thread_id'],
                    'labels': json.loads(row['labels']) if row['labels'] else []
                })
            
            return emails
            
        except Exception as e:
            logger.error(f"Error fetching user emails for {user_id}: {e}")
            return []
    
    def get_labeled_emails(self, user_id: str) -> List[Dict[str, Any]]:
        """Get emails that have been manually labeled by the user"""
        if not self.connection:
            if not self.connect():
                return []
        
        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT id, user_id, message_id, subject, sender, recipients, 
                       content, html_content, received_at, indexed_at, 
                       importance, importance_confidence, user_labeled, 
                       vector_id, has_attachments, thread_id, labels
                FROM emails 
                WHERE user_id = ? AND user_labeled = 1
                ORDER BY received_at DESC
            """, (user_id,))
            
            emails = []
            for row in cursor.fetchall():
                emails.append({
                    'id': row['id'],
                    'userId': row['user_id'],
                    'messageId': row['message_id'],
                    'subject': row['subject'],
                    'sender': row['sender'],
                    'recipients': json.loads(row['recipients']) if row['recipients'] else [],
                    'content': row['content'],
                    'htmlContent': row['html_content'],
                    'receivedAt': row['received_at'],
                    'indexedAt': row['indexed_at'],
                    'importance': row['importance'],
                    'importanceConfidence': row['importance_confidence'],
                    'userLabeled': bool(row['user_labeled']),
                    'vectorId': row['vector_id'],
                    'hasAttachments': bool(row['has_attachments']),
                    'threadId': row['thread_id'],
                    'labels': json.loads(row['labels']) if row['labels'] else []
                })
            
            return emails
            
        except Exception as e:
            logger.error(f"Error fetching labeled emails for {user_id}: {e}")
            return []
    
    def get_database_stats(self) -> Dict[str, Any]:
        """Get statistics about the email database"""
        if not self.connection:
            if not self.connect():
                return {}
        
        try:
            cursor = self.connection.cursor()
            
            # Total emails
            cursor.execute("SELECT COUNT(*) as total FROM emails")
            total = cursor.fetchone()['total']
            
            # Labeled emails
            cursor.execute("SELECT COUNT(*) as labeled FROM emails WHERE user_labeled = 1")
            labeled = cursor.fetchone()['labeled']
            
            # Important emails
            cursor.execute("SELECT COUNT(*) as important FROM emails WHERE importance = 'important'")
            important = cursor.fetchone()['important']
            
            # Users
            cursor.execute("SELECT COUNT(DISTINCT user_id) as users FROM emails")
            users = cursor.fetchone()['users']
            
            return {
                'total_emails': total,
                'labeled_emails': labeled,
                'important_emails': important,
                'total_users': users,
                'labeling_percentage': (labeled / total * 100) if total > 0 else 0
            }
            
        except Exception as e:
            logger.error(f"Error getting database stats: {e}")
            return {}

def truncate_text(text: str, max_length: int = 100) -> str:
    """Truncate text for display purposes"""
    if not text:
        return ""
    
    if len(text) <= max_length:
        return text
    
    return text[:max_length-3] + "..."

def clean_html_content(html_content: str) -> str:
    """Remove HTML tags and clean up content for display"""
    if not html_content:
        return ""
    
    import re
    # Remove HTML tags
    clean_text = re.sub(r'<[^>]+>', ' ', html_content)
    # Remove extra whitespace
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    
    return clean_text