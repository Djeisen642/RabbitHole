/**
 * What the API sends back for a puzzle: the round as the player may see
 * it, and each clue's content.
 */
import type {
  ClueView,
  GuessView,
  PostCard,
  PuzzleResponse,
  RoundResult,
  Streak as StreakView,
  WrongGuessBar,
} from '../../shared/api';
import { puzzleNumber } from '../../shared/game/day';
import {
  cluesRevealed,
  isCorrectGuess,
  isSkip,
  maxGuesses,
  score,
  visibleStreak,
} from '../../shared/game/rules';
import type { ClueKind, Streak } from '../../shared/game/rules';
import { needsTypingIntro } from '../../shared/game/learning';
import { shareText } from '../../shared/game/share';
import type { StoredCandidate, StoredPuzzle } from './puzzle-store';
import { sameSub } from './round';
import type { PlayerRound } from './round';

/**
 * Stands in for the post of a round that ended before the day's puzzle
 * changed (a takedown or a moderator's repick).
 */
function removedPost(date: string): PostCard {
  return {
    title: 'Today’s puzzle changed after you finished it.',
    body: '',
    score: 0,
    comments: 0,
    createdAt: Date.parse(`${date}T12:00:00Z`),
  };
}

/**
 * What the player may see. While the round is being played: the masked
 * post, the clues revealed so far and the guesses. The answer, the other
 * clues and the chart are only added once the round has ended.
 */
export function puzzleView(args: {
  puzzle: StoredPuzzle;
  candidate: StoredCandidate;
  player: PlayerRound;
  streak: Streak;
  /** Today's day number, for the streak shown. */
  day: number;
  /** Set when this is an earlier day's puzzle (PuzzleResponse.today). */
  today: { number: number; url: string | null } | null;
  username: string | null;
  chart: { bars: WrongGuessBar[]; players: number } | null;
  /** The post the round is played in, for the share text's link. */
  postUrl: string | null;
  /** The player's snoovatar, for a finished round. */
  avatarUrl: string | null;
}): PuzzleResponse {
  const {
    puzzle,
    candidate,
    player,
    streak,
    day,
    today,
    username,
    chart,
    postUrl,
    avatarUrl,
  } = args;
  const { round } = player;
  // A finished round keeps the answer it was played against. If the day
  // has since moved to another community, today's post and clues aren't
  // the ones this player saw, and theirs were taken down on Reddit, so
  // none are shown.
  const ownPuzzle = sameSub(round.answer, puzzle.answer);
  const clue = (kind: ClueKind): ClueView => clueView(kind, puzzle, candidate);
  const revealed = ownPuzzle ? cluesRevealed(round) : 0;
  const guesses: GuessView[] = round.guesses.map((name) => ({
    name,
    correct: isCorrectGuess(name, round.answer, round.aliases),
    skipped: isSkip(name),
  }));
  const shown = visibleStreak(streak, day);
  const streakView: StreakView = { current: shown.current, best: shown.best };
  const number = puzzleNumber(puzzle.date);
  const done = round.status !== 'playing';
  const result: RoundResult | null =
    done && chart
      ? {
          answer: round.answer,
          clues: ownPuzzle ? round.clues.map(clue) : [],
          score: score(round),
          wrongGuesses: chart.bars,
          players: chart.players,
          visitUrl: `https://www.reddit.com/r/${round.answer}/`,
          shareText: shareText({
            puzzleNumber: number,
            guesses: guesses.map((g) => g.correct),
            maxGuesses: maxGuesses(round),
            postUrl,
          }),
          avatarUrl,
          postUrl,
        }
      : null;
  return {
    type: 'puzzle',
    date: puzzle.date,
    number,
    post: ownPuzzle ? candidate.post : removedPost(puzzle.date),
    clueKinds: [...round.clues],
    clues: round.clues.slice(0, revealed).map(clue),
    guesses,
    maxGuesses: maxGuesses(round),
    guessesLeft: done ? 0 : maxGuesses(round) - round.guesses.length,
    status: round.status,
    streak: streakView,
    username,
    result,
    firstTime: player.learner.finished === 0,
    typingIntro: player.choices === null && needsTypingIntro(player.learner),
    choices: player.choices,
    offer: player.offer,
    today,
  };
}

/** One clue's content. */
export function clueView(
  kind: ClueKind,
  puzzle: StoredPuzzle,
  candidate: StoredCandidate
): ClueView {
  switch (kind) {
    case 'topComment':
      return { kind, ...candidate.topComment };
    case 'about':
      return { kind, text: puzzle.about };
    case 'jargon':
      return { kind, words: puzzle.jargon };
    case 'topPost':
      return puzzle.topPost
        ? { kind, ...puzzle.topPost }
        : { kind: 'stats', ...puzzle.stats };
    case 'stats':
      return { kind, ...puzzle.stats };
    case 'icon':
      return { kind, url: puzzle.iconUrl ?? '' };
  }
}
