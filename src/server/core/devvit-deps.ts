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
import { cachedIsModerator } from './moderator';
import { randomSalt } from './puzzle-pick';
import { postLink } from '../../shared/game/share';

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
    postUrl() {
      const { postId, subredditName } = context;
      return postId ? postLink(subredditName, postId) : null;
    },
    postId() {
      return context.postId ?? null;
    },
    async postTitle(postId) {
      const id = postId.startsWith('t3_') ? postId : `t3_${postId}`;
      const post = await reddit.getPostById(id as `t3_${string}`);
      return post.title;
    },
    isModerator() {
      const { userId, username, subredditName } = context;
      if (!userId || !username) return Promise.resolve(false);
      return cachedIsModerator(redis, userId, new Date(), async () => {
        const mods = await reddit
          .getModerators({ subredditName, username, limit: 1 })
          .get(1);
        return mods.some(
          (m) => m.username.toLowerCase() === username.toLowerCase()
        );
      });
    },
    newSalt: randomSalt,
    async createPost(title) {
      const post = await reddit.submitCustomPost({ title });
      return { id: post.id, url: postLink(context.subredditName, post.id) };
    },
    async setFlair(username, text) {
      await reddit.setUserFlair({
        subredditName: context.subredditName,
        username,
        text,
        backgroundColor: '#c63a00',
        textColor: 'light',
      });
    },
    async avatarUrl(username) {
      return (await reddit.getSnoovatarUrl(username)) ?? null;
    },
    async pinComment(postId, markdown) {
      const id = postId.startsWith('t3_') ? postId : `t3_${postId}`;
      const comment = await reddit.submitComment({
        id: id as `t3_${string}`,
        text: markdown,
        runAs: 'APP',
      });
      await comment.distinguish(true);
    },
    async notifyMods(subject, markdown) {
      await reddit.modMail.createModNotification({
        subject: subject.slice(0, 100),
        bodyMarkdown: markdown,
        subredditId: context.subredditId,
      });
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
