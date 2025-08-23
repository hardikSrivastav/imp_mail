"""
Vector Store Client

Interface for interacting with the email vector store.
Supports various vector databases (Pinecone, Weaviate, Chroma, etc.)
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any, Tuple
import numpy as np
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

class VectorSearchResult(BaseModel):
    """Result from vector similarity search"""
    email_id: str
    score: float
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None

class VectorStoreClient(ABC):
    """Abstract base class for vector store clients"""
    
    @abstractmethod
    async def get_email_by_id(self, email_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve email data by ID"""
        pass
    
    @abstractmethod
    async def get_emails_by_ids(self, email_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieve multiple emails by IDs"""
        pass
    
    @abstractmethod
    async def search_similar_emails(
        self, 
        query_embedding: List[float], 
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[VectorSearchResult]:
        """Search for similar emails using vector similarity"""
        pass
    
    @abstractmethod
    async def get_user_emails(
        self, 
        user_id: str, 
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get all emails for a specific user"""
        pass

class PineconeClient(VectorStoreClient):
    """Pinecone vector store client"""
    
    def __init__(self, api_key: str, environment: str, index_name: str):
        import pinecone
        
        pinecone.init(api_key=api_key, environment=environment)
        self.index = pinecone.Index(index_name)
        self.index_name = index_name
    
    async def get_email_by_id(self, email_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve email data by ID from Pinecone"""
        try:
            response = self.index.fetch(ids=[email_id])
            if email_id in response['vectors']:
                vector_data = response['vectors'][email_id]
                return {
                    'email_id': email_id,
                    'embedding': vector_data['values'],
                    'metadata': vector_data.get('metadata', {})
                }
            return None
        except Exception as e:
            logger.error(f"Error fetching email {email_id}: {str(e)}")
            return None
    
    async def get_emails_by_ids(self, email_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieve multiple emails by IDs from Pinecone"""
        try:
            response = self.index.fetch(ids=email_ids)
            emails = []
            
            for email_id in email_ids:
                if email_id in response['vectors']:
                    vector_data = response['vectors'][email_id]
                    emails.append({
                        'email_id': email_id,
                        'embedding': vector_data['values'],
                        'metadata': vector_data.get('metadata', {})
                    })
            
            return emails
        except Exception as e:
            logger.error(f"Error fetching emails {email_ids}: {str(e)}")
            return []
    
    async def search_similar_emails(
        self, 
        query_embedding: List[float], 
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[VectorSearchResult]:
        """Search for similar emails using Pinecone"""
        try:
            response = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                filter=filters,
                include_metadata=True,
                include_values=True
            )
            
            results = []
            for match in response['matches']:
                results.append(VectorSearchResult(
                    email_id=match['id'],
                    score=match['score'],
                    metadata=match.get('metadata', {}),
                    embedding=match.get('values', [])
                ))
            
            return results
        except Exception as e:
            logger.error(f"Error searching similar emails: {str(e)}")
            return []
    
    async def get_user_emails(
        self, 
        user_id: str, 
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get all emails for a specific user from Pinecone"""
        try:
            # Use metadata filtering to get user's emails
            filter_dict = {"user_id": user_id}
            
            # Pinecone doesn't have a direct "get all" method, so we'll use a dummy query
            # In practice, you might need to maintain a separate index or use query with filters
            dummy_vector = [0.0] * 768  # Assuming 768-dim embeddings
            
            response = self.index.query(
                vector=dummy_vector,
                top_k=limit or 10000,  # Large number to get all
                filter=filter_dict,
                include_metadata=True,
                include_values=True
            )
            
            emails = []
            for match in response['matches']:
                emails.append({
                    'email_id': match['id'],
                    'embedding': match.get('values', []),
                    'metadata': match.get('metadata', {})
                })
            
            return emails
        except Exception as e:
            logger.error(f"Error fetching user emails for {user_id}: {str(e)}")
            return []

class QdrantClient(VectorStoreClient):
    """Qdrant vector store client for email embeddings"""
    
    def __init__(self, host: str = "localhost", port: int = 6333, collection_name: str = "email_embeddings"):
        try:
            from qdrant_client import QdrantClient as QdrantClientLib
            from qdrant_client.models import Distance, VectorParams
        except ImportError:
            raise ImportError("qdrant-client is required. Install with: pip install qdrant-client")
        
        self.client = QdrantClientLib(host=host, port=port)
        self.collection_name = collection_name
        
        # Ensure collection exists with correct configuration
        try:
            collection_info = self.client.get_collection(collection_name)
            logger.info(f"Connected to existing Qdrant collection: {collection_name}")
        except Exception:
            logger.info(f"Collection {collection_name} not found, but assuming it exists")
    
    async def get_email_by_id(self, email_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve email data by email ID from Qdrant"""
        try:
            # Search for points with matching emailId in payload
            search_result = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter={
                    "must": [
                        {
                            "key": "emailId",
                            "match": {"value": email_id}
                        }
                    ]
                },
                limit=1,
                with_payload=True,
                with_vectors=True
            )
            
            if search_result[0]:  # points, next_page_offset
                point = search_result[0][0]
                return {
                    'email_id': email_id,
                    'embedding': point.vector,
                    'metadata': point.payload,
                    'qdrant_id': point.id
                }
            return None
        except Exception as e:
            logger.error(f"Error fetching email {email_id}: {str(e)}")
            return None
    
    async def get_emails_by_ids(self, email_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieve multiple emails by email IDs from Qdrant"""
        try:
            emails = []
            
            # Search for points with matching emailIds
            search_result = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter={
                    "must": [
                        {
                            "key": "emailId",
                            "match": {"any": email_ids}
                        }
                    ]
                },
                limit=len(email_ids),
                with_payload=True,
                with_vectors=True
            )
            
            for point in search_result[0]:  # points from (points, next_page_offset)
                email_id = point.payload.get('emailId')
                if email_id in email_ids:
                    emails.append({
                        'email_id': email_id,
                        'embedding': point.vector,
                        'metadata': point.payload,
                        'qdrant_id': point.id
                    })
            
            return emails
        except Exception as e:
            logger.error(f"Error fetching emails {email_ids}: {str(e)}")
            return []
    
    async def search_similar_emails(
        self, 
        query_embedding: List[float], 
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[VectorSearchResult]:
        """Search for similar emails using Qdrant"""
        try:
            # Build filter conditions
            filter_conditions = []
            if filters:
                for key, value in filters.items():
                    filter_conditions.append({
                        "key": key,
                        "match": {"value": value}
                    })
            
            search_filter = {"must": filter_conditions} if filter_conditions else None
            
            search_results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=search_filter,
                limit=top_k,
                with_payload=True,
                with_vectors=True
            )
            
            results = []
            for result in search_results:
                results.append(VectorSearchResult(
                    email_id=result.payload.get('emailId', str(result.id)),
                    score=result.score,
                    metadata=result.payload,
                    embedding=result.vector
                ))
            
            return results
        except Exception as e:
            logger.error(f"Error searching similar emails: {str(e)}")
            return []
    
    async def get_user_emails(
        self, 
        user_id: str, 
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get all emails for a specific user from Qdrant"""
        try:
            emails = []
            offset = None
            batch_size = min(limit or 1000, 1000)
            
            while True:
                search_result = self.client.scroll(
                    collection_name=self.collection_name,
                    scroll_filter={
                        "must": [
                            {
                                "key": "userId",
                                "match": {"value": user_id}
                            }
                        ]
                    },
                    limit=batch_size,
                    offset=offset,
                    with_payload=True,
                    with_vectors=True
                )
                
                points, next_offset = search_result
                
                for point in points:
                    emails.append({
                        'email_id': point.payload.get('emailId'),
                        'embedding': point.vector,
                        'metadata': point.payload,
                        'qdrant_id': point.id
                    })
                
                if not next_offset or (limit and len(emails) >= limit):
                    break
                    
                offset = next_offset
            
            return emails[:limit] if limit else emails
        except Exception as e:
            logger.error(f"Error fetching user emails for {user_id}: {str(e)}")
            return []

class ChromaClient(VectorStoreClient):
    """ChromaDB vector store client"""
    
    def __init__(self, host: str = "localhost", port: int = 8000, collection_name: str = "emails"):
        import chromadb
        
        self.client = chromadb.HttpClient(host=host, port=port)
        self.collection = self.client.get_or_create_collection(name=collection_name)
        self.collection_name = collection_name
    
    async def get_email_by_id(self, email_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve email data by ID from ChromaDB"""
        try:
            results = self.collection.get(
                ids=[email_id],
                include=['embeddings', 'metadatas', 'documents']
            )
            
            if results['ids']:
                return {
                    'email_id': email_id,
                    'embedding': results['embeddings'][0] if results['embeddings'] else None,
                    'metadata': results['metadatas'][0] if results['metadatas'] else {},
                    'content': results['documents'][0] if results['documents'] else ""
                }
            return None
        except Exception as e:
            logger.error(f"Error fetching email {email_id}: {str(e)}")
            return None
    
    async def get_emails_by_ids(self, email_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieve multiple emails by IDs from ChromaDB"""
        try:
            results = self.collection.get(
                ids=email_ids,
                include=['embeddings', 'metadatas', 'documents']
            )
            
            emails = []
            for i, email_id in enumerate(results['ids']):
                emails.append({
                    'email_id': email_id,
                    'embedding': results['embeddings'][i] if results['embeddings'] else None,
                    'metadata': results['metadatas'][i] if results['metadatas'] else {},
                    'content': results['documents'][i] if results['documents'] else ""
                })
            
            return emails
        except Exception as e:
            logger.error(f"Error fetching emails {email_ids}: {str(e)}")
            return []
    
    async def search_similar_emails(
        self, 
        query_embedding: List[float], 
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[VectorSearchResult]:
        """Search for similar emails using ChromaDB"""
        try:
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=filters,
                include=['embeddings', 'metadatas', 'documents', 'distances']
            )
            
            search_results = []
            for i in range(len(results['ids'][0])):
                search_results.append(VectorSearchResult(
                    email_id=results['ids'][0][i],
                    score=1.0 - results['distances'][0][i],  # Convert distance to similarity
                    metadata=results['metadatas'][0][i] if results['metadatas'] else {},
                    embedding=results['embeddings'][0][i] if results['embeddings'] else None
                ))
            
            return search_results
        except Exception as e:
            logger.error(f"Error searching similar emails: {str(e)}")
            return []
    
    async def get_user_emails(
        self, 
        user_id: str, 
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get all emails for a specific user from ChromaDB"""
        try:
            # Use where clause to filter by user_id
            where_clause = {"user_id": user_id}
            
            results = self.collection.get(
                where=where_clause,
                limit=limit,
                include=['embeddings', 'metadatas', 'documents']
            )
            
            emails = []
            for i, email_id in enumerate(results['ids']):
                emails.append({
                    'email_id': email_id,
                    'embedding': results['embeddings'][i] if results['embeddings'] else None,
                    'metadata': results['metadatas'][i] if results['metadatas'] else {},
                    'content': results['documents'][i] if results['documents'] else ""
                })
            
            return emails
        except Exception as e:
            logger.error(f"Error fetching user emails for {user_id}: {str(e)}")
            return []

class VectorStoreFactory:
    """Factory for creating vector store clients"""
    
    @staticmethod
    def create_client(store_type: str, **kwargs) -> VectorStoreClient:
        """Create a vector store client based on type"""
        
        if store_type.lower() == "qdrant":
            return QdrantClient(
                host=kwargs.get("host", "localhost"),
                port=kwargs.get("port", 6333),
                collection_name=kwargs.get("collection_name", "email_embeddings")
            )
        elif store_type.lower() == "pinecone":
            return PineconeClient(
                api_key=kwargs.get("api_key"),
                environment=kwargs.get("environment"),
                index_name=kwargs.get("index_name")
            )
        elif store_type.lower() == "chroma":
            return ChromaClient(
                host=kwargs.get("host", "localhost"),
                port=kwargs.get("port", 8000),
                collection_name=kwargs.get("collection_name", "emails")
            )
        else:
            raise ValueError(f"Unsupported vector store type: {store_type}")

# Utility functions for email processing
def extract_email_features(email_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract features from email data for classification"""
    metadata = email_data.get('metadata', {})
    
    features = {
        'sender': metadata.get('sender', ''),
        'subject': metadata.get('subject', ''),
        'timestamp': metadata.get('timestamp'),
        'thread_length': metadata.get('thread_length', 1),
        'cc_count': metadata.get('cc_count', 0),
        'bcc_count': metadata.get('bcc_count', 0),
        'has_attachments': metadata.get('has_attachments', False),
        'is_reply': metadata.get('is_reply', False),
        'is_forward': metadata.get('is_forward', False),
        'content_length': len(email_data.get('content', '')),
        'embedding': email_data.get('embedding', [])
    }
    
    return features

def calculate_email_similarity(email1: Dict[str, Any], email2: Dict[str, Any]) -> float:
    """Calculate similarity between two emails"""
    emb1 = email1.get('embedding', [])
    emb2 = email2.get('embedding', [])
    
    if not emb1 or not emb2:
        return 0.0
    
    # Cosine similarity
    emb1 = np.array(emb1)
    emb2 = np.array(emb2)
    
    dot_product = np.dot(emb1, emb2)
    norm1 = np.linalg.norm(emb1)
    norm2 = np.linalg.norm(emb2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)
