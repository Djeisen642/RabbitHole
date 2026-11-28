// Unravelling: the bunny coming undone into a loose line to travel across
// the stage or pour down the hole, and winding back up.
//
// To get anywhere, the bunny comes undone. We lay out one long track: the
// bunny's own outline in pen order, then a route across the stage, then the
// outline of the bunny where it is going. The line becomes a thread exactly as
// long as the outline and slides along that track like a train on rails.
import { at, fmt, lerp, REST, posed, toWorld } from './shape';
import type { Pose, Vec } from './shape';

function cubic(a: Vec, b: Vec, c: Vec, d: Vec, t: number): Vec {
  const u = 1 - t;
  const k0 = u * u * u;
  const k1 = 3 * u * u * t;
  const k2 = 3 * u * t * t;
  const k3 = t * t * t;
  return [
    k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0],
    k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1],
  ];
}

const unit = (from: Vec, to: Vec): Vec => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
const along = (p: Vec, dir: Vec, k: number): Vec => [
  p[0] + dir[0] * k,
  p[1] + dir[1] * k,
];

export type Track = { points: Vec[]; cum: number[]; total: number };

// A polyline with its running length, ready to be walked along.
function measure(points: Vec[]): Track {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = at(points, i - 1);
    const [bx, by] = at(points, i);
    cum.push(at(cum, i - 1) + Math.hypot(bx - ax, by - ay));
  }
  return { points, cum, total: at(cum, -1) };
}

// The posed bunny as world-space points, in pen order.
export function bunnyPoints(
  pose: Partial<Pose>,
  origin: Vec,
  facing = 1
): Vec[] {
  const p: Pose = { ...REST, ...pose };
  const out: Vec[] = [];
  let pen: Vec = [0, 0];
  for (const { cmd, pts } of posed(p)) {
    if (cmd === 'M') {
      pen = at(pts, 0);
      out.push(toWorld(pen, p, origin, facing));
      continue;
    }
    const b = at(pts, 0);
    const c = at(pts, 1);
    const d = at(pts, 2);
    for (let i = 1; i <= 16; i += 1) {
      out.push(toWorld(cubic(pen, b, c, d, i / 16), p, origin, facing));
    }
    pen = d;
  }
  return out;
}

// A smooth curve through the waypoints (Catmull-Rom), finely sampled.
function through(way: readonly Vec[]): Vec[] {
  const out: Vec[] = [at(way, 0)];
  for (let i = 0; i < way.length - 1; i += 1) {
    const p0 = at(way, Math.max(0, i - 1));
    const p1 = at(way, i);
    const p2 = at(way, i + 1);
    const p3 = at(way, Math.min(way.length - 1, i + 2));
    const b: Vec = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c: Vec = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const steps = Math.max(
      4,
      Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3)
    );
    for (let s = 1; s <= steps; s += 1)
      out.push(cubic(p1, b, c, p2, s / steps));
  }
  return out;
}

// A gentle sideways wave along a route, so the loose line slithers like a
// ribbon. It fades out at both ends to meet the bunny cleanly.
function ripple(points: Vec[], amp: number, wave: number): Vec[] {
  const { cum, total } = measure(points);
  return points.map(([x, y], i): Vec => {
    const prev = at(points, Math.max(0, i - 1));
    const next = at(points, Math.min(points.length - 1, i + 1));
    const [tx, ty] = unit(prev, next);
    const s = at(cum, i);
    const fade = Math.max(0, Math.min(1, s / 50, (total - s) / 50));
    const off = amp * fade * Math.sin((s / wave) * 2 * Math.PI);
    return [x - ty * off, y + tx * off];
  });
}

function join(...parts: Vec[][]): Track {
  const pts: Vec[] = [];
  for (const part of parts) {
    for (const q of part) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.01)
        pts.push(q);
    }
  }
  return measure(pts);
}

