// The mascot's drawing: one continuous line, posed by a handful of numbers.
// Typed port of design/bunny/bunny.js; see design/bunny/README.md for how it
// works, and bunny.ts for how the parts fit together.
//
// The bunny is a single SVG <path>. Its shape is built from anchor points
// tagged with the part they belong to (body, head, back ear, front ear, hind
// foot). A pose is a small object of numbers (ear angles, foot lift, squash,
// position); each frame we move the tagged points and rebuild the path's `d`.
// That keeps it one unbroken stroke while the ears and foot still move.
//
// Coordinates: the bunny stands on y = 0 and faces right (+x). Up is -y.

export type Vec = readonly [number, number];
type Tag = 'b' | 'h' | 'eb' | 'ef' | 'f';
type TPoint = readonly [number, number, Tag];
type Segment = { cmd: 'M' | 'C'; pts: readonly TPoint[] };
type Placed = { cmd: 'M' | 'C'; pts: readonly Vec[] };

/** Array access for indices the geometry guarantees exist. */
export function at<T>(list: readonly T[], i: number): T {
  const value = list[i < 0 ? list.length + i : i];
  if (value === undefined) throw new Error(`bunny: no point ${i}`);
  return value;
}

// Pivots in bunny space.
const NECK: Vec = [16, -98];
// The hind foot hinges where it comes out from under the haunch, so a thump
// lifts the toe clear of the thigh.
const FOOT_PIVOT: Vec = [2, -1];
// For an ear scratch the foot swings up from that hinge to the base of the
// back ear, toe up. On the way it flips over (its height scales from 1 to -1)
// so the top of the foot faces forward: the line then runs up the front of
// the raised leg and back down behind it without crossing itself, and the
// flip reads as the leg turning out. pose.kick blends rest (0) to raised (1).
const KICK = { rot: -88, dx: 6, dy: -92 };

// The head is drawn a little small below and scaled up from the chin, which
// keeps the face big and round without redrawing every point. HEAD_LIFT
// raises it onto the long neck.
const HEAD_SCALE = 1.14;
const HEAD_LIFT = 18;
const CHIN: Vec = [36, -76];
const big = ([x, y]: Vec): Vec => [
  CHIN[0] + (x - CHIN[0]) * HEAD_SCALE,
  CHIN[1] + (y - CHIN[1]) * HEAD_SCALE - HEAD_LIFT,
];

type Ear = { pivot: Vec; rest: number; w: number; len: number };
// Ears lie swept back along the head; the far ear sits lower, behind the
// near one.
const EAR_BACK: Ear = { pivot: big([15, -109]), rest: -58, w: 15, len: 46 };
const EAR_FRONT: Ear = { pivot: big([25, -113]), rest: -44, w: 17, len: 54 };

// A leaf-shaped ear in its own frame, base at the origin, pointing up.
function earPoints(
  w: number,
  len: number,
  tag: Tag
): { start: TPoint; curves: TPoint[] } {
  const h = w / 2;
  return {
    start: [-h, 0, tag],
    curves: [
      [-w, -len * 0.45, tag],
      [-w * 0.72, -len, tag],
      [0, -len, tag],
      [w * 0.72, -len, tag],
      [w, -len * 0.45, tag],
      [h, 0, tag],
    ],
  };
}

const M = (p: TPoint): Segment => ({ cmd: 'M', pts: [p] });
const C = (a: TPoint, b: TPoint, c: TPoint): Segment => ({
  cmd: 'C',
  pts: [a, b, c],
});

