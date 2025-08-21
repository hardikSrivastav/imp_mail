import { QdrantClient } from '@qdrant/js-client-rest';
import { EmailVector } from '../types/models';

/**
 * QdrantRepository handles vector storage and retrieval operations
 * for email embeddings in the Qdrant vector database
 */
export class QdrantRepository {
  private client: QdrantClient;
  private collectionName: string;

  constructor(
    qdrantUrl: string,
    qdrantApiKey?: string,
    collectionName: string = 'email_embeddings'
  ) {
    this.client = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey
    });
    this.collectionName = collectionName;
  }

  /**
   * Store email vector in Qdrant
   */
  async storeVector(emailVector: EmailVector): Promise<void> {
    try {
      await this.client.upsert(this.collectionName, {
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
      console.error('❌ Failed to store vector in Qdrant:', error);
      throw error;
    }
  }

  /**
   * Retrieve email vector by ID
   */
  async getVector(vectorId: string): Promise<EmailVector | null> {
    try {
      const result = await this.client.retrieve(this.collectionName, {
        ids: [vectorId],
        with_payload: true,
        with_vector: true
      });

      if (!result || result.length === 0) {
        return null;
      }

      const point = result[0];
      return {
        id: String(point.id),
        emailId: point.payload?.emailId as string,
        userId: point.payload?.userId as string,
        embedding: point.vector as number[],
        embeddingModel: point.payload?.embeddingModel as string,
        createdAt: new Date(point.payload?.createdAt as string)
      };
    } catch (error) {
      console.error('❌ Failed to retrieve vector from Qdrant:', error);
      throw error;
    }
  }

  /**
   * Search for similar email vectors
   */
  async searchSimilar(
    queryVector: number[],
    userId: string,
    limit: number = 10,
    scoreThreshold: number = 0.7
  ): Promise<Array<{ emailId: string; score: number; vectorId: string }>> {
    try {
      const searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
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
        score: result.score || 0,
        vectorId: String(result.id)
      }));
    } catch (error) {
      console.error('❌ Failed to search similar vectors:', error);
      throw error;
    }
  }

  /**
   * Delete email vector by ID
   */
  async deleteVector(vectorId: string): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: [vectorId]
      });
    } catch (error) {
      console.error('❌ Failed to delete vector from Qdrant:', error);
      throw error;
    }
  }

  /**
   * Delete all vectors for a user
   */
  async deleteUserVectors(userId: string): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [{
            key: 'userId',
            match: { value: userId }
          }]
        }
      });
    } catch (error) {
      console.error('❌ Failed to delete user vectors:', error);
      throw error;
    }
  }

  /**
   * Get vectors by email IDs
   */
  async getVectorsByEmailIds(emailIds: string[]): Promise<EmailVector[]> {
    try {
      // Search for vectors with matching email IDs
      const result = await this.client.scroll(this.collectionName, {
        filter: {
          must: [{
            key: 'emailId',
            match: { any: emailIds }
          }]
        },
        with_payload: true,
        with_vector: true,
        limit: emailIds.length
      });

      return result.points.map(point => ({
        id: String(point.id),
        emailId: point.payload?.emailId as string,
        userId: point.payload?.userId as string,
        embedding: point.vector as number[],
        embeddingModel: point.payload?.embeddingModel as string,
        createdAt: new Date(point.payload?.createdAt as string)
      }));
    } catch (error) {
      console.error('❌ Failed to get vectors by email IDs:', error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<{
    pointsCount: number;
    indexedVectorsCount: number;
    memoryUsageBytes: number;
  }> {
    try {
      const collectionInfo = await this.client.getCollection(this.collectionName);
      
      return {
        pointsCount: collectionInfo.points_count || 0,
        indexedVectorsCount: collectionInfo.indexed_vectors_count || 0,
        memoryUsageBytes: collectionInfo.segments_count || 0
      };
    } catch (error) {
      console.error('❌ Failed to get collection stats:', error);
      throw error;
    }
  }

  /**
   * Health check for Qdrant connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      console.error('❌ Qdrant health check failed:', error);
      return false;
    }
  }

  /**
   * Batch store multiple vectors
   */
  async batchStoreVectors(emailVectors: EmailVector[]): Promise<void> {
    try {
      const points = emailVectors.map(vector => ({
        id: vector.id,
        vector: vector.embedding,
        payload: {
          emailId: vector.emailId,
          userId: vector.userId,
          embeddingModel: vector.embeddingModel,
          createdAt: vector.createdAt.toISOString()
        }
      }));

      await this.client.upsert(this.collectionName, {
        wait: true,
        points
      });
    } catch (error) {
      console.error('❌ Failed to batch store vectors:', error);
      throw error;
    }
  }

  /**
   * Get user vector count
   */
  async getUserVectorCount(userId: string): Promise<number> {
    try {
      const result = await this.client.count(this.collectionName, {
        filter: {
          must: [{
            key: 'userId',
            match: { value: userId }
          }]
        }
      });

      return result.count || 0;
    } catch (error) {
      console.error('❌ Failed to get user vector count:', error);
      throw error;
    }
  }

  /**
   * Get all vectors for a user (may be large; consider paging if needed)
   */
  async getUserVectors(userId: string): Promise<Array<{ emailId: string; embedding: number[] }>> {
    try {
      const result = await this.client.scroll(this.collectionName, {
        filter: {
          must: [{ key: 'userId', match: { value: userId } }]
        },
        with_payload: true,
        with_vector: true,
        limit: 10000
      });
      return result.points
        .filter(p => Array.isArray(p.vector))
        .map(p => ({
          emailId: (p.payload?.emailId as string) || String(p.id),
          embedding: p.vector as number[]
        }));
    } catch (error) {
      console.error('❌ Failed to get user vectors:', error);
      throw error;
    }
  }
}