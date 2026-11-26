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
 * Devvit's types claim `createdAt` is always a `Date`, but at runtime it can
 * cross the sandbox boundary as a plain epoch-ms number or an ISO string
 * instead, so `.getTime()` isn't always there to call. Coerce whatever we
 * actually got. Null when it's missing or unreadable: falling back to 0
 * would show a post as 56 years old and a sub as founded in 1970.
 */
function toMillis(value: Date | number | string | undefined): number | null {
  if (value === undefined) return null;
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : new Date(value).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * A text (self) post: its URL is its own comments page and it has no
 * gallery or embedded media. The body may be empty (the whole thought is
 * in the title, as on r/Showerthoughts) — filters.ts decides whether an
 * empty body is still enough to read.
 */
function isSelfPost(post: Post): boolean {
  if (post.gallery.length > 0 || post.secureMedia) return false;
  try {
    const url = new URL(post.url, 'https://www.reddit.com');
    return (
      REDDIT_HOSTS.test(url.hostname) && url.pathname.includes('/comments/')
    );
  } catch {
    return false;
  }
}

/**
 * Null for a post with no readable date: the post card shows its age, and
 * there are plenty of other posts to pick from.
 */
function toSourcePost(post: Post): SourcePost | null {
  const createdAt = toMillis(post.createdAt);
  if (createdAt === null) return null;
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
    createdAt,
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
    return posts.map(toSourcePost).filter((p): p is SourcePost => p !== null);
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
    const description = info.description?.markdown?.trim() ?? '';
    return {
      name: info.name,
      subscribers: info.subscribersCount ?? 0,
      createdAt: toMillis(info.createdAt),
      nsfw: info.isNsfw ?? false,
      quarantined: info.isQuarantined ?? false,
      iconUrl,
      description: description === '' ? null : description,
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