// The drawing, in pen order. 'b' body, 'h' head, 'eb'/'ef' ears (in ear
// frame), 'f' hind foot. There is only one M: the eye is a curl of the same
// line. An upright, sitting bunny: big round head, ears swept back, a dipped
// nape, thin front legs and a big round haunch with a puff of tail behind it.
function buildSpec(): Segment[] {
  const eb = earPoints(EAR_BACK.w, EAR_BACK.len, 'eb');
  const ef = earPoints(EAR_FRONT.w, EAR_FRONT.len, 'ef');
  const e = (ear: { curves: TPoint[] }, i: number): TPoint => at(ear.curves, i);
  return [
    // Start at the crease where the belly meets the thigh and run down the
    // round front of the haunch onto the hind foot.
    M([3.5, -40, 'b']),
    C([7.5, -33.5, 'b'], [10, -25, 'b'], [9, -18, 'b']),
    C([8.5, -14, 'b'], [6.5, -11.5, 'b'], [4.5, -9.5, 'b']),
    // A long hind foot flat on the ground: top, round toe, sole. Only the
    // part in front of the haunch lifts for a thump.
    C([9.5, -10, 'b'], [14, -9.5, 'f'], [18, -7, 'f']),
    C([23.5, -4.5, 'f'], [23, 0.5, 'f'], [16, 0.5, 'f']),
    C([11, 0.5, 'f'], [5, 0.5, 'f'], [0, 0.5, 'f']),
    C([-12, 0.5, 'b'], [-26, 0.5, 'b'], [-36, 0.5, 'b']),
    // Round the heel and up the full back of the haunch to the tail.
    C([-45, 0, 'b'], [-50.5, -6, 'b'], [-49.5, -15, 'b']),
    C([-49.5, -21, 'b'], [-47, -26, 'b'], [-45, -30, 'b']),
    // Tail: a round puff on the rump.
    C([-54.5, -28, 'b'], [-58.5, -38.5, 'b'], [-53, -46.5, 'b']),
    C([-50, -52.5, 'b'], [-43.5, -52.5, 'b'], [-42.5, -46.5, 'b']),
    // The rump rolls up into one smooth slope to the nape.
    C([-42, -64, 'b'], [-28.5, -85.5, 'b'], [-7.5, -97, 'b']),
    C([-4, -81, 'h'], [2, -82, 'h'], [6, -86, 'h']),
    // The back of the big round head, up to the far ear.
    C([3, -92, 'h'], [5, -101, 'h'], eb.start),
    C(e(eb, 0), e(eb, 1), e(eb, 2)),
    C(e(eb, 3), e(eb, 4), e(eb, 5)),
    // Across the crown to the near ear.
    C([17, -110, 'h'], [18, -111, 'h'], ef.start),
    C(e(ef, 0), e(ef, 1), e(ef, 2)),
    C(e(ef, 3), e(ef, 4), e(ef, 5)),
    // Down the forehead, then the line dips in and curls round on itself to
    // make the eye before it runs on to the nose.
    C([42, -117.5, 'h'], [50.5, -112, 'h'], [52.5, -105, 'h']),
    C([52, -101, 'h'], [49, -96.5, 'h'], [45.5, -96.5, 'h']),
    C([42, -96.5, 'h'], [41.5, -102.5, 'h'], [45, -102.5, 'h']),
    C([48.5, -102.5, 'h'], [52.5, -99, 'h'], [55, -96.5, 'h']),
    // A small round nose, then a soft muzzle rounding back to the chin.
    C([56.5, -95.5, 'h'], [58, -94, 'h'], [58, -91, 'h']),
    C([58, -88, 'h'], [55.5, -87, 'h'], [54, -86, 'h']),
    C([52, -79.5, 'h'], [44.5, -73.5, 'h'], [34, -73, 'h']),
    // A full chest down a sturdy front leg to the paw.
    C([43, -74, 'b'], [45.5, -54.5, 'b'], [43.5, -41, 'b']),
    C([42, -28, 'b'], [42, -14, 'b'], [44.5, -6, 'b']),
    C([46.5, -2, 'b'], [53.5, -3.5, 'b'], [54, -0.5, 'b']),
    C([53.5, 1.5, 'b'], [48, 1, 'b'], [41, 0.5, 'b']),
    C([32, 0, 'b'], [27, -2, 'b'], [26.5, -7, 'b']),
    C([26.5, -14, 'b'], [25.5, -19, 'b'], [23.5, -25, 'b']),
    // A short belly into the crease, then the domed top of the thigh arcs
    // back over the haunch and into the rump at the tail.
    C([18, -32.5, 'b'], [9.5, -40, 'b'], [3.5, -40, 'b']),
    C([0, -50, 'b'], [-7.5, -60, 'b'], [-18.5, -60, 'b']),
    C([-29, -60, 'b'], [-36.5, -53.5, 'b'], [-42.5, -46.5, 'b']),
  ];
}

const SPEC: readonly Segment[] = buildSpec().map(({ cmd, pts }) => ({
  cmd,
  pts: pts.map((p): TPoint => {
    if (p[2] !== 'h') return p;
    const [x, y] = big([p[0], p[1]]);
    return [x, y, 'h'];
  }),
}));

