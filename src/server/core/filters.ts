/**
 * Content filters and clue building for the daily picker. Pure functions:
 * no Reddit or Redis calls, so every rule here is unit tested.
 */
import { normalizeSubreddit } from '../../shared/game/rules';
import type { PoolEntry } from '../../shared/pool';
import type { SourceComment, SourcePost, SubredditFacts } from './source';

/** A community needs this many members to be a fair puzzle. */
export const MIN_SUBSCRIBERS = 10_000;
/** Text posts a community needs in its month of top posts. */
export const MIN_TEXT_POSTS = 3;
/** Readable length for the post card. */
export const MIN_TITLE_CHARS = 10;
export const MAX_TITLE_CHARS = 300;
export const MIN_BODY_CHARS = 80;
export const MAX_BODY_CHARS = 1500;
/**
 * A post with no body (the whole thought is in the title, as on
 * r/Showerthoughts) still counts if the title alone is this long.
 */
export const MIN_TITLE_ONLY_CHARS = 40;
/** Readable length for the top-comment clue. */
export const MIN_COMMENT_WORDS = 6;
/** Longer comments are truncated to this many words, not rejected. */
export const MAX_COMMENT_WORDS = 30;
/**
 * And to this many characters, since 30 words with a long link or two can
 * still fill the screen.
 */
export const MAX_COMMENT_CHARS = 400;

const MASK = '?????';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A string's space-separated words, empty entries dropped. */
const words = (s: string): string[] =>
  s.split(/\s+/).filter((w) => w.length > 0);
const wordCount = (s: string): number => words(s).length;

/**
 * At most `maxWords` words and `maxChars` characters, cut at a word break
 * where there is one, with an ellipsis if anything was cut.
 */
