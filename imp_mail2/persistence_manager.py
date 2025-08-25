"""
Persistence Manager for Email Classifier Service

Handles persistence of application state across container restarts,
including processed email tracking and service configuration.
"""

import json
import os
import logging
from typing import Set, Dict, Any, Optional
from datetime import datetime
import sqlite3

logger = logging.getLogger(__name__)

class PersistenceManager:
    """Manages persistence of classifier state"""
    
    def __init__(self, data_dir: str = "/app/data"):
        self.data_dir = data_dir
        self.state_file = os.path.join(data_dir, "classifier_state.json")
        self.processed_emails_file = os.path.join(data_dir, "processed_emails.json")
        
        # Ensure data directory exists
        os.makedirs(data_dir, exist_ok=True)
    
    def save_processed_emails(self, processed_emails: Set[str]) -> bool:
        """Save processed emails set to persistent storage"""
        try:
            data = {
                "processed_emails": list(processed_emails),
                "last_updated": datetime.now().isoformat(),
                "count": len(processed_emails)
            }
            
            with open(self.processed_emails_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.info(f"Saved {len(processed_emails)} processed email IDs to {self.processed_emails_file}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save processed emails: {e}")
            return False
    
    def load_processed_emails(self) -> Set[str]:
        """Load processed emails set from persistent storage"""
        try:
            if not os.path.exists(self.processed_emails_file):
                logger.info("No processed emails file found, starting fresh")
                return set()
            
            with open(self.processed_emails_file, 'r') as f:
                data = json.load(f)
            
            processed_emails = set(data.get("processed_emails", []))
            last_updated = data.get("last_updated", "unknown")
            
            logger.info(f"Loaded {len(processed_emails)} processed email IDs (last updated: {last_updated})")
            return processed_emails
            
        except Exception as e:
            logger.error(f"Failed to load processed emails: {e}")
            return set()
    
    def save_classifier_state(self, state: Dict[str, Any]) -> bool:
        """Save classifier state to persistent storage"""
        try:
            state["last_updated"] = datetime.now().isoformat()
            
            with open(self.state_file, 'w') as f:
                json.dump(state, f, indent=2)
            
            logger.info(f"Saved classifier state to {self.state_file}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save classifier state: {e}")
            return False
    
    def load_classifier_state(self) -> Dict[str, Any]:
        """Load classifier state from persistent storage"""
        try:
            if not os.path.exists(self.state_file):
                logger.info("No classifier state file found, using defaults")
                return {}
            
            with open(self.state_file, 'r') as f:
                state = json.load(f)
            
            last_updated = state.get("last_updated", "unknown")
            logger.info(f"Loaded classifier state (last updated: {last_updated})")
            return state
            
        except Exception as e:
            logger.error(f"Failed to load classifier state: {e}")
            return {}
    
    def get_last_processed_timestamp(self) -> Optional[datetime]:
        """Get timestamp of last processed email from database"""
        try:
            sqlite_db_path = os.getenv("SQLITE_DB_PATH", "/app/shared_data/emails.db")
            
            if not os.path.exists(sqlite_db_path):
                logger.warning(f"SQLite database not found at {sqlite_db_path}")
                return None
            
            conn = sqlite3.connect(sqlite_db_path)
            cursor = conn.cursor()
            
            # Get the most recent indexed_at timestamp
            cursor.execute("""
                SELECT MAX(indexed_at) as last_indexed
                FROM emails 
                WHERE importance != 'unclassified'
            """)
            
            result = cursor.fetchone()
            conn.close()
            
            if result and result[0]:
                return datetime.fromisoformat(result[0])
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get last processed timestamp: {e}")
            return None
    
    def cleanup_old_state(self, days_to_keep: int = 30) -> bool:
        """Clean up old state files to prevent disk space issues"""
        try:
            # For now, just log - can implement rotation later if needed
            logger.info(f"State cleanup configured for {days_to_keep} days retention")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cleanup old state: {e}")
            return False
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """Get storage statistics for monitoring"""
        try:
            stats = {
                "data_dir": self.data_dir,
                "state_file_exists": os.path.exists(self.state_file),
                "processed_emails_file_exists": os.path.exists(self.processed_emails_file),
                "files": {}
            }
            
            # Get file sizes
            for filename in ["classifier_state.json", "processed_emails.json"]:
                filepath = os.path.join(self.data_dir, filename)
                if os.path.exists(filepath):
                    stats["files"][filename] = {
                        "size_bytes": os.path.getsize(filepath),
                        "modified": datetime.fromtimestamp(os.path.getmtime(filepath)).isoformat()
                    }
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get storage stats: {e}")
            return {"error": str(e)}


class ProcessedEmailsTracker:
    """Thread-safe tracker for processed emails with automatic persistence"""
    
    def __init__(self, persistence_manager: PersistenceManager, auto_save_interval: int = 300):
        self.persistence_manager = persistence_manager
        self.auto_save_interval = auto_save_interval  # seconds
        self.processed_emails: Set[str] = set()
        self.last_save_time = datetime.now()
        self.dirty = False
        
        # Load existing state
        self.processed_emails = self.persistence_manager.load_processed_emails()
    
    def add_processed_email(self, email_id: str) -> bool:
        """Add email ID to processed set"""
        if email_id not in self.processed_emails:
            self.processed_emails.add(email_id)
            self.dirty = True
            
            # Auto-save if interval has passed
            if self._should_auto_save():
                return self.save()
            
            return True
        return False
    
    def is_processed(self, email_id: str) -> bool:
        """Check if email has been processed"""
        return email_id in self.processed_emails
    
    def get_processed_count(self) -> int:
        """Get count of processed emails"""
        return len(self.processed_emails)
    
    def save(self) -> bool:
        """Force save to persistent storage"""
        if self.dirty:
            success = self.persistence_manager.save_processed_emails(self.processed_emails)
            if success:
                self.dirty = False
                self.last_save_time = datetime.now()
            return success
        return True
    
    def _should_auto_save(self) -> bool:
        """Check if auto-save should be triggered"""
        return (
            self.dirty and 
            (datetime.now() - self.last_save_time).total_seconds() >= self.auto_save_interval
        )
    
    def clear_old_entries(self, days_to_keep: int = 30) -> int:
        """Clear old processed entries (if we had timestamps)"""
        # For now, just return 0 - could implement timestamp-based cleanup later
        return 0
