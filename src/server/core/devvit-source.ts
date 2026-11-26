/**
 * PuzzleSource backed by Reddit through Devvit's `reddit` client. All reads
 * work across subreddits (see PLAN.md). Only the daily picker and the
 * liveness check call it, never a player's render.
 */
import { reddit } from '@devvit/web/server';
import type { Post } from '@devvit/web/server';
import type { PuzzleSource, SourcePost } from './source';

type T1 = `t1_${string}`;
type T3 = `t3_${string}`;
type T5 = `t5_${string}`;
const isT1 = (id: string): id is T1 => id.startsWith('t1_');
const isT3 = (id: string): id is T3 => id.startsWith('t3_');
const isT5 = (id: string): id is T5 => id.startsWith('t5_');

/** Set when Reddit or a moderator took the post down. */
const takenDown = (category: string | undefined): boolean =>
  category !== undefined && category !== '';

const REDDIT_HOSTS = /(^|\.)reddit\.com$/;

/**
 * A text (self) post: its URL is its own comments page, and it has a body
 * and no gallery or embedded media.
 */
function isSelfPost(post: Post): boolean {
  const body = post.body ?? '';
  if (body.trim() === '' || post.gallery.length > 0 || post.secureMedia)
    return false;
  try {
    const url = new URL(post.url, 'https://www.reddit.com');
    return (
      REDDIT_HOSTS.test(url.hostname) && url.pathname.includes('/comments/')
    );
  } catch {
    return false;
  }
}

function toSourcePost(post: Post): SourcePost {
  const self = isSelfPost(post);
  return {
    id: post.id,
    title: post.title,
    body: self ? (post.body ?? '') : '',
    isSelf: self,
    nsfw: post.nsfw,
    spoiler: post.spoiler,
    removed: post.removed || post.spam || takenDown(post.removedByCategory),
    stickied: post.stickied,
    flair: post.flair?.text ?? null,
    score: post.score,
    comments: post.numberOfComments,
    createdAt: post.createdAt.getTime(),
  };
}

export const devvitSource: PuzzleSource = {
  async topPosts(subreddit, timeframe, limit) {
    const posts = await reddit
      .getTopPosts({
        subredditName: subreddit,
        timeframe,
        limit,
        pageSize: limit,
      })
      .all();
    return posts.map(toSourcePost);
  },

  async topComments(postId, limit) {
    if (!isT3(postId)) return [];
    const comments = await reddit
      .getComments({ postId, sort: 'top', limit, pageSize: limit, depth: 1 })
      .get(limit);
    return comments
      .filter((c) => c.parentId === postId)
      .map((c) => ({
        id: c.id,
        body: c.body,
        author: c.authorName,
        score: c.score,
        stickied: c.stickied,
        removed: c.removed || c.spam,
        distinguished: c.distinguishedBy !== undefined,
      }));
  },

  async rules(subreddit) {
    const rules = await reddit.getRules(subreddit);
    return [...rules]
      .sort((a, b) => a.priority - b.priority)
      .filter((r) => r.kind !== 'comment')
      .map((r) => ({ title: r.shortName, description: r.description }));
  },

  async subredditFacts(subreddit) {
    const info = await reddit.getSubredditInfoByName(subreddit);
    if (!info.id || !info.name) return null;
    let iconUrl: string | null = null;
    if (isT5(info.id)) {
      try {
        const styles = await reddit.getSubredditStyles(info.id);
        iconUrl = styles.icon && styles.icon.trim() !== '' ? styles.icon : null;
      } catch {
        iconUrl = null;
      }
    }
    return {
      name: info.name,
      subscribers: info.subscribersCount ?? 0,
      createdAt: info.createdAt?.getTime() ?? 0,
      nsfw: info.isNsfw ?? false,
      quarantined: info.isQuarantined ?? false,
      iconUrl,
    };
  },

  async isPostLive(postId) {
    if (!isT3(postId)) return false;
    const post = await reddit.getPostById(postId);
    const body = (post.body ?? '').trim();
    return (
      !post.removed &&
      !post.spam &&
      !takenDown(post.removedByCategory) &&
      body !== '[removed]' &&
      body !== '[deleted]' &&
      post.authorName !== '[deleted]'
    );
  },

  async isCommentLive(commentId) {
    if (!isT1(commentId)) return false;
    const comment = await reddit.getCommentById(commentId);
    const body = comment.body.trim();
    return (
      !comment.removed &&
      !comment.spam &&
      body !== '[removed]' &&
      body !== '[deleted]' &&
      comment.authorName !== '[deleted]'
    );
  },
};