function truncateComment(
  s: string,
  maxWords: number,
  maxChars: number
): string {
  const all = words(s);
  const byWords = all.length <= maxWords ? s : all.slice(0, maxWords).join(' ');
  if (byWords.length <= maxChars) return byWords === s ? s : `${byWords}…`;
  const cut = byWords.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Every way a post could name the answer: the sub's name and aliases as whole
 * words. A multi-word alias matches with any separator or none, so "cast
 * iron" also catches "cast-iron" and "castiron".
 */
function giveawayPattern(entry: PoolEntry): RegExp {
  const terms = [entry.name, ...entry.aliases]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((t) =>
      t
        .split(/[\s_-]+/)
        .map(escape)
        .join('[\\s_-]*')
    );
  return new RegExp(
    `(\\/?r\\/)?(?<![a-z0-9])(?:${terms.join('|')})(?![a-z0-9])`,
    'gi'
  );
}

/** Whether text names the answer (its name or any alias, with or without r/). */
export function containsGiveaway(text: string, entry: PoolEntry): boolean {
  if (giveawayPattern(entry).test(text)) return true;
  // Long names glued into other words ("#castironcooking") still count.
  const name = normalizeSubreddit(entry.name);
  return name.length >= 8 && normalizeSubreddit(text).includes(name);
}

/** Replace every mention of the answer with "?????" (keeping an r/ prefix). */
export function maskGiveaways(text: string, entry: PoolEntry): string {
  return text.replace(giveawayPattern(entry), (_match, prefix?: string) =>
    prefix ? `r/${MASK}` : MASK
  );
}

/** Words that mark a post as news or politics, for news-heavy subs. */
export const NEWS_KEYWORDS: readonly string[] = [
  'election',
  'elections',
  'vote',
  'voting',
  'minister',
  'government',
  'govt',
  'parliament',
  'president',
  'senate',
  'party',
  'policy',
  'protest',
  'protests',
  'police',
  'killed',
  'dead',
  'death',
  'murder',
  'war',
  'attack',
  'tax',
  'taxes',
  'tariff',
  'tariffs',
  'court',
  'crime',
  'arrested',
  'shooting',
  'immigration',
  'politics',
  'political',
  'news',
  'breaking',
];

const NEWS_RE = new RegExp(
  `(?<![a-z0-9])(?:${NEWS_KEYWORDS.map(escape).join('|')})(?![a-z0-9])`,
  'i'
);

export function looksLikeNews(title: string, flair: string | null): boolean {
  return NEWS_RE.test(title) || (flair !== null && NEWS_RE.test(flair));
}

/**
 * Posts about the community itself (asks to the mods, rule and policy
 * debates, announcements) read the same in any sub, so they make a
 * puzzle no one can solve. Matched on the title and the flair only.
 * "mods" counts only at the start or addressed to them, since in gaming
 * subs it means game mods; "meta" only as a flair or [Meta] tag, since
 * card and board gamers use it for strategy.
 */
const META_TITLE: readonly RegExp[] = [
  /^\W*(hey |dear |attention |calling all |to the )?(mods|moderators|mod team)\b/i,
  /\b(dear|to the|@) ?mods\b/i,
  /\b(moderators|mod team|mod post|automod(erator)?)\b/i,
  /\b(this|our) (sub|subreddit)\b/i,
  /\b(sub(reddit)?|new) (rules?|polic(y|ies))\b/i,
  /\brule ?#?\d+\b/i,
  /\bmegathread\b/i,
  /\[meta\]/i,
  /\b(no|ban|banning|allow|allowing) (ai|a\.i\.)\b/i,
  /\bai[\s-](ban|policy|rule)\b/i,
];
const META_FLAIR =
  /\b(meta|mod (post|announcement|note|news)|moderators?|announcements?|sub(reddit)? (news|update|rules?))\b/i;

/** Whether a post is about the community itself rather than its topic. */
export function looksLikeMeta(title: string, flair: string | null): boolean {
  if (flair !== null && META_FLAIR.test(flair)) return true;
  return META_TITLE.some((re) => re.test(title));
}

const GONE = new Set(['[removed]', '[deleted]']);

/**
 * Why a post can't be today's puzzle, or null if it can. Needs a readable
 * body, or (title-only, as on r/Showerthoughts) a title long enough to
 * carry the whole thought on its own: an image, link, gallery or video
 * could give the answer away in ways we can't check (a flag, a landmark,
 * a watermark).
 */
export function postProblem(post: SourcePost, entry: PoolEntry): string | null {
  const title = post.title.trim();
  const body = post.body.trim();
  if (!post.isSelf) return 'not a text post';
  if (post.nsfw) return 'nsfw';
  if (post.spoiler) return 'spoiler';
  if (post.removed || GONE.has(body) || GONE.has(title)) return 'removed';
  if (post.stickied) return 'stickied';
  if (title.length < MIN_TITLE_CHARS) return 'title too short';
  if (title.length > MAX_TITLE_CHARS) return 'title too long';
  if (body.length === 0) {
    if (title.length < MIN_TITLE_ONLY_CHARS) return 'no body, title too short';
  } else if (body.length < MIN_BODY_CHARS) {
    return 'body too short';
  } else if (body.length > MAX_BODY_CHARS) {
    return 'body too long';
  }
  if (containsGiveaway(title, entry)) return 'title names the sub';
  if (containsGiveaway(body, entry)) return 'body names the sub';
  if (looksLikeMeta(title, post.flair)) return 'about the sub itself';
  if (entry.newsHeavy && looksLikeNews(title, post.flair))
    return 'news or politics';
  return null;
}

/**
 * A text post with enough to read: a real body, or (title-only format) a
 * title long enough to carry the whole thought itself.
 */
export function isTextPost(post: SourcePost): boolean {
  if (!post.isSelf) return false;
  const body = post.body.trim();
  if (GONE.has(body)) return false;
  return body.length > 0 || post.title.trim().length >= MIN_TITLE_ONLY_CHARS;
}

/** Why a community can't be used today, or null if it can. */
export function subredditProblem(
  facts: SubredditFacts | null,
  posts: readonly SourcePost[]
): string | null {
  if (!facts) return 'not found';
  if (facts.nsfw) return 'nsfw';
  if (facts.quarantined) return 'quarantined';
  if (facts.subscribers < MIN_SUBSCRIBERS)
    return `only ${facts.subscribers} members`;
  const textPosts = posts.filter(isTextPost).length;
  if (textPosts < MIN_TEXT_POSTS)
    return `only ${textPosts} text posts in this month's top ${posts.length}`;
  return null;
}

const BOTS = new Set(['automoderator', '[deleted]']);

/**
 * The comment to show as the first clue: the best-ranked comment that a
 * person wrote, isn't pinned by mods and reads quickly. Mentions of the
 * answer are masked rather than rejected.
 */
export function pickTopComment(
  comments: readonly SourceComment[],
  entry: PoolEntry
): { id: string; body: string; score: number } | null {
  for (const c of comments) {
    const body = c.body.trim();
    if (c.stickied || c.removed || c.distinguished) continue;
    if (BOTS.has(c.author.toLowerCase()) || GONE.has(body)) continue;
    if (wordCount(body) < MIN_COMMENT_WORDS) continue;
    const trimmed = truncateComment(body, MAX_COMMENT_WORDS, MAX_COMMENT_CHARS);
    const masked = maskGiveaways(trimmed, entry);
    // Masking only replaces whole words; a name glued into another word
    // ("#castironcooking") survives it, so such a comment is skipped.
    if (containsGiveaway(masked, entry)) continue;
    return { id: c.id, body: masked, score: c.score };
  }
  return null;
}

/**
 * The community's best top-of-all-time post for the fourth clue: its title
 * only, so image and link posts count too. Skips NSFW, spoiler, removed,
 * pinned and meta posts, news in news-heavy subs, and any post in
 * `exclude` (today's own post). Mentions of the answer are masked, and a
 * title still naming it after masking is skipped.
 */
export function pickTopPost(
  posts: readonly SourcePost[],
  entry: PoolEntry,
  exclude: ReadonlySet<string> = new Set()
): { title: string; score: number; createdAt: number } | null {
  for (const post of posts) {
    const title = post.title.trim();
    if (exclude.has(post.id)) continue;
    if (post.nsfw || post.spoiler || post.removed || post.stickied) continue;
    if (GONE.has(title)) continue;
    if (title.length < MIN_TITLE_CHARS || title.length > MAX_TITLE_CHARS)
      continue;
    if (looksLikeMeta(title, post.flair)) continue;
    if (entry.newsHeavy && looksLikeNews(title, post.flair)) continue;
    const masked = maskGiveaways(title, entry);
    if (containsGiveaway(masked, entry)) continue;
    return { title: masked, score: post.score, createdAt: post.createdAt };
  }
  return null;
}

const MAX_ABOUT_CHARS = 240;
const MIN_ABOUT_CHARS = 30;

/** Sidebar markdown reduced to plain sentences: no links, URLs or markup. */
export function plainDescription(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) keeps the text
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '') // headings, quotes, lists
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ') // horizontal rules
    .replace(/[*_~`]+/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut at the last sentence end that fits, else the last word, with "...". */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 3);
  const sentence = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? ')
  );
  if (sentence >= max / 2) return head.slice(0, sentence + 1);
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head).replace(/[\s,;:]+$/, '')}...`;
}

/**
 * The community's own description of itself, from its sidebar: plain text,
 * a sentence or two, with the answer masked. Null when there's nothing
 * usable, or when the name survives masking (as in pickTopComment).
 */
export function pickAbout(
  description: string | null,
  entry: PoolEntry
): string | null {
  if (!description) return null;
  const text = maskGiveaways(
    clip(plainDescription(description), MAX_ABOUT_CHARS),
    entry
  );
  if (text.length < MIN_ABOUT_CHARS) return null;
  if (containsGiveaway(text, entry)) return null;
  return text;
}

/** Everyday words that never count as a community's jargon. */
export const COMMON_WORDS: ReadonlySet<string> = new Set(
  `about above after again against almost along already also although always
  among another anyone anything around away back because been before being
  below best better between both bought came cannot could didn does doesn
  doing done down during each else even ever every first found from full
  gets getting give going gone good got great guys had has have having help
  here hers him his how into isn its itself just know last least left less
  like little long look looking made make many maybe more most much must
  myself need never new next nice nothing now off often old once one only
  other our out over own part people please post pretty quite rather real
  really right said same says should show since small some someone something
  still such sure take than thank thanks that the their them then there these
  they thing things think this those though thought three through time today
  together too took two under until upon used very want was way week well
  went were what when where which while who whole why will with without
  wont work would year years yes yet you your first second finally anyone
  advice question help update made first time tried using does anybody
  everyone ever weird wife husband friend kids day days night morning
  week weeks month months year years`
    .split(/\s+/)
    .filter((w) => w.length > 0)
);

/**
 * A few distinctive words from a community's recent titles: words that come
 * up in more than one title, aren't everyday words and don't name the sub
 * (alone or together with their neighbours).
 * Most frequent first, then longest.
 */
export function jargonWords(
  titles: readonly string[],
  entry: PoolEntry,
  count = 8
): string[] {
  const docs = new Map<string, number>();
  for (const title of titles) {
    // Mask first so a spaced name ("cast iron") doesn't become two words.
    const words = new Set(
      maskGiveaways(title, entry)
        .toLowerCase()
        .replace(/['’]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(
          (w) =>
            w.length >= 4 &&
            !/^\d+$/.test(w) &&
            !COMMON_WORDS.has(w) &&
            !containsGiveaway(w, entry)
        )
    );
    for (const w of words) docs.set(w, (docs.get(w) ?? 0) + 1);
  }
  const ranked = [...docs].sort(
    ([a, na], [b, nb]) => nb - na || b.length - a.length || a.localeCompare(b)
  );
  const repeated = ranked.filter(([, n]) => n >= 2).map(([w]) => w);
  const singles = ranked.filter(([, n]) => n < 2).map(([w]) => w);
  return [...repeated, ...singles].slice(0, count);
}
