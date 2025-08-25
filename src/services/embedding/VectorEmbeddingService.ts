import { OpenAI } from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmailVector } from '../../types/models';

/**
 * VectorEmbeddingService handles generation and management of email content embeddings
 * using OpenAI's embedding models and Qdrant vector database
 */
export class VectorEmbeddingService {
  private openai: OpenAI;
  private qdrant: QdrantClient;
  private collectionName: string;
  private embeddingModel: string;

  constructor(
    openaiApiKey: string,
    qdrantUrl: string,
    qdrantApiKey?: string,
    collectionName: string = 'email_embeddings',
    embeddingModel: string = 'text-embedding-3-small'
  ) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.qdrant = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey
    });
    this.collectionName = collectionName;
    this.embeddingModel = embeddingModel;
  }

  /**
   * Initialize the Qdrant collection for email embeddings
   */
  async initializeCollection(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.qdrant.getCollections();
      const collectionExists = collections.collections.some(
        col => col.name === this.collectionName
      );

      if (!collectionExists) {
        // Create collection with appropriate vector size for text-embedding-3-small (1536 dimensions)
        await this.qdrant.createCollection(this.collectionName, {
          vectors: {
            size: 1536,
            distance: 'Cosine'
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });
        console.log(`✅ Created Qdrant collection: ${this.collectionName}`);
      } else {
        console.log(`✅ Qdrant collection already exists: ${this.collectionName}`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize Qdrant collection:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for email content
   */
  async generateEmbedding(content: string): Promise<number[]> {
    try {
      // Truncate content if too long (OpenAI has token limits)
      const truncatedContent = this.truncateContent(content, 8000);
      
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: truncatedContent,
        encoding_format: 'float'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Store email embedding in Qdrant
   */
  async storeEmbedding(emailVector: EmailVector): Promise<void> {
    try {
      await this.qdrant.upsert(this.collectionName, {
        wait: true,
        points: [{
          id: emailVector.id,
          vector: emailVector.embedding,
          payload: {
            emailId: emailVector.emailId,
            userId: emailVector.userId,
            embeddingModel: emailVector.embeddingModel,
            createdAt: emailVector.createdAt.toISOString()
          }
        }]
      });
    } catch (error) {
      console.error('❌ Failed to store embedding in Qdrant:', error);
      throw error;
    }
  }

  /**
   * Generate and store embedding for an email
   */
  async processEmailEmbedding(
    emailId: string,
    userId: string,
    content: string
  ): Promise<EmailVector> {
    const embedding = await this.generateEmbedding(content);
    
    const emailVector: EmailVector = {
      id: emailId,
      emailId,
      userId,
      embedding,
      embeddingModel: this.embeddingModel,
      createdAt: new Date()
    };

    await this.storeEmbedding(emailVector);
    return emailVector;
  }

  /**
   * Find similar emails using vector similarity search
   */
  async findSimilarEmails(
    content: string,
    userId: string,
    limit: number = 10,
    scoreThreshold: number = 0.7
  ): Promise<Array<{ emailId: string; score: number }>> {
    try {
      const queryEmbedding = await this.generateEmbedding(content);
      
      const searchResult = await this.qdrant.search(this.collectionName, {
        vector: queryEmbedding,
        limit,
        score_threshold: scoreThreshold,
        filter: {
          must: [{
            key: 'userId',
            match: { value: userId }
          }]
        },
        with_payload: true
      });

      return searchResult.map(result => ({
        emailId: result.payload?.emailId as string,
        score: result.score || 0
      }));
    } catch (error) {
      console.error('❌ Failed to search similar emails:', error);
      throw error;
    }
  }

  /**
   * Delete embedding for an email
   */
  async deleteEmbedding(emailId: string): Promise<void> {
    try {
      await this.qdrant.delete(this.collectionName, {
        wait: true,
        points: [emailId]
      });
    } catch (error) {
      console.error('❌ Failed to delete embedding:', error);
      throw error;
    }
  }

  /**
   * Delete all embeddings for a user
   */
  async deleteUserEmbeddings(userId: string): Promise<void> {
    try {
      await this.qdrant.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [{
            key: 'userId',
            match: { value: userId }
          }]
        }
      });
    } catch (error) {
      console.error('❌ Failed to delete user embeddings:', error);
      throw error;
    }
  }

  /**
   * Get embedding statistics
   */
  async getEmbeddingStats(): Promise<{
    totalEmbeddings: number;
    collectionInfo: any;
  }> {
    try {
      const collectionInfo = await this.qdrant.getCollection(this.collectionName);
      
      return {
        totalEmbeddings: collectionInfo.points_count || 0,
        collectionInfo
      };
    } catch (error) {
      console.error('❌ Failed to get embedding stats:', error);
      throw error;
    }
  }

  /**
   * Truncate content to fit within token limits
   */
  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    
    // Truncate and add ellipsis
    return content.substring(0, maxChars - 3) + '...';
  }

  /**
   * Health check for the embedding service
   */
  async healthCheck(): Promise<{ openai: boolean; qdrant: boolean }> {
    const health = { openai: false, qdrant: false };

    try {
      // Test OpenAI connection
      await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: 'test',
        encoding_format: 'float'
      });
      health.openai = true;
    } catch (error) {
      console.error('❌ OpenAI health check failed:', error);
    }

    try {
      // Test Qdrant connection
      await this.qdrant.getCollections();
      health.qdrant = true;
    } catch (error) {
      console.error('❌ Qdrant health check failed:', error);
    }

    return health;
  }
}