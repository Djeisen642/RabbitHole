/**
 * Request and response types shared by the client and the server. The
 * server never sends the answer, the unrevealed clues or the answer pool
 * while a round is being played; `result` only appears once it has ended.
 */
import type { ClueKind, RoundStatus } from './game/rules';

/** Today's post as the player sees it, with the community hidden. */
export type PostCard = {
  title: string;
  /** Plain text of the self post (text posts only). */
  body: string;
  score: number;
  comments: number;
  /** When the post was made, in ms since the epoch. */
  createdAt: number;
};

export type ClueView =
  | { kind: 'topComment'; body: string; score: number }
  | { kind: 'rule'; title: string; description: string }
  | { kind: 'jargon'; words: string[] }
  | { kind: 'stats'; subscribers: number; createdYear: number }
  | { kind: 'icon'; url: string };

export type GuessView = { name: string; correct: boolean };

export type Streak = { current: number; best: number };

export type WrongGuessBar = {
  name: string;
  count: number;
  /** Share of today's players who typed their guesses that made this one, 0 to 100. */
  percent: number;
};

export type RoundResult = {
  answer: string;
  /** Every clue of the round, in reveal order. */
  clues: ClueView[];
  /** Clues used to solve, or null if the round was failed. */
  score: number | null;
  wrongGuesses: WrongGuessBar[];
  players: number;
  /** Where the Visit button goes. */
  visitUrl: string;
  shareText: string;
};

export type PuzzleResponse = {
  type: 'puzzle';
  date: string;
  number: number;
  post: PostCard;
  /** The kinds of this round's clues, in order (contents stay hidden). */
  clueKinds: ClueKind[];
  /** The clues revealed so far. */
  clues: ClueView[];
  guesses: GuessView[];
  maxGuesses: number;
  guessesLeft: number;
  status: RoundStatus;
  streak: Streak;
  /** Null when the player is logged out; they can look but not guess. */
  username: string | null;
  result: RoundResult | null;
  /** The player has never finished a round: show them how to play. */
  firstTime: boolean;
  /**
   * This is the player's first typing round after picking from a list:
   * show them how typing a guess works.
   */
  typingIntro: boolean;
  /**
   * The options to pick from when this round is multiple choice (a new
   * player, or training wheels), or null when the player types a guess.
   */
  choices: string[] | null;
  /**
   * Offer this round some options ("Want some options?"), after a run of
   * losses. Answer with POST /api/choices before the first guess.
   */
  offer: boolean;
};

export type GuessRequest = {
  guess: string;
  /** The puzzle date the player is looking at (PuzzleResponse.date). */
  date: string;
};

/** The answer to the training-wheels offer (PuzzleResponse.offer). */
export type ChoicesRequest = {
  accept: boolean;
  /** The puzzle date the player is looking at (PuzzleResponse.date). */
  date: string;
};

export type SuggestResponse = { type: 'suggest'; names: string[] };

export type ErrorResponse = { type: 'error'; message: string };
