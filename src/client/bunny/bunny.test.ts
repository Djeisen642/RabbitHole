import { describe, expect, it } from 'vitest';
import {
  POSES,
  bunnyPath,
  bunnyPoints,
  diveTracks,
  peekPose,
  threadPath,
} from './bunny';

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
});