type Port = { at: Vec; dir: Vec };
// Where the line leaves a bunny (its last point, heading on) and where it
// enters one (its first point, heading in).
const exitOf = (pts: Vec[]): Port => ({
  at: at(pts, -1),
  dir: unit(at(pts, -4), at(pts, -1)),
});
const entryOf = (pts: Vec[]): Port => ({
  at: at(pts, 0),
  dir: unit(at(pts, 0), at(pts, 3)),
});

export type Spot = { x: number; facing: number };
export type Hole = { cx: number; cy: number; rx: number; ry: number };

// The track for moving from one spot to another. The loose line swings out
// behind the bunny, arcs high over the middle of the stage (and the hole) and
// curls into the new bunny.
export function travelTrack(
  from: Spot,
  to: Spot,
  ground: number,
  pose: Partial<Pose> = REST
): { track: Track; len: number } {
  const A = bunnyPoints(pose, [from.x, ground], from.facing);
  const B = bunnyPoints(REST, [to.x, ground], to.facing);
  const out = exitOf(A);
  const into = entryOf(B);
  const mid = (out.at[0] + into.at[0]) / 2;
  const route = through([
    out.at,
    along(out.at, out.dir, 24),
    [lerp(out.at[0], mid, 0.4), ground - 26],
    [mid, ground - 74],
    [lerp(mid, into.at[0], 0.6), ground - 26],
    along(into.at, into.dir, -24),
    into.at,
  ]);
  const len = measure(A).total;
  return { track: join(A, ripple(route, 3.5, 46), B), len };
}

// Two tracks for the dive: down, where the line pours over into the hole and
// on far below ground, and up, where it climbs back out and winds into the
// bunny again. Below ground the line is hidden by the clip.
export function diveTracks(
  spot: Spot,
  hole: Hole,
  ground: number,
  pose: Partial<Pose> = REST
): { len: number; down: Track; up: Track } {
  const A = bunnyPoints(pose, [spot.x, ground], spot.facing);
  const B = bunnyPoints(REST, [spot.x, ground], spot.facing);
  const len = measure(A).total;
  const hx = hole.cx;
  const top = ground - 64;
  const mouth = ground + 12; // just below the hole's visible floor
  const shaft: Vec[] = [];
  for (let y = mouth; y <= mouth + len + 6; y += 3) shaft.push([hx, y]);
  const out = exitOf(A);
  const over = through([
    out.at,
    along(out.at, out.dir, 24),
    [lerp(out.at[0], hx, 0.5), ground - 42],
    [hx, top],
    [hx, ground - 8],
    [hx, mouth],
  ]);
  const into = entryOf(B);
  const back = through([
    [hx, mouth],
    [hx, ground - 8],
    [hx, top],
    [lerp(hx, into.at[0], 0.5), ground - 42],
    along(into.at, into.dir, -24),
    into.at,
  ]);
  return {
    len,
    down: join(A, ripple(over, 3, 44), shaft),
    up: join([...shaft].reverse(), ripple(back, 3, 44), B),
  };
}

// The `d` of a thread `len` long whose back end sits `d` along the track,
// drawn through `n` points.
export function threadPath(
  track: Track,
  d: number,
  len: number,
  n: number
): string {
  const { points, cum, total } = track;
  const out: string[] = [];
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const s = Math.min(total, Math.max(0, d + (len * i) / (n - 1)));
    while (j < cum.length - 2 && at(cum, j + 1) < s) j += 1;
    const span = at(cum, j + 1) - at(cum, j) || 1;
    const t = (s - at(cum, j)) / span;
    const a = at(points, j);
    const b = at(points, j + 1);
    out.push(`${fmt(lerp(a[0], b[0], t))} ${fmt(lerp(a[1], b[1], t))}`);
  }
  return `M${out.join(' L')}`;
}

// How long a slide takes for a distance along the track, at a speed in units

// per millisecond. Travel is unhurried.
export const slideMs = (dist: number, speed = 0.55): number =>
  Math.min(2600, Math.max(900, dist / speed));

// Points in a thread: about one every 2.5 units of line.
export const threadPoints = (len: number): number =>
  Math.max(60, Math.round(len / 2.5));
