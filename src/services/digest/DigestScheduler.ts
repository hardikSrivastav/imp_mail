import cron from 'node-cron';
import { getDatabase } from '../../config/database';
import { DigestService } from './DigestService';
import { EmailRepository } from '../../repositories/EmailRepository';
import { SyncStateManager } from '../sync/SyncStateManager';
import { IncrementalIndexer } from '../indexing/IncrementalIndexer';
import { OAuthManager } from '../auth/OAuthManager';
import { TokenStore } from '../auth/TokenStore';
import { EmailParser } from '../email/EmailParser';
import { VectorEmbeddingService } from '../embedding/VectorEmbeddingService';

function isTimeDueNow(times: string[], timezone: string, lastDigestAt?: string): boolean {
  // Simple: compare server local HH:MM to configured list
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const current = `${hh}:${mm}`;
  return times.includes(current);
}

export async function startDigestScheduler(): Promise<void> {
  const db = await getDatabase();
  const digestService = new DigestService();
  const emailRepo = new EmailRepository();
  const syncState = new SyncStateManager(db);
  const emailParser = new EmailParser();
  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  const qdrantApiKey = process.env.QDRANT_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const vectorService = new VectorEmbeddingService(openaiApiKey, qdrantUrl, qdrantApiKey);
  const oauthConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3005/auth/callback'
  };
  const oauthManager = new OAuthManager(oauthConfig);
  const tokenStore = new TokenStore(db, process.env.ENCRYPTION_KEY || 'your-encryption-key');

  // Every minute; lightweight check
  cron.schedule('* * * * *', async () => {
    try {
      const users = await db.all<any[]>(
        'SELECT id, email, digest_enabled, digest_times, timezone, last_digest_at, auto_sync_enabled, auto_sync_interval_minutes FROM users',
      );
      for (const u of users) {
        // Auto incremental sync
        if (u.auto_sync_enabled) {
          // if no sync state or last_sync too old per interval, trigger incremental
          const st = await syncState.getSyncState(u.id).catch(() => null);
          const lastSync = st?.lastSyncAt ? new Date(st.lastSyncAt).getTime() : 0;
          const intervalMs = Math.max(1, Number(u.auto_sync_interval_minutes || 5)) * 60000;
          if (!st || Date.now() - lastSync >= intervalMs) {
            try {
              const tokens = await tokenStore.getTokens(u.id);
              if (tokens) {
                const fetcher = new (require('../email/EmailFetcher').EmailFetcher)(oauthManager, tokens);
                const indexer = new IncrementalIndexer(db, fetcher, emailParser, vectorService, syncState);
                indexer.processIncrementalSync(u.id).catch(() => {});
                console.log(`[AUTO-SYNC] Incremental sync triggered for ${u.id}`);
              }
            } catch (e) {
              console.error('[AUTO-SYNC] failed for user', u.id, e);
            }
          }
        }

        let times: string[] = ["11:00","21:00"];
        try { if (u.digest_times) times = JSON.parse(u.digest_times); } catch {}
        const tz = u.timezone || 'Asia/Kolkata';
        if (!isTimeDueNow(times, tz, u.last_digest_at)) continue;

        // Avoid duplicate sends within the same minute
        const last = u.last_digest_at ? new Date(u.last_digest_at) : undefined;
        if (last) {
          const deltaMin = (Date.now() - last.getTime()) / 60000;
          if (deltaMin < 1) continue;
        }

        // Use the enhanced processDigestForUser method
        await digestService.processDigestForUser(u.id, u.email);
        console.log(`[DIGEST] Processed digest for user ${u.id}`);
      }
    } catch (err) {
      console.error('[DIGEST] scheduler error:', err);
    }
  });
}
