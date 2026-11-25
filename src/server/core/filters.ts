/**
 * Content filters and clue building for the daily picker. Pure functions:
 * no Reddit or Redis calls, so every rule here is unit tested.
 */
import { normalizeSubreddit } from '../../shared/game/rules';
import type { PoolEntry } from '../../shared/pool';
import type {
  SourceComment,
  SourcePost,
  SourceRule,
  SubredditFacts,
} from './source';

/** A community needs this many members to be a fair puzzle. */
export const MIN_SUBSCRIBERS = 50_000;
/** Text posts a community needs in its month of top posts. */
export const MIN_TEXT_POSTS = 3;
/** Readable length for the post card. */
export const MIN_TITLE_CHARS = 10;
export const MAX_TITLE_CHARS = 300;
export const MIN_BODY_CHARS = 80;
export const MAX_BODY_CHARS = 1500;
/** Readable length for the top-comment clue. */
export const MIN_COMMENT_CHARS = 20;
export const MAX_COMMENT_CHARS = 400;

const MASK = '?????';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const GONE = new Set(['[removed]', '[deleted]']);

/**
 * Why a post can't be today's puzzle, or null if it can. Only text posts
 * with a readable body: an image, link, gallery or video could give the
 * answer away in ways we can't check (a flag, a landmark, a watermark).
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
  if (body.length < MIN_BODY_CHARS) return 'body too short';
  if (body.length > MAX_BODY_CHARS) return 'body too long';
  if (containsGiveaway(title, entry)) return 'title names the sub';
  if (containsGiveaway(body, entry)) return 'body names the sub';
  if (entry.newsHeavy && looksLikeNews(title, post.flair))
    return 'news or politics';
  return null;
}

/** A text post with a real body, whether or not it passes the filters. */
export function isTextPost(post: SourcePost): boolean {
  return (
    post.isSelf && post.body.trim().length > 0 && !GONE.has(post.body.trim())
  );
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
    return `only ${textPosts} text posts this month`;
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
): { body: string; score: number } | null {
  for (const c of comments) {
    const body = c.body.trim();
    if (c.stickied || c.removed || c.distinguished) continue;
    if (BOTS.has(c.author.toLowerCase()) || GONE.has(body)) continue;
    if (body.length < MIN_COMMENT_CHARS || body.length > MAX_COMMENT_CHARS)
      continue;
    const masked = maskGiveaways(body, entry);
    // Masking only replaces whole words; a name glued into another word
    // ("#castironcooking") survives it, so such a comment is skipped.
    if (containsGiveaway(masked, entry)) continue;
    return { body: masked, score: c.score };
  }
  return null;
}

/** Rules every community has; they say nothing about this one. */
const GENERIC_RULE =
  /\b(civil|civility|respect|respectful|kind|spam|reddiquette|self[\s-]?promo|promotion|harass|nsfw|personal info|doxx|repost|low[\s-]?effort|be nice|no hate|bigotry|trolling|politics)\b/i;

const MAX_RULE_CHARS = 240;

/**
 * The most telling rule: the first that isn't boilerplate, with the answer
 * masked. Rules that still name the sub after masking are skipped, as in
 * pickTopComment.
 */
export function pickRule(
  rules: readonly SourceRule[],
  entry: PoolEntry
): SourceRule | null {
  const usable = rules
    .map((r) => {
      const description = r.description.trim();
      return {
        title: maskGiveaways(r.title.trim(), entry),
        description: maskGiveaways(
          description.length > MAX_RULE_CHARS
            ? `${description.slice(0, MAX_RULE_CHARS - 3)}...`
            : description,
          entry
        ),
      };
    })
    .filter(
      (r) =>
        r.title.length > 0 &&
        !containsGiveaway(`${r.title} ${r.description}`, entry)
    );
  return (
    usable.find((r) => !GENERIC_RULE.test(`${r.title} ${r.description}`)) ??
    usable[0] ??
    null
  );
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
