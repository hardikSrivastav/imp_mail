"""
Email Classification Microservice

A FastAPI-based microservice that classifies emails as important/non-important
using few-shot learning and vector similarity search.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal, Any
from datetime import datetime
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.ensemble import RandomForestClassifier
import joblib
import logging
import uuid
import pickle
import os
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Email Classification Service",
    description="Classifies emails as important/non-important using few-shot learning",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Models
class EmailMetadata(BaseModel):
    """Email metadata for classification"""
    sender: str
    subject: str
    timestamp: datetime
    thread_length: int = 1
    cc_count: int = 0
    bcc_count: int = 0
    has_attachments: bool = False
    is_reply: bool = False
    is_forward: bool = False

class EmailContent(BaseModel):
    """Email content structure"""
    email_id: str
    content: str
    metadata: EmailMetadata
    vector_embedding: Optional[List[float]] = None

class LabeledExample(BaseModel):
    """Training example with label"""
    email_id: str
    is_important: bool
    confidence: Optional[float] = None

class TrainingRequest(BaseModel):
    """Request to train/update the classifier"""
    user_id: str
    labeled_examples: List[LabeledExample]
    retrain: bool = False

class ClassificationRequest(BaseModel):
    """Request to classify emails"""
    user_id: str
    email_ids: List[str]
    return_confidence: bool = True

class ClassificationResult(BaseModel):
    """Classification result for a single email"""
    email_id: str
    is_important: bool
    confidence: float
    reasoning: Optional[str] = None

class ClassificationResponse(BaseModel):
    """Response containing classification results"""
    user_id: str
    results: List[ClassificationResult]
    model_version: str
    processed_at: datetime

class FeedbackRequest(BaseModel):
    """User feedback on classification results"""
    user_id: str
    email_id: str
    actual_label: bool
    predicted_label: bool
    confidence: float

class LabelRequest(BaseModel):
    """Direct labeling of emails as important/not important"""
    user_id: str
    email_labels: List[Dict[str, Any]]  # [{"email_id": "abc", "is_important": true}, ...]

class BulkLabelRequest(BaseModel):
    """Bulk labeling of multiple emails"""
    user_id: str
    important_email_ids: List[str]
    unimportant_email_ids: List[str]

class ModelStats(BaseModel):
    """Model performance statistics"""
    user_id: str
    total_examples: int
    accuracy: Optional[float] = None
    last_trained: datetime
    model_version: str

# Global state (in production, use Redis/database)
user_models: Dict[str, Dict] = {}
vector_store_client = None  # Will be injected
sqlite_client = None  # Will be injected
persistence_manager = None  # Will be injected

# Initialize clients
def initialize_clients():
    """Initialize the vector store, SQLite clients, and persistence manager"""
    global vector_store_client, sqlite_client, persistence_manager
    
    import os
    from vector_store_client import VectorStoreFactory
    from sqlite_client import SQLiteEmailClient
    from persistence_manager import PersistenceManager
    
    # Initialize vector store
    store_type = os.getenv("VECTOR_STORE_TYPE", "qdrant")
    
    if store_type.lower() == "qdrant":
        vector_store_client = VectorStoreFactory.create_client(
            "qdrant",
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", "6333")),
            collection_name=os.getenv("QDRANT_COLLECTION", "email_embeddings")
        )
    else:
        raise ValueError(f"Unsupported vector store type: {store_type}")
    
    logger.info(f"Initialized {store_type} vector store client")
    
    # Initialize SQLite client
    db_path = os.getenv("SQLITE_DB_PATH", "../data/emails.db")
    sqlite_client = SQLiteEmailClient(db_path)
    if sqlite_client.connect():
        logger.info(f"Initialized SQLite client: {db_path}")
    else:
        logger.warning("Failed to connect to SQLite - will skip database checks")
    
    # Initialize persistence manager
    data_dir = os.getenv("CLASSIFIER_DATA_DIR", "/app/data")
    persistence_manager = PersistenceManager(data_dir)
    logger.info(f"Initialized persistence manager: {data_dir}")
    
    # Load existing models on startup
    load_all_user_models()

class EmailClassifier:
    """Email classification engine"""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.labeled_examples: List[LabeledExample] = []
        self.model = None
        self.feature_weights = {
            'content_similarity': 0.4,
            'sender_pattern': 0.2,
            'metadata_features': 0.2,
            'temporal_features': 0.2
        }
        self.model_version = str(uuid.uuid4())[:8]
        self.last_trained = datetime.now()
    
    def add_training_examples(self, examples: List[LabeledExample]):
        """Add new training examples"""
        self.labeled_examples.extend(examples)
        logger.info(f"Added {len(examples)} training examples for user {self.user_id}")
        # Auto-save after adding examples
        self.save_to_disk()
    
    def save_to_disk(self):
        """Save classifier state to disk"""
        if not persistence_manager:
            return False
        
        try:
            # Create user-specific directory
            user_dir = os.path.join(persistence_manager.data_dir, "models", self.user_id)
            os.makedirs(user_dir, exist_ok=True)
            
            # Save labeled examples
            examples_data = [
                {
                    "email_id": ex.email_id,
                    "is_important": ex.is_important,
                    "confidence": ex.confidence
                }
                for ex in self.labeled_examples
            ]
            
            examples_file = os.path.join(user_dir, "labeled_examples.json")
            with open(examples_file, 'w') as f:
                json.dump({
                    "examples": examples_data,
                    "count": len(examples_data),
                    "last_updated": datetime.now().isoformat()
                }, f, indent=2)
            
            # Save model if it exists
            if self.model:
                model_file = os.path.join(user_dir, "model.pkl")
                joblib.dump(self.model, model_file)
            
            # Save metadata
            metadata = {
                "user_id": self.user_id,
                "model_version": self.model_version,
                "last_trained": self.last_trained.isoformat(),
                "feature_weights": self.feature_weights,
                "examples_count": len(self.labeled_examples)
            }
            
            metadata_file = os.path.join(user_dir, "metadata.json")
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"Saved classifier state for user {self.user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save classifier state for user {self.user_id}: {e}")
            return False
    
    @classmethod
    def load_from_disk(cls, user_id: str):
        """Load classifier state from disk"""
        if not persistence_manager:
            return cls(user_id)
        
        try:
            user_dir = os.path.join(persistence_manager.data_dir, "models", user_id)
            
            if not os.path.exists(user_dir):
                logger.info(f"No saved model found for user {user_id}, creating new")
                return cls(user_id)
            
            # Create classifier instance
            classifier = cls(user_id)
            
            # Load metadata
            metadata_file = os.path.join(user_dir, "metadata.json")
            if os.path.exists(metadata_file):
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                
                classifier.model_version = metadata.get("model_version", classifier.model_version)
                classifier.feature_weights = metadata.get("feature_weights", classifier.feature_weights)
                
                last_trained_str = metadata.get("last_trained")
                if last_trained_str:
                    classifier.last_trained = datetime.fromisoformat(last_trained_str)
            
            # Load labeled examples
            examples_file = os.path.join(user_dir, "labeled_examples.json")
            if os.path.exists(examples_file):
                with open(examples_file, 'r') as f:
                    examples_data = json.load(f)
                
                classifier.labeled_examples = [
                    LabeledExample(
                        email_id=ex["email_id"],
                        is_important=ex["is_important"],
                        confidence=ex.get("confidence", 1.0)
                    )
                    for ex in examples_data.get("examples", [])
                ]
            
            # Load model
            model_file = os.path.join(user_dir, "model.pkl")
            if os.path.exists(model_file):
                classifier.model = joblib.load(model_file)
                logger.info(f"Loaded trained model for user {user_id}")
            
            logger.info(f"Loaded classifier for user {user_id} with {len(classifier.labeled_examples)} examples")
            return classifier
            
        except Exception as e:
            logger.error(f"Failed to load classifier for user {user_id}: {e}")
            return cls(user_id)
    

    
    async def train(self, email_data_list: List[Dict[str, Any]]) -> bool:
        """Train the classification model with Qdrant email data"""
        if len(self.labeled_examples) < 2:
            logger.warning(f"Insufficient training data for user {self.user_id}")
            return False
        
        try:
            # Get labeled email data
            labeled_emails = []
            labels = []
            
            for example in self.labeled_examples:
                # Find corresponding email data
                email_data = next((e for e in email_data_list if e.get('email_id') == example.email_id), None)
                if email_data:
                    labeled_emails.append(email_data)
                    labels.append(1 if example.is_important else 0)
            
            if len(labeled_emails) < 2:
                logger.warning(f"No matching email data found for user {self.user_id}")
                return False
            
            # Extract features using the improved method
            X = np.array([self.extract_features_with_labels(email_data, labeled_emails) for email_data in labeled_emails])
            y = np.array(labels)
            
            # Train model
            self.model = RandomForestClassifier(
                n_estimators=50,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            )
            self.model.fit(X, y)
            
            self.last_trained = datetime.now()
            self.model_version = str(uuid.uuid4())[:8]
            
            # Save the updated model to disk
            self.save_to_disk()
            
            logger.info(f"Model trained for user {self.user_id} with {len(labeled_emails)} examples")
            return True
            
        except Exception as e:
            logger.error(f"Training failed for user {self.user_id}: {str(e)}")
            return False
    
    async def classify(self, email_data_list: List[Dict[str, Any]], labeled_email_data: List[Dict[str, Any]]) -> List[ClassificationResult]:
        """Classify emails as important/non-important using Qdrant data"""
        results = []
        
        if not self.model:
            raise ValueError("Model not trained. Please train the model first.")
        
        if len(self.labeled_examples) < 2:
            raise ValueError("Insufficient training examples. Need at least 2 labeled examples.")
        
        for email_data in email_data_list:
            features = self.extract_features_with_labels(email_data, labeled_email_data).reshape(1, -1)
            
            # Get prediction and confidence
            prediction = self.model.predict(features)[0]
            probabilities = self.model.predict_proba(features)[0]
            confidence = max(probabilities)
            
            # Generate reasoning
            reasoning = self._generate_reasoning(email_data, prediction, confidence)
            
            results.append(ClassificationResult(
                email_id=email_data.get('email_id', 'unknown'),
                is_important=bool(prediction),
                confidence=float(confidence),
                reasoning=reasoning
            ))
        
        return results
    
    def extract_features_with_labels(self, email_data: Dict[str, Any], labeled_email_data: List[Dict[str, Any]]) -> np.ndarray:
        """Extract features knowing which labeled examples are important/unimportant"""
        features = []
        
        email_embedding = email_data.get('embedding', [])
        
        if not email_embedding or not labeled_email_data:
            return np.array([0.0] * 15)
        
        # Separate examples by their actual labels
        important_embeddings = []
        unimportant_embeddings = []
        
        for labeled_email in labeled_email_data:
            email_id = labeled_email.get('email_id')
            embedding = labeled_email.get('embedding', [])
            
            if embedding and email_id:
                # Find the corresponding label
                label_example = next((ex for ex in self.labeled_examples if ex.email_id == email_id), None)
                if label_example:
                    if label_example.is_important:
                        important_embeddings.append(embedding)
                    else:
                        unimportant_embeddings.append(embedding)
        
        # Calculate similarities to important examples
        important_similarities = []
        if important_embeddings:
            for imp_embedding in important_embeddings:
                sim = cosine_similarity([email_embedding], [imp_embedding])[0][0]
                important_similarities.append(sim)
        
        # Calculate similarities to unimportant examples  
        unimportant_similarities = []
        if unimportant_embeddings:
            for unimp_embedding in unimportant_embeddings:
                sim = cosine_similarity([email_embedding], [unimp_embedding])[0][0]
                unimportant_similarities.append(sim)
        
        # Semantic similarity features (most important)
        avg_important_sim = np.mean(important_similarities) if important_similarities else 0.0
        max_important_sim = np.max(important_similarities) if important_similarities else 0.0
        avg_unimportant_sim = np.mean(unimportant_similarities) if unimportant_similarities else 0.0
        max_unimportant_sim = np.max(unimportant_similarities) if unimportant_similarities else 0.0
        
        features.extend([
            avg_important_sim,
            max_important_sim,
            avg_unimportant_sim,
            max_unimportant_sim,
            avg_important_sim - avg_unimportant_sim  # Key discriminative feature
        ])
        
        # Overall similarity statistics
        all_similarities = important_similarities + unimportant_similarities
        if all_similarities:
            features.extend([
                np.mean(all_similarities),
                np.std(all_similarities),
                np.max(all_similarities)
            ])
        else:
            features.extend([0.0, 0.0, 0.0])
        
        # Embedding magnitude
        embedding_magnitude = np.linalg.norm(email_embedding) if email_embedding else 0.0
        features.append(embedding_magnitude)
        
        # Metadata features (less important now)
        metadata = email_data.get('metadata', {})
        created_at = metadata.get('createdAt')
        if created_at:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                hour = dt.hour
                is_business_hours = 1.0 if 9 <= hour <= 17 else 0.0
                is_weekend = 1.0 if dt.weekday() >= 5 else 0.0
                is_urgent_time = 1.0 if hour < 8 or hour > 18 else 0.0
                features.extend([is_business_hours, is_weekend, is_urgent_time])
            except:
                features.extend([0.5, 0.5, 0.0])
        else:
            features.extend([0.5, 0.5, 0.0])
        
        # User and model consistency
        user_id = metadata.get('userId', '')
        is_same_user = 1.0 if user_id == self.user_id else 0.0
        features.append(is_same_user)
        
        embedding_model = metadata.get('embeddingModel', '')
        is_consistent_model = 1.0 if 'text-embedding' in embedding_model else 0.0
        features.append(is_consistent_model)
        
        return np.array(features)
    

    
    def _generate_reasoning(self, email_data: Dict[str, Any], prediction: bool, confidence: float) -> str:
        """Generate human-readable reasoning for classification"""
        reasons = []
        metadata = email_data.get('metadata', {})
        
        # Check embedding model
        embedding_model = metadata.get('embeddingModel', '')
        if 'text-embedding' in embedding_model:
            reasons.append("consistent embedding model")
        
        # Check user consistency
        user_id = metadata.get('userId', '')
        if user_id == self.user_id:
            reasons.append("same user context")
        
        # Check temporal features
        created_at = metadata.get('createdAt')
        if created_at:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                hour = dt.hour
                if 9 <= hour <= 17:
                    reasons.append("sent during business hours")
                if dt.weekday() < 5:
                    reasons.append("sent on weekday")
            except:
                pass
        
        # Check if we have good embedding
        if email_data.get('embedding'):
            reasons.append("semantic content analysis")
        
        label = "important" if prediction else "not important"
        reason_text = ", ".join(reasons) if reasons else "based on learned patterns"
        
        return f"Classified as {label} (confidence: {confidence:.2f}) - {reason_text}"

# Persistence utility functions
def load_all_user_models():
    """Load all saved user models on startup"""
    if not persistence_manager:
        logger.warning("Persistence manager not initialized, skipping model loading")
        return
    
    try:
        models_dir = os.path.join(persistence_manager.data_dir, "models")
        if not os.path.exists(models_dir):
            logger.info("No saved models directory found")
            return
        
        loaded_count = 0
        for user_id in os.listdir(models_dir):
            user_dir = os.path.join(models_dir, user_id)
            if os.path.isdir(user_dir):
                try:
                    classifier = EmailClassifier.load_from_disk(user_id)
                    user_models[user_id] = classifier
                    loaded_count += 1
                    logger.info(f"Loaded model for user {user_id}")
                except Exception as e:
                    logger.error(f"Failed to load model for user {user_id}: {e}")
        
        logger.info(f"Loaded {loaded_count} user models from disk")
        
    except Exception as e:
        logger.error(f"Failed to load user models: {e}")

def get_or_create_classifier(user_id: str) -> EmailClassifier:
    """Get existing classifier or create/load new one"""
    if user_id not in user_models:
        # Try to load from disk first
        classifier = EmailClassifier.load_from_disk(user_id)
        user_models[user_id] = classifier
        logger.info(f"Created/loaded classifier for user {user_id}")
    
    return user_models[user_id]

# API Endpoints

@app.post("/train", response_model=Dict[str, Any])
async def train_classifier(request: TrainingRequest, background_tasks: BackgroundTasks):
    """Train or update the email classifier for a user"""
    
    if not vector_store_client:
        raise HTTPException(status_code=500, detail="Vector store not initialized")
    
    classifier = get_or_create_classifier(request.user_id)
    
    if request.retrain:
        classifier.labeled_examples = []
    
    classifier.add_training_examples(request.labeled_examples)
    
    # Fetch email data from Qdrant
    email_ids = [example.email_id for example in request.labeled_examples]
    email_data_list = await vector_store_client.get_emails_by_ids(email_ids)
    
    if not email_data_list:
        raise HTTPException(status_code=404, detail="No email data found for provided IDs")
    
    # Train the model
    training_success = await classifier.train(email_data_list)
    
    if not training_success:
        raise HTTPException(status_code=400, detail="Training failed - insufficient data or error")
    
    return {
        "status": "training_completed",
        "user_id": request.user_id,
        "examples_count": len(request.labeled_examples),
        "model_version": classifier.model_version,
        "emails_found": len(email_data_list)
    }

@app.post("/classify", response_model=ClassificationResponse)
async def classify_emails(request: ClassificationRequest):
    """Classify emails as important/non-important using AI"""
    
    if not vector_store_client:
        raise HTTPException(status_code=500, detail="Vector store not initialized")
    
    results = []
    
    # Use AI for all emails if user has a trained model
    if request.user_id in user_models:
        classifier = user_models[request.user_id]
        
        # Fetch emails to classify from vector store
        email_data_list = await vector_store_client.get_emails_by_ids(request.email_ids)
        
        if email_data_list:
            # Get labeled email data for feature extraction
            labeled_email_ids = [ex.email_id for ex in classifier.labeled_examples]
            labeled_email_data = await vector_store_client.get_emails_by_ids(labeled_email_ids)
            
            # Classify emails
            ai_results = await classifier.classify(email_data_list, labeled_email_data)
            results.extend(ai_results)
    
    # For emails that couldn't be classified (no model or no data), return default
    classified_ids = {r.email_id for r in results}
    for email_id in request.email_ids:
        if email_id not in classified_ids:
            results.append(ClassificationResult(
                email_id=email_id,
                is_important=False,
                confidence=0.0,
                reasoning="Model not trained yet - need more labeled examples"
            ))
    
    # Determine model version
    model_version = "no_model"
    if request.user_id in user_models:
        model_version = user_models[request.user_id].model_version
    
    return ClassificationResponse(
        user_id=request.user_id,
        results=results,
        model_version=model_version,
        processed_at=datetime.now()
    )

@app.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """Submit feedback on classification results for model improvement"""
    
    if request.user_id not in user_models:
        raise HTTPException(status_code=404, detail="User model not found")
    
    classifier = user_models[request.user_id]
    
    # Add as new training example if prediction was wrong
    if request.actual_label != request.predicted_label:
        new_example = LabeledExample(
            email_id=request.email_id,
            is_important=request.actual_label,
            confidence=1.0  # User feedback is high confidence
        )
        classifier.add_training_examples([new_example])
        
        # Retrain if we have enough examples
        if len(classifier.labeled_examples) >= 10:
            # Fetch updated email data and retrain
            email_ids = [ex.email_id for ex in classifier.labeled_examples]
            email_data_list = await vector_store_client.get_emails_by_ids(email_ids)
            if email_data_list:
                await classifier.train(email_data_list)
    
    return {"status": "feedback_recorded", "user_id": request.user_id}

@app.post("/label")
async def label_emails(request: LabelRequest):
    """Directly label emails as important/not important"""
    
    if not vector_store_client:
        raise HTTPException(status_code=500, detail="Vector store not initialized")
    
    classifier = get_or_create_classifier(request.user_id)
    
    # Convert labels to training examples
    labeled_examples = []
    for label in request.email_labels:
        labeled_examples.append(LabeledExample(
            email_id=label["email_id"],
            is_important=label["is_important"],
            confidence=1.0  # User labels are high confidence
        ))
    
    # Add to training examples
    classifier.add_training_examples(labeled_examples)
    
    # If we have enough examples, retrain the model
    if len(classifier.labeled_examples) >= 10:
        email_ids = [ex.email_id for ex in classifier.labeled_examples]
        email_data_list = await vector_store_client.get_emails_by_ids(email_ids)
        if email_data_list:
            training_success = await classifier.train(email_data_list)
            if training_success:
                return {
                    "status": "labeled_and_retrained",
                    "user_id": request.user_id,
                    "labels_added": len(labeled_examples),
                    "total_examples": len(classifier.labeled_examples),
                    "model_version": classifier.model_version
                }
    
    return {
        "status": "labeled",
        "user_id": request.user_id,
        "labels_added": len(labeled_examples),
        "total_examples": len(classifier.labeled_examples)
    }

@app.post("/bulk-label")
async def bulk_label_emails(request: BulkLabelRequest):
    """Bulk label emails - separate lists for important and unimportant"""
    
    if not vector_store_client:
        raise HTTPException(status_code=500, detail="Vector store not initialized")
    
    classifier = get_or_create_classifier(request.user_id)
    
    # Convert to training examples
    labeled_examples = []
    
    # Add important emails
    for email_id in request.important_email_ids:
        labeled_examples.append(LabeledExample(
            email_id=email_id,
            is_important=True,
            confidence=1.0
        ))
    
    # Add unimportant emails
    for email_id in request.unimportant_email_ids:
        labeled_examples.append(LabeledExample(
            email_id=email_id,
            is_important=False,
            confidence=1.0
        ))
    
    # Add to training examples
    classifier.add_training_examples(labeled_examples)
    
    # Train if we have enough examples
    total_examples = len(classifier.labeled_examples)
    if total_examples >= 10:
        email_ids = [ex.email_id for ex in classifier.labeled_examples]
        email_data_list = await vector_store_client.get_emails_by_ids(email_ids)
        if email_data_list:
            training_success = await classifier.train(email_data_list)
            if training_success:
                return {
                    "status": "bulk_labeled_and_trained",
                    "user_id": request.user_id,
                    "important_count": len(request.important_email_ids),
                    "unimportant_count": len(request.unimportant_email_ids),
                    "total_examples": total_examples,
                    "model_version": classifier.model_version
                }
    
    return {
        "status": "bulk_labeled",
        "user_id": request.user_id,
        "important_count": len(request.important_email_ids),
        "unimportant_count": len(request.unimportant_email_ids),
        "total_examples": total_examples
    }

@app.get("/stats/{user_id}", response_model=ModelStats)
async def get_model_stats(user_id: str):
    """Get model statistics for a user"""
    
    if user_id not in user_models:
        raise HTTPException(status_code=404, detail="User model not found")
    
    classifier = user_models[user_id]
    
    return ModelStats(
        user_id=user_id,
        total_examples=len(classifier.labeled_examples),
        accuracy=None,  # Would calculate from validation set
        last_trained=classifier.last_trained,
        model_version=classifier.model_version
    )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now()}

@app.post("/reset/{user_id}")
async def reset_user_model(user_id: str):
    """Reset user's model training data"""
    
    if user_id in user_models:
        # Clear the user's model and training examples
        del user_models[user_id]
        logger.info(f"Reset model for user {user_id}")
    
    # Also remove from disk
    if persistence_manager:
        try:
            user_dir = os.path.join(persistence_manager.data_dir, "models", user_id)
            if os.path.exists(user_dir):
                import shutil
                shutil.rmtree(user_dir)
                logger.info(f"Removed saved model files for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to remove saved model files for user {user_id}: {e}")
    
    return {
        "status": "reset_successful",
        "user_id": user_id,
        "message": "Model training data cleared successfully"
    }

