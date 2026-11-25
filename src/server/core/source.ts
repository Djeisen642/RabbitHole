/**
 * Where puzzle content comes from. The daily picker only talks to this type,
 * so it runs the same against Reddit (devvit-source.ts) and against made-up
 * fixtures (mock/mock-source.ts).
 */

export type SourcePost = {
  id: string;
  title: string;
  /** Plain text body; empty for anything that isn't a text post. */
  body: string;
  /** A text (self) post: no link, image, gallery or video. */
  isSelf: boolean;
  nsfw: boolean;
  spoiler: boolean;
  removed: boolean;
  stickied: boolean;
  flair: string | null;
  score: number;
  comments: number;
  /** ms since the epoch */
  createdAt: number;
};

export type SourceComment = {
  id: string;
  body: string;
  author: string;
  score: number;
  stickied: boolean;
  removed: boolean;
  /** Posted as a moderator or admin. */
  distinguished: boolean;
};

export type SourceRule = { title: string; description: string };

export type SubredditFacts = {
  name: string;
  subscribers: number;
  /** ms since the epoch */
  createdAt: number;
  nsfw: boolean;
  quarantined: boolean;
  /** The community's own icon, or null when it uses Reddit's default. */
  iconUrl: string | null;
};

export type Timeframe = 'week' | 'month';

export type PuzzleSource = {
  /** Top posts of a community over a time range, best first. */
  topPosts(
    subreddit: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<SourcePost[]>;
  /** The top comments of a post, best first. */
  topComments(postId: string, limit: number): Promise<SourceComment[]>;
  rules(subreddit: string): Promise<SourceRule[]>;
  /** Null when the community doesn't exist or can't be read. */
  subredditFacts(subreddit: string): Promise<SubredditFacts | null>;
  /** False once a post is removed or deleted. */
  isPostLive(postId: string): Promise<boolean>;
  /** False once a comment is removed or deleted. */
  isCommentLive(commentId: string): Promise<boolean>;
};
