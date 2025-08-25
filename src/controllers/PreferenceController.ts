import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { PreferencePrototypeService } from '../services/ml/PreferencePrototypeService';
import { EmailRepository } from '../repositories/EmailRepository';

export class PreferenceController {
  constructor(private prefs: PreferencePrototypeService, private emailRepo: EmailRepository) {}

  async getPreferences(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const data = await this.prefs.getPreferences(userId);
      if (!data) return res.status(404).json({ error: 'No preferences set' });
      res.json(data);
    } catch (e) {
      console.error('getPreferences error', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async savePreferences(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { likedEmailIds, dislikedEmailIds } = req.body || {};
      if (!Array.isArray(likedEmailIds) || !Array.isArray(dislikedEmailIds)) {
        return res.status(400).json({ error: 'likedEmailIds and dislikedEmailIds are required arrays' });
      }
      if (likedEmailIds.length < 5 || dislikedEmailIds.length < 5) {
        return res.status(400).json({ error: 'Select at least 5 liked and 5 disliked emails' });
      }
      // Validate ownership
      const allIds = Array.from(new Set([...(likedEmailIds as string[]), ...(dislikedEmailIds as string[])]));
      const emails = await this.emailRepo.getByIds(allIds);
      const owned = new Set(emails.filter(e => e.userId === userId).map(e => e.id));
      const invalid = allIds.filter(id => !owned.has(id));
      if (invalid.length) return res.status(403).json({ error: 'Some emails are not yours', invalid });

      const saved = await this.prefs.savePreferences(userId, likedEmailIds, dislikedEmailIds);
      res.json({ message: 'Preferences saved', preferences: saved });
    } catch (e) {
      console.error('savePreferences error', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async train(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const protos = await this.prefs.computePrototypes(userId);
      res.json({ message: 'Trained', updatedAt: protos.updatedAt });
    } catch (e: any) {
      console.error('train error', e);
      const msg = e instanceof Error ? e.message : 'Internal error';
      if (msg.includes('At least')) return res.status(400).json({ error: msg });
      if (msg.includes('No preferences')) return res.status(404).json({ error: msg });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async score(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id;
      if (!emailId) return res.status(400).json({ error: 'Missing email ID' });
      const protos = await this.prefs.computePrototypes(userId);
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const qdrantApiKey = process.env.QDRANT_API_KEY;
      const { QdrantRepository } = await import('../repositories/QdrantRepository');
      const repo = new QdrantRepository(qdrantUrl, qdrantApiKey);
      const vecs = await repo.getVectorsByEmailIds([emailId]);
      const v = vecs[0]?.embedding;
      if (!v) return res.status(400).json({ error: 'Email not vectorized' });
      const simLiked = this.cosineSimilarity(protos.likedCentroid, v);
      const simDisliked = this.cosineSimilarity(protos.dislikedCentroid, v);
      const margin = simLiked - simDisliked;
      const marginThreshold = parseFloat(process.env.PROTOTYPE_MARGIN || '0.05');
      const label = margin > marginThreshold ? 'important' : margin < -marginThreshold ? 'not_important' : 'unclassified';
      res.json({ emailId, simLiked, simDisliked, margin, label });
    } catch (e) {
      console.error('score error', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      dot += x * y; na += x * x; nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }
}
