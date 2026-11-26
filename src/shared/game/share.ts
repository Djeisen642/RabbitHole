/**
 * Spoiler-free share text for a finished round, Wordle style: the puzzle
 * number and how it went, a row of squares for the guesses, and a link to
 * the post. It is built from counts only, never from the answer, the clue
 * text or the post, so it can't give the puzzle away however it is used.
 */

export type ShareInput = {
  puzzleNumber: number;
  /** Whether each guess was right, in order. */
  guesses: readonly boolean[];
  maxGuesses: number;
  /**
   * The post the round was played in, or null when there isn't one (a
   * request made outside a post), in which case the link line is left out.
   */
  postUrl: string | null;
};

const WRONG = '🟫';
const RIGHT = '🟧';
const UNUSED = '⬜';

/** "solved on the post alone" or "solved with 2 clues", for a solved round. */
export function solvedWith(clues: number): string {
  return clues === 0
    ? 'solved on the post alone'
    : `solved with ${clues} ${clues === 1 ? 'clue' : 'clues'}`;
}

/** "with no clues", "with 1 clue", "with 3 clues". */
function withClues(clues: number): string {
  if (clues === 0) return 'with no clues';
  return `with ${clues} ${clues === 1 ? 'clue' : 'clues'}`;
}

/**
 * The share text of a finished round. A round is solved when its last
 * guess was right; every wrong guess before it revealed one clue.
 */
export function shareText(input: ShareInput): string {
  const { puzzleNumber, guesses, maxGuesses, postUrl } = input;
  const solved = guesses.at(-1) === true;
  const clues = guesses.filter((g) => !g).length;
  const headline = solved
    ? `dug it up ${withClues(clues)} 🐇`
    : 'stayed buried 🕳️';
  const squares = [
    ...guesses.map((g) => (g ? RIGHT : WRONG)),
    ...Array.from(
      { length: Math.max(0, maxGuesses - guesses.length) },
      () => UNUSED
    ),
  ].join('');
  const lines = [`r/abbitHole #${puzzleNumber}: ${headline}`, squares];
  if (postUrl !== null) lines.push(postUrl);
  return lines.join('\n');
}

/**
 * The link to a post, from its subreddit and its id with or without the
 * `t3_` prefix. Reddit's permalinks use the bare id; the title slug is
 * optional, so it is left off.
 */
export function postLink(subreddit: string, postId: string): string {
  const id = postId.startsWith('t3_') ? postId.slice(3) : postId;
  return `https://www.reddit.com/r/${subreddit}/comments/${id}/`;
}
