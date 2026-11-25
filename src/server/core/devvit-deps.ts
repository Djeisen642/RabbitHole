/**
 * Deps for the deployed app: Devvit's redis, the signed-in Reddit user and,
 * by default, real Reddit content. Setting RABBITHOLE_SOURCE=mock swaps in
 * the fixture source and its small pool (everything else stays real), which
 * is the one switch between real and mock content.
 */
import { context, reddit, redis, scheduler } from '@devvit/web/server';
import { POOL } from '../../shared/pool';
import type { Deps } from './deps';
import { devvitSource } from './devvit-source';
import { MOCK_POOL, mockSource } from './mock/mock-source';

export type SourceMode = 'devvit' | 'mock';

export function sourceMode(flag: string | undefined): SourceMode {
  return flag === 'mock' ? 'mock' : 'devvit';
}

export function createDevvitDeps(mode: SourceMode): Deps {
  return {
    store: redis,
    source: mode === 'mock' ? mockSource : devvitSource,
    pool: mode === 'mock' ? MOCK_POOL : POOL,
    user() {
      const { userId, username } = context;
      return Promise.resolve(
        userId && username ? { id: userId, username } : null
      );
    },
    async isModerator() {
      const { username, subredditName } = context;
      if (!username) return false;
      const mods = await reddit
        .getModerators({ subredditName, username, limit: 1 })
        .get(1);
      return mods.some(
        (m) => m.username.toLowerCase() === username.toLowerCase()
      );
    },
    async scheduleNextPoolCheck(date) {
      await scheduler.runJob({
        name: 'pool-check',
        runAt: new Date(Date.now() + 1000),
        data: { date },
      });
    },
    now: () => new Date(),
    log: (message) => {
      console.log(message);
    },
  };
}
