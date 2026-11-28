/**
 * Everything the server's game logic needs from the outside world, passed in
 * so the same handlers run on Devvit (devvit-deps.ts) and locally against
 * fixtures and an in-memory store (mock/mock-deps.ts).
 */
import type { PoolEntry } from '../../shared/pool';
import type { PuzzleSource } from './source';
import type { Store } from './store';

export type User = { id: string; username: string };

export type Deps = {
  store: Store;
  source: PuzzleSource;
  /**
   * The subs the picker may choose from (the full POOL on Reddit, the
   * fixture subs in mock mode). Guesses and suggestions always use POOL.
   */
  pool: readonly PoolEntry[];
  /** The signed-in player, or null when logged out. */
  user(): Promise<User | null>;
  /**
   * The link to the post the request came from, for the share text, or
   * null when the request didn't come from a post.
   */
  postUrl(): string | null;
  /** The id of the post the request came from, or null when there is none. */
  postId(): string | null;
  /** A post's title, or null when it can't be found. */
  postTitle(postId: string): Promise<string | null>;
  /** Whether the current user moderates the community the app runs in. */
  isModerator(): Promise<boolean>;
  /**
   * A fresh secret for the pick order (see pickSalt). Random on Reddit;
   * fixed in tests so picks there are repeatable.
   */
  newSalt(): string;
  /** Make a post in the app's community; returns its id and link. */
  createPost(title: string): Promise<{ id: string; url: string }>;
  /** Set a user's flair text in the app's community. */
  setFlair(username: string, text: string): Promise<void>;
  /** A user's snoovatar image, or null when they have none. */
  avatarUrl(username: string): Promise<string | null>;
  /** Comment on a post as the app and pin the comment as a moderator. */
  pinComment(postId: string, markdown: string): Promise<void>;
  /** Send the community's moderators a modmail notification. */
  notifyMods(subject: string, markdown: string): Promise<void>;
  /** Queue the next batch of a pool check (a no-op where there's no scheduler). */
  scheduleNextPoolCheck(date: string): Promise<void>;
  now(): Date;
  log(message: string): void;
};
