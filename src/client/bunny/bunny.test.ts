import { describe, expect, it } from 'vitest';
import {
  PET_COOLDOWN_MS,
  QUIET_MS,
  SCRATCH_CHANCE,
  canPet,
  idleMove,
  inHoleAfter,
  movePlays,
} from './moves';
import type { MoveName } from './moves';
import { POSES, SCRATCH_STROKE, peekPose } from './poses';
import { bunnyPath } from './shape';
import { bunnyPoints, diveTracks, threadPath } from './thread';

describe('the bunny', () => {
  it('is one continuous line in every pose', () => {
    for (const pose of Object.values(POSES)) {
      const d = bunnyPath(pose);
      expect(d.match(/M/g)).toHaveLength(1);
      expect(d).not.toContain('NaN');
    }
  });

  it('stands on the ground and fits its stage', () => {
    const pts = bunnyPoints({}, [0, 0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.max(...ys)).toBeLessThan(2);
    expect(Math.min(...ys)).toBeGreaterThan(-180);
  });

  it('dives into the hole and peeks out of it', () => {
    const hole = { cx: 206, cy: 171, rx: 40, ry: 10 };
    const spot = { x: 92, facing: 1 };
    const { len, down } = diveTracks(spot, hole, 170);
    const end = threadPath(down, down.total - len, len, 80);
    // At the end of the pour the whole thread is in the shaft below ground.
    const ys = [...end.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) =>
      Number(m[2])
    );
    expect(Math.min(...ys)).toBeGreaterThan(170);
    expect(peekPose(spot, hole, 170, 0).y).toBeGreaterThan(
      peekPose(spot, hole, 170, 1).y
    );
  });

  it('scratches its ear as one line with the foot up by the ear', () => {
    const frames = [
      POSES.scratch,
      { ...POSES.scratch, ...SCRATCH_STROKE.up },
      { ...POSES.scratch, ...SCRATCH_STROKE.down },
      { ...POSES.scratch, kick: 0.5 },
    ];
    for (const pose of frames) {
      const d = bunnyPath(pose);
      expect(d.match(/M/g)).toHaveLength(1);
      expect(d).not.toContain('NaN');
      expect(d).not.toBe(bunnyPath({}));
    }
    // Raised, the line climbs far above the foot's rest height; the highest
    // point of the foot loop sits up by the ears, well above the chin.
    const footTop = (pose: object): number =>
      Math.min(
        ...bunnyPoints(pose, [0, 0])
          .slice(16 * 3, 16 * 6)
          .map((q) => q[1])
      );
    expect(footTop({})).toBeGreaterThan(-15);
    expect(footTop(POSES.scratch)).toBeLessThan(-100);
  });
});

describe('the bunny between moves', () => {
  it('scratches now and then, twitches mostly, thumps when left alone', () => {
    expect(idleMove(QUIET_MS + 1, 0)).toBe('thump');
    expect(idleMove(1000, 0)).toBe('scratch');
    expect(idleMove(1000, SCRATCH_CHANCE)).toBe('twitch');
    expect(idleMove(1000, 0.99)).toBe('twitch');
    expect(SCRATCH_CHANCE).toBeGreaterThan(0);
    expect(SCRATCH_CHANCE).toBeLessThan(0.5);
  });

  it('ignores taps mid-move and during the cooldown', () => {
    expect(PET_COOLDOWN_MS).toBeGreaterThanOrEqual(3000);
    expect(PET_COOLDOWN_MS).toBeLessThanOrEqual(5000);
    // First tap: nothing has been petted yet.
    expect(canPet(500, 0, false)).toBe(true);
    // A move is playing.
    expect(canPet(500, 0, true)).toBe(false);
    // A pet ended at t = 10000, so taps wait out the cooldown.
    const readyAt = 10000 + PET_COOLDOWN_MS;
    expect(canPet(10001, readyAt, false)).toBe(false);
    expect(canPet(readyAt - 1, readyAt, false)).toBe(false);
    expect(canPet(readyAt, readyAt, false)).toBe(true);
  });

  it('stays in the hole after diving until it climbs out', () => {
    const others: MoveName[] = [
      'twitch',
      'thump',
      'scratch',
      'perk',
      'droop',
      'travel',
    ];
    let inHole = inHoleAfter('dive', false);
    expect(inHole).toBe(true);
    for (const name of others) {
      expect(movePlays(name, inHole)).toBe(false);
      inHole = inHoleAfter(name, inHole);
      expect(inHole).toBe(true);
    }
    expect(movePlays('dive', true)).toBe(false);
    expect(movePlays('climb', true)).toBe(true);
    expect(inHoleAfter('climb', true)).toBe(false);
    for (const name of others) expect(movePlays(name, false)).toBe(true);
    expect(movePlays('climb', false)).toBe(false);
  });

  it('is out of sight while it waits in the hole', () => {
    const hole = { cx: 206, cy: 171, rx: 40, ry: 10 };
    const spot = { x: 92, facing: 1 };
    const ys = bunnyPoints(peekPose(spot, hole, 170, 0), [spot.x, 170]).map(
      (q) => q[1]
    );
    // Everything is below the ground line, where the stage clips it away.
    expect(Math.min(...ys)).toBeGreaterThan(170);
  });
});