export type Pose = {
  /** World offset of the bunny origin. */
  x: number;
  y: number;
  /** Whole-body turn in degrees, around its middle. */
  rot: number;
  /** Squash and stretch, from the ground. */
  sx: number;
  sy: number;
  headDy: number;
  headRot: number;
  /** Extra ear angles on top of their rest angles. */
  earB: number;
  earF: number;
  earLen: number;
  /** Negative lifts the toe for a thump. */
  foot: number;
  /** 0 foot down, 1 foot raised to the back ear for a scratch. */
  kick: number;
  /** -1 looks the other way (the head peeking out of the hole). */
  turn: number;
  opacity: number;
};

export const REST: Readonly<Pose> = {
  x: 0,
  y: 0,
  rot: 0,
  sx: 1,
  sy: 1,
  headDy: 0,
  headRot: 0,
  earB: 0,
  earF: 0,
  earLen: 1,
  foot: 0,
  kick: 0,
  turn: 1,
  opacity: 1,
};

export const POSE_KEYS = Object.keys(REST).filter(
  (k): k is keyof Pose => k in REST
);

function rotate([x, y]: Vec, [cx, cy]: Vec, deg: number): Vec {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

function headTransform(p: Vec, pose: Pose): Vec {
  const q = rotate(p, NECK, pose.headRot);
  return [q[0], q[1] + pose.headDy];
}

function place([x, y, tag]: TPoint, pose: Pose): Vec {
  if (tag === 'h') return headTransform([x, y], pose);
  if (tag === 'f') {
    const k = pose.kick;
    const flipped: Vec = [x, FOOT_PIVOT[1] + (y - FOOT_PIVOT[1]) * (1 - 2 * k)];
    const q = rotate(flipped, FOOT_PIVOT, pose.foot + KICK.rot * k);
    return [q[0] + KICK.dx * k, q[1] + KICK.dy * k];
  }
  if (tag === 'eb' || tag === 'ef') {
    const ear = tag === 'eb' ? EAR_BACK : EAR_FRONT;
    const extra = tag === 'eb' ? pose.earB : pose.earF;
    const turned = rotate([x, y * pose.earLen], [0, 0], ear.rest + extra);
    return headTransform(
      [ear.pivot[0] + turned[0], ear.pivot[1] + turned[1]],
      pose
    );
  }
  return [x, y];
}

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const fmt = (n: number): number => Math.round(n * 10) / 10;

// The posed drawing as numbers.
export function posed(pose: Partial<Pose>): Placed[] {
  const p: Pose = { ...REST, ...pose };
  return SPEC.map(({ cmd, pts }) => ({
    cmd,
    pts: pts.map((pt) => place(pt, p)),
  }));
}

export function bunnyPath(pose: Partial<Pose> = REST): string {
  return posed(pose)
    .map(
      ({ cmd, pts }) =>
        `${cmd}${pts.map((q) => `${fmt(q[0])} ${fmt(q[1])}`).join(' ')}`
    )
    .join(' ');
}

// The rotation pivot for the whole body sits around its middle.
const BODY_CENTRE: Vec = [0, -48];

// facing is 1 to look right, -1 to look left (a mirror image). pose.turn
// flips it again; easing it from 1 to -1 reads as a turn of the head.
const look = (p: Pose, facing: number): number => facing * p.turn;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function bunnyTransform(
  pose: Partial<Pose>,
  origin: Vec,
  facing = 1
): string {
  const p: Pose = { ...REST, ...pose };
  return (
    `translate(${fmt(origin[0] + p.x)} ${fmt(origin[1] + p.y)}) ` +
    `rotate(${fmt(p.rot)} ${BODY_CENTRE[0]} ${BODY_CENTRE[1]}) ` +
    `scale(${r3(p.sx * look(p, facing))} ${r3(p.sy)})`
  );
}

// bunnyTransform applied to a single point.
export function toWorld(
  [x, y]: Vec,
  p: Pose,
  origin: Vec,
  facing: number
): Vec {
  const r = rotate([x * p.sx * look(p, facing), y * p.sy], BODY_CENTRE, p.rot);
  return [r[0] + origin[0] + p.x, r[1] + origin[1] + p.y];
}
