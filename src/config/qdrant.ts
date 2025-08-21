import { QdrantClient } from '@qdrant/js-client-rest';

let qdrantClient: QdrantClient | null = null;
const DEFAULT_COLLECTION_NAME = 'email_embeddings';

/**
 * Initialize Qdrant client and create collections
 */
export async function initializeQdrant(): Promise<QdrantClient> {
  const client = getQdrantClient();
  
  // Create email collection if it doesn't exist
  await createEmailCollection();
  
  console.log('✅ Qdrant initialized');
  return client;
}

/**
 * Get or create Qdrant client
 */
export function getQdrantClient(): QdrantClient {
  if (qdrantClient) {
    return qdrantClient;
  }

  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  const qdrantApiKey = process.env.QDRANT_API_KEY;

  qdrantClient = new QdrantClient({
    url: qdrantUrl,
    apiKey: qdrantApiKey
  });

  return qdrantClient;
}

/**
 * Create email embeddings collection
 */
export async function createEmailCollection(collectionName: string = DEFAULT_COLLECTION_NAME): Promise<void> {
  const client = getQdrantClient();
  
  try {
    // Check if collection exists
    await client.getCollection(collectionName);
    console.log(`Collection ${collectionName} already exists`);
  } catch (error) {
    // Collection doesn't exist, create it
    await client.createCollection(collectionName, {
      vectors: {
        size: 1536, // OpenAI text-embedding-3-small dimension
        distance: 'Cosine'
      }
    });
    console.log(`Created collection ${collectionName}`);
  }
}

/**
 * Get collection name
 */
export function getCollectionName(): string {
  return process.env.QDRANT_COLLECTION_NAME || DEFAULT_COLLECTION_NAME;
}

/**
 * Close Qdrant client connection
 */
export function closeQdrantClient(): void {
  qdrantClient = null;
}