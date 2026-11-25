import { describe, expect, it } from 'vitest';
import {
  CHOICES,
  FIRST_CHOICES,
  NEW_LEARNER,
  RETURNING_LEARNER,
  acceptWheels,
  afterRound,
  choiceCount,
  offersWheels,
} from './learning';
import type { Learner } from './learning';

const won = { solved: true, withChoices: false };
const lost = { solved: false, withChoices: false };

function play(
  learner: Learner,
  rounds: { solved: boolean; withChoices: boolean }[]
): Learner {
  return rounds.reduce(afterRound, learner);
}

describe('choiceCount', () => {
  it('gives 5 options on the first round, then 10, then typing', () => {
    expect(choiceCount(NEW_LEARNER)).toBe(FIRST_CHOICES);
    expect(choiceCount(play(NEW_LEARNER, [won]))).toBe(CHOICES);
    expect(choiceCount(play(NEW_LEARNER, [won, lost]))).toBe(CHOICES);
    expect(choiceCount(play(NEW_LEARNER, [won, lost, won]))).toBe(0);
  });

  it('lets a returning player type straight away', () => {
    expect(choiceCount(RETURNING_LEARNER)).toBe(0);
    expect(offersWheels(RETURNING_LEARNER)).toBe(false);
  });

  it('gives 10 options while training wheels are on', () => {
    expect(choiceCount(acceptWheels({ ...RETURNING_LEARNER, losses: 3 }))).toBe(
      CHOICES
    );
  });
});

describe('training wheels', () => {
  it('are offered after 3 losses in a row, only while typing', () => {
    const typist = RETURNING_LEARNER;
    expect(offersWheels(play(typist, [lost, lost]))).toBe(false);
    expect(offersWheels(play(typist, [lost, lost, lost]))).toBe(true);
    // A win resets the run.
    expect(offersWheels(play(typist, [lost, lost, lost, won]))).toBe(false);
    expect(offersWheels(play(typist, [lost, won, lost, lost]))).toBe(false);
    // A new player losing their first three rounds is offered on the fourth.
    expect(offersWheels(play(NEW_LEARNER, [lost, lost]))).toBe(false);
    expect(offersWheels(play(NEW_LEARNER, [lost, lost, lost]))).toBe(true);
  });

  it('are offered again on the next round while the run holds', () => {
    // Saying no changes nothing in the record, so the next round asks again.
    const declined = play(RETURNING_LEARNER, [lost, lost, lost, lost]);
    expect(offersWheels(declined)).toBe(true);
  });

  it('come off after 2 wins with choices', () => {
    const on = acceptWheels(play(RETURNING_LEARNER, [lost, lost, lost]));
    expect(offersWheels(on)).toBe(false);
    const withChoices = { solved: true, withChoices: true };
    const lostWithChoices = { solved: false, withChoices: true };
    const one = play(on, [withChoices, lostWithChoices]);
    expect(one.wheels).toBe(true);
    expect(choiceCount(one)).toBe(CHOICES);
    const two = afterRound(one, withChoices);
    expect(two.wheels).toBe(false);
    expect(two.losses).toBe(0);
    expect(choiceCount(two)).toBe(0);
    expect(offersWheels(two)).toBe(false);
  });

  it('do not count a new player’s wins toward coming off', () => {
    const learner = play(NEW_LEARNER, [
      { solved: true, withChoices: true },
      { solved: true, withChoices: true },
    ]);
    expect(learner.wheels).toBe(false);
    expect(learner.wheelWins).toBe(0);
    expect(learner.finished).toBe(2);
  });
});