@app.get("/persistence/status")
async def get_persistence_status():
    """Get persistence status and statistics"""
    
    if not persistence_manager:
        return {"status": "disabled", "message": "Persistence manager not initialized"}
    
    try:
        models_dir = os.path.join(persistence_manager.data_dir, "models")
        users_with_saved_models = []
        
        if os.path.exists(models_dir):
            for user_id in os.listdir(models_dir):
                user_dir = os.path.join(models_dir, user_id)
                if os.path.isdir(user_dir):
                    metadata_file = os.path.join(user_dir, "metadata.json")
                    if os.path.exists(metadata_file):
                        try:
                            with open(metadata_file, 'r') as f:
                                metadata = json.load(f)
                            users_with_saved_models.append({
                                "user_id": user_id,
                                "examples_count": metadata.get("examples_count", 0),
                                "model_version": metadata.get("model_version", "unknown"),
                                "last_trained": metadata.get("last_trained"),
                                "has_trained_model": os.path.exists(os.path.join(user_dir, "model.pkl"))
                            })
                        except Exception as e:
                            logger.error(f"Failed to read metadata for user {user_id}: {e}")
        
        return {
            "status": "enabled",
            "data_directory": persistence_manager.data_dir,
            "users_with_saved_models": users_with_saved_models,
            "total_saved_users": len(users_with_saved_models),
            "loaded_users": list(user_models.keys()),
            "total_loaded_users": len(user_models)
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/persistence/save-all")
async def save_all_models():
    """Manually save all loaded models to disk"""
    
    if not persistence_manager:
        raise HTTPException(status_code=500, detail="Persistence manager not initialized")
    
    saved_count = 0
    errors = []
    
    for user_id, classifier in user_models.items():
        try:
            if classifier.save_to_disk():
                saved_count += 1
            else:
                errors.append(f"Failed to save model for user {user_id}")
        except Exception as e:
            errors.append(f"Error saving model for user {user_id}: {str(e)}")
    
    return {
        "status": "completed",
        "saved_models": saved_count,
        "total_models": len(user_models),
        "errors": errors
    }

# Initialize clients on startup
@app.on_event("startup")
async def startup_event():
    """Initialize the application"""
    initialize_clients()
    logger.info("Email Classification Service started successfully")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
