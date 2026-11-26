// r/abbit_hole mascot: one continuous line, posed by a handful of numbers, that
// can unravel into a loose string to travel and wind back up.
//
// The bunny is a single SVG <path>. Its shape is built from anchor points
// tagged with the part they belong to (body, head, back ear, front ear, hind
// foot). A pose is a small object of numbers (ear angles, foot lift, squash,
// position); each frame we move the tagged points and rebuild the path's `d`.
// That keeps it one unbroken stroke while the ears and foot still move, with
// no animation library and nothing to download.
//
// Coordinates: the bunny stands on y = 0 and faces right (+x). Up is -y.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Pivots in bunny space.
const NECK = [16, -98];
// The hind foot hinges where it comes out from under the haunch, so a thump
// lifts the toe clear of the thigh.
const FOOT_PIVOT = [2, -1];
// For an ear scratch the foot swings up from that hinge to the base of the
// back ear, toe up. On the way it flips over (its height scales from 1 to -1)
// so the top of the foot faces forward: the line then runs up the front of
// the raised leg and back down behind it without crossing itself, and the
// flip reads as the leg turning out. pose.kick blends rest (0) to raised (1).
const KICK = { rot: -88, dx: 6, dy: -92 };
// Ears lie swept back along the head; the far ear sits lower, behind the
// near one.
const EAR_BACK = { pivot: [15, -109], rest: -58, w: 15, len: 46 };
const EAR_FRONT = { pivot: [25, -113], rest: -44, w: 17, len: 54 };

// The head is drawn a little small below and scaled up from the chin, which
// keeps the face big and round without redrawing every point. HEAD_LIFT
// raises it onto the long neck.
const HEAD_SCALE = 1.14;
const HEAD_LIFT = 18;
const CHIN = [36, -76];
const big = ([x, y]) => [
  CHIN[0] + (x - CHIN[0]) * HEAD_SCALE,
  CHIN[1] + (y - CHIN[1]) * HEAD_SCALE - HEAD_LIFT,
];
EAR_BACK.pivot = big(EAR_BACK.pivot);
EAR_FRONT.pivot = big(EAR_FRONT.pivot);

// A leaf-shaped ear in its own frame, base at the origin, pointing up.
// Returns [start, ...cubic points] so it can be spliced into the line.
function earPoints(w, len, tag) {
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

// The drawing, in pen order. 'b' body, 'h' head, 'eb'/'ef' ears (in ear
// frame), 'f' hind foot. Each C entry is three points and there is only one
// M: the eye is a curl of the same line. An upright, sitting bunny: big round
// head, ears swept back, a dipped nape, thin front legs and a big round
// haunch with a puff of tail behind it.
function buildSpec() {
  const eb = earPoints(EAR_BACK.w, EAR_BACK.len, 'eb');
  const ef = earPoints(EAR_FRONT.w, EAR_FRONT.len, 'ef');
  return [
    // Start at the crease where the belly meets the thigh and run down the
    // round front of the haunch onto the hind foot.
    ['M', [3.5, -40, 'b']],
    ['C', [7.5, -33.5, 'b'], [10, -25, 'b'], [9, -18, 'b']],
    ['C', [8.5, -14, 'b'], [6.5, -11.5, 'b'], [4.5, -9.5, 'b']],
    // A long hind foot flat on the ground: top, round toe, sole. Only the
    // part in front of the haunch lifts for a thump.
    ['C', [9.5, -10, 'b'], [14, -9.5, 'f'], [18, -7, 'f']],
    ['C', [23.5, -4.5, 'f'], [23, 0.5, 'f'], [16, 0.5, 'f']],
    ['C', [11, 0.5, 'f'], [5, 0.5, 'f'], [0, 0.5, 'f']],
    ['C', [-12, 0.5, 'b'], [-26, 0.5, 'b'], [-36, 0.5, 'b']],
    // Round the heel and up the full back of the haunch to the tail.
    ['C', [-45, 0, 'b'], [-50.5, -6, 'b'], [-49.5, -15, 'b']],
    ['C', [-49.5, -21, 'b'], [-47, -26, 'b'], [-45, -30, 'b']],
    // Tail: a round puff on the rump.
    ['C', [-54.5, -28, 'b'], [-58.5, -38.5, 'b'], [-53, -46.5, 'b']],
    ['C', [-50, -52.5, 'b'], [-43.5, -52.5, 'b'], [-42.5, -46.5, 'b']],
    // The rump rolls up into one smooth slope to the nape.
    ['C', [-42, -64, 'b'], [-28.5, -85.5, 'b'], [-7.5, -97, 'b']],
    ['C', [-4, -81, 'h'], [2, -82, 'h'], [6, -86, 'h']],
    // The back of the big round head, up to the far ear.
    ['C', [3, -92, 'h'], [5, -101, 'h'], eb.start],
    ['C', eb.curves[0], eb.curves[1], eb.curves[2]],
    ['C', eb.curves[3], eb.curves[4], eb.curves[5]],
    // Across the crown to the near ear.
    ['C', [17, -110, 'h'], [18, -111, 'h'], ef.start],
    ['C', ef.curves[0], ef.curves[1], ef.curves[2]],
    ['C', ef.curves[3], ef.curves[4], ef.curves[5]],
    // Down the forehead, then the line dips in and curls round on itself to
    // make the eye before it runs on to the nose.
    ['C', [42, -117.5, 'h'], [50.5, -112, 'h'], [52.5, -105, 'h']],
    ['C', [52, -101, 'h'], [49, -96.5, 'h'], [45.5, -96.5, 'h']],
    ['C', [42, -96.5, 'h'], [41.5, -102.5, 'h'], [45, -102.5, 'h']],
    ['C', [48.5, -102.5, 'h'], [52.5, -99, 'h'], [55, -96.5, 'h']],
    // A small round nose, then a soft muzzle rounding back to the chin.
    ['C', [56.5, -95.5, 'h'], [58, -94, 'h'], [58, -91, 'h']],
    ['C', [58, -88, 'h'], [55.5, -87, 'h'], [54, -86, 'h']],
    ['C', [52, -79.5, 'h'], [44.5, -73.5, 'h'], [34, -73, 'h']],
    // A full chest down a sturdy front leg to the paw.
    ['C', [43, -74, 'b'], [45.5, -54.5, 'b'], [43.5, -41, 'b']],
    ['C', [42, -28, 'b'], [42, -14, 'b'], [44.5, -6, 'b']],
    ['C', [46.5, -2, 'b'], [53.5, -3.5, 'b'], [54, -0.5, 'b']],
    ['C', [53.5, 1.5, 'b'], [48, 1, 'b'], [41, 0.5, 'b']],
    ['C', [32, 0, 'b'], [27, -2, 'b'], [26.5, -7, 'b']],
    ['C', [26.5, -14, 'b'], [25.5, -19, 'b'], [23.5, -25, 'b']],
    // A short belly into the crease, then the domed top of the thigh arcs
    // back over the haunch and into the rump at the tail.
    ['C', [18, -32.5, 'b'], [9.5, -40, 'b'], [3.5, -40, 'b']],
    ['C', [0, -50, 'b'], [-7.5, -60, 'b'], [-18.5, -60, 'b']],
    ['C', [-29, -60, 'b'], [-36.5, -53.5, 'b'], [-42.5, -46.5, 'b']],
  ];
}

const SPEC = buildSpec().map(([cmd, ...pts]) => [
  cmd,
  ...pts.map((p) => (p[2] === 'h' ? [...big(p), 'h'] : p)),
]);

export const REST = {
  x: 0, // world offset of the bunny origin
  y: 0,
  rot: 0, // whole-body turn in degrees, around its middle
  sx: 1, // squash and stretch, from the ground
  sy: 1,
  headDy: 0,
  headRot: 0,
  earB: 0, // extra ear angles on top of their rest angles
  earF: 0,
  earLen: 1,
  foot: 0, // negative lifts the toe for a thump
  kick: 0, // 1 raises the hind foot to the back ear for a scratch
  turn: 1, // -1 looks the other way (the head peeking out of the hole)
  opacity: 1,
};

function rotate([x, y], [cx, cy], deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

function headTransform(p, pose) {
  const q = rotate(p, NECK, pose.headRot);
  return [q[0], q[1] + pose.headDy];
}

function place(point, pose) {
  const [x, y, tag] = point;
  if (tag === 'h') return headTransform([x, y], pose);
  if (tag === 'f') {
    const k = pose.kick;
    const flipped = [x, FOOT_PIVOT[1] + (y - FOOT_PIVOT[1]) * (1 - 2 * k)];
    const q = rotate(flipped, FOOT_PIVOT, pose.foot + KICK.rot * k);
    return [q[0] + KICK.dx * k, q[1] + KICK.dy * k];
  }
  if (tag === 'eb' || tag === 'ef') {
    const ear = tag === 'eb' ? EAR_BACK : EAR_FRONT;
    const extra = tag === 'eb' ? pose.earB : pose.earF;
    const local = [x, y * pose.earLen];
    const turned = rotate(local, [0, 0], ear.rest + extra);
    return headTransform(
      [ear.pivot[0] + turned[0], ear.pivot[1] + turned[1]],
      pose
    );
  }
  return [x, y];
}

const fmt = (n) => Math.round(n * 10) / 10;

// The posed drawing as numbers: each entry is [cmd, ...placed points].
function posed(pose) {
  const p = { ...REST, ...pose };
  return SPEC.map(([cmd, ...pts]) => [cmd, ...pts.map((pt) => place(pt, p))]);
}

export function bunnyPath(pose = REST) {
  return posed(pose)
    .map(
      ([cmd, ...pts]) =>
        `${cmd}${pts.map((q) => q.map(fmt).join(' ')).join(' ')}`
    )
    .join(' ');
}

// The rotation pivot for the whole body sits around its middle.
const BODY_CENTRE = [0, -48];

// facing is 1 to look right, -1 to look left (a mirror image). pose.turn
// flips it again; easing it from 1 to -1 reads as a turn of the head.
const look = (p, facing) => facing * p.turn;
const r3 = (n) => Math.round(n * 1000) / 1000;

export function bunnyTransform(pose, origin, facing = 1) {
  const p = { ...REST, ...pose };
  const [ox, oy] = origin;
  return (
    `translate(${fmt(ox + p.x)} ${fmt(oy + p.y)}) ` +
    `rotate(${fmt(p.rot)} ${BODY_CENTRE[0]} ${BODY_CENTRE[1]}) ` +
    `scale(${r3(p.sx * look(p, facing))} ${r3(p.sy)})`
  );
}

// bunnyTransform applied to a single point.
function toWorld([x, y], p, origin, facing) {
  const r = rotate([x * p.sx * look(p, facing), y * p.sy], BODY_CENTRE, p.rot);
  return [r[0] + origin[0] + p.x, r[1] + origin[1] + p.y];
}

// ---------------------------------------------------------------------------
// Poses

export const POSES = {
  rest: {},
  perk: {
    earB: 22,
    earF: 18,
    earLen: 1.07,
    headDy: -5,
    headRot: -4,
    sy: 1.04,
    sx: 0.98,
  },
  droop: {
    earB: -30,
    earF: -38,
    earLen: 0.94,
    headDy: 6,
    headRot: 12,
    sy: 0.95,
    sx: 1.03,
  },
  crouch: { sy: 0.86, sx: 1.07, earB: -12, earF: -12, headDy: 3 },
  // Hind foot up at the back ear, head tipped down to meet it.
  scratch: { kick: 1, headRot: 12, headDy: 6, earB: -6, sy: 0.97 },
};

// The two ends of a scratching stroke, laid over POSES.scratch: the toe rakes
// down the ear base and back up, and the ear bobs with it.
export const SCRATCH_STROKE = {
  up: { kick: 0.92, foot: 9, earB: 5 },
  down: { kick: 1, foot: -7, earB: -16 },
};

// ---------------------------------------------------------------------------
// Behaviour rules

// Idle for this long and the bunny starts thumping.
export const QUIET_MS = 15000;
// Share of idle beats that are an ear scratch instead of a twitch.
export const SCRATCH_CHANCE = 0.18;

// Which idle move to play: scratches are occasional, twitches the norm.
export function idleMove(quietFor, roll) {
  if (quietFor > QUIET_MS) return 'thump';
  return roll < SCRATCH_CHANCE ? 'scratch' : 'twitch';
}

// After a pet finishes, further taps are ignored for this long so that
// repeated tapping can't spam the animation.
export const PET_COOLDOWN_MS = 4000;

// A tap counts unless a move is playing or the last pet is cooling down.
export const canPet = (now, readyAt, busy) => !busy && now >= readyAt;

// Once it has dived it stays in the hole: only climbing brings it out, and
// nothing else plays there (petting has its own in-hole peek).
export const movePlays = (name, inHole) =>
  inHole ? name === 'climb' : name !== 'climb';

export function inHoleAfter(name, inHole) {
  if (name === 'dive') return true;
  if (name === 'climb') return false;
  return inHole;
}

// ---------------------------------------------------------------------------
// Unravelling
//
// To get anywhere, the bunny comes undone. We lay out one long track: the
// bunny's own outline in pen order, then a route across the stage, then the
// outline of the bunny where it is going. The line becomes a thread exactly as
// long as the outline and slides along that track like a train on rails. It
// starts lying on the bunny; its front end runs out along the route while its
// back end unpicks the drawing; it ends lying on the new bunny, its front end
// having drawn it in like a pen. The track is sampled once per move from the
// curves themselves (no DOM measuring), so each frame is plain arithmetic and
// one `d` update.

const lerp = (a, b, t) => a + (b - a) * t;

function cubic(a, b, c, d, t) {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map(
    (i) => k[0] * a[i] + k[1] * b[i] + k[2] * c[i] + k[3] * d[i]
  );
}

const unit = (from, to) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
const along = (p, dir, k) => [p[0] + dir[0] * k, p[1] + dir[1] * k];

// A polyline with its running length, ready to be walked along.
function measure(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return { points, cum, total: cum[cum.length - 1] };
}

// The posed bunny as world-space points, in pen order.
export function bunnyPoints(pose, origin, facing = 1) {
  const p = { ...REST, ...pose };
  const out = [];
  let pen = [0, 0];
  for (const [cmd, ...pts] of posed(p)) {
    if (cmd === 'M') {
      pen = pts[0];
      out.push(toWorld(pen, p, origin, facing));
      continue;
    }
    const [b, c, d] = pts;
    for (let i = 1; i <= 16; i += 1) {
      out.push(toWorld(cubic(pen, b, c, d, i / 16), p, origin, facing));
    }
    pen = d;
  }
  return out;
}

// A smooth curve through the waypoints (Catmull-Rom), finely sampled.
function through(way) {
  const out = [way[0]];
  for (let i = 0; i < way.length - 1; i += 1) {
    const p0 = way[Math.max(0, i - 1)];
    const p1 = way[i];
    const p2 = way[i + 1];
    const p3 = way[Math.min(way.length - 1, i + 2)];
    const b = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
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
function ripple(points, amp, wave) {
  const { cum, total } = measure(points);
  return points.map(([x, y], i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const [tx, ty] = unit(prev, next);
    const s = cum[i];
    const fade = Math.max(0, Math.min(1, s / 50, (total - s) / 50));
    const off = amp * fade * Math.sin((s / wave) * 2 * Math.PI);
    return [x - ty * off, y + tx * off];
  });
}

function join(...parts) {
  const pts = [];
  for (const part of parts) {
    for (const q of part) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.01)
        pts.push(q);
    }
  }
  return measure(pts);
}

// Where the line leaves a bunny (its last point, heading on) and where it
// enters one (its first point, heading in).
function exitOf(pts) {
  const a = pts[pts.length - 1];
  return { at: a, dir: unit(pts[pts.length - 4], a) };
}
function entryOf(pts) {
  return { at: pts[0], dir: unit(pts[0], pts[3]) };
}

// The track for moving from one spot ({x, facing}) to another. The loose line
// swings out behind the bunny, arcs high over the middle of the stage (and
// the hole) and curls into the new bunny.
export function travelTrack(from, to, ground, pose = REST) {
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
export function diveTracks(spot, hole, ground, pose = REST) {
  const A = bunnyPoints(pose, [spot.x, ground], spot.facing);
  const B = bunnyPoints(REST, [spot.x, ground], spot.facing);
  const len = measure(A).total;
  const hx = hole.cx;
  const top = ground - 64;
  const mouth = ground + 12; // just below the hole's visible floor
  const shaft = [];
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
export function threadPath(track, d, len, n) {
  const { points, cum, total } = track;
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const s = Math.min(total, Math.max(0, d + (len * i) / (n - 1)));
    while (j < cum.length - 2 && cum[j + 1] < s) j += 1;
    const span = cum[j + 1] - cum[j] || 1;
    const t = (s - cum[j]) / span;
    const a = points[j];
    const b = points[j + 1];
    out.push(`${fmt(lerp(a[0], b[0], t))} ${fmt(lerp(a[1], b[1], t))}`);
  }
  return `M${out.join(' L')}`;
}

// How long a slide takes for a distance along the track, at a speed in units
// per millisecond. Travel is unhurried.
export const slideMs = (dist, speed = 0.55) =>
  Math.min(2600, Math.max(900, dist / speed));

// The dive is quick, it's a reward: a fixed time for each half.
export const DIVE_MS = { pour: 760, climb: 820 };
export const PEEK_MS = { eyes: 550, wary: 180, rise: 320, duck: 150 };

// The head peeking out of the hole after the dive. The bunny stands in the
// shaft with its neck stretched, sunk so the ground cuts it just under the
// chin, where it is narrow enough to fit the opening. On the way up the head
// and ears are a little wider than the hole, so the bunny is drawn slightly
// narrower and leans a touch to keep whatever is crossing the ground inside
// the hole: ears first, then the eyes, then the neck.
export const PEEK = { headDy: -12, earB: -4, earF: 6 };
const PEEK_CUT = 90; // height on the bunny where the ground cuts it
const PEEK_HIDE = 120; // how far down it sinks to be out of sight
// [cut height, middle of the bunny there] while rising, read off the outline.
const PEEK_MIDS = [
  [96, 10],
  [100, 12],
  [104, 14],
  [108, 17],
  [112, 20],
  [116, 22],
  [120, 24],
  [140, 20],
  [144, 16],
  [148, 12],
  [152, 8],
  [156, 6],
];
const smooth = (t) => t * t * (3 - 2 * t);

function peekMid(cut) {
  const m = PEEK_MIDS;
  if (cut <= m[0][0]) return m[0][1];
  for (let i = 1; i < m.length; i += 1) {
    if (cut <= m[i][0]) {
      const t = (cut - m[i - 1][0]) / (m[i][0] - m[i - 1][0]);
      return lerp(m[i - 1][1], m[i][1], smooth(t));
    }
  }
  return m[m.length - 1][1];
}

// The peek pose `up` of the way out of the hole (0 hidden, 1 peeking),
// centred on the hole. turn is 1 or -1 (which way it looks).
export function peekPose(spot, hole, ground, up = 1, turn = 1, extra = {}) {
  const cut = PEEK_CUT + PEEK_HIDE * (1 - up);
  const sx = 0.9 + 0.1 * smooth(Math.max(0, Math.min(1, (110 - cut) / 14)));
  return {
    ...REST,
    ...PEEK,
    ...extra,
    turn,
    sx,
    x: hole.cx - spot.x - peekMid(cut) * sx * spot.facing * turn,
    y: hole.cy - ground + cut,
  };
}

// The slow, careful rise: up to the eyes, a wary pause, then the rest.
export const PEEK_EYES = 1 - 28 / PEEK_HIDE;

// Points in a thread: about one every 2.5 units of line.
export const threadPoints = (len) => Math.max(60, Math.round(len / 2.5));

// ---------------------------------------------------------------------------
// Moves

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  // Gentler curves for sliding the loose line, so it never whips past.
  glide: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  glideIn: (t) => 1 - Math.cos((Math.PI * t) / 2),
  glideOut: (t) => Math.sin((Math.PI * t) / 2),
  // Quick but not abrupt: for the dive's pour and climb.
  snapIn: (t) => t * (0.4 + 0.6 * t),
  snapOut: (t) => 1 - (1 - t) ** 2 * (1.6 - 0.6 * (1 - t)),
  back: (t) => {
    const c = 1.7;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Builds the drawing inside an <svg> and returns controls for it.
// options: ground (y of the ground line), width (of the stage), homeX and
// awayX (the two places it sits, either side of the hole), holeX.
export function createBunny(svg, options = {}) {
  const ground = options.ground ?? 170;
  const width = options.width ?? 264;
  const hole = { cx: options.holeX ?? 190, cy: ground + 1, rx: 40, ry: 10 };
  const faceHole = (x) => ({ x, facing: x > hole.cx ? -1 : 1 });
  const spots = [
    faceHole(options.homeX ?? 78),
    faceHole(options.awayX ?? width - 78),
  ];
  const reduced =
    options.reducedMotion ??
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const id = `rh${Math.random().toString(36).slice(2, 7)}`;
  svg.innerHTML = `
    <defs>
      <clipPath id="${id}-clip">
        <rect x="-400" y="-400" width="${width + 800}" height="${400 + ground + 2}"></rect>
        <ellipse cx="${hole.cx}" cy="${hole.cy}" rx="${hole.rx - 1}" ry="${hole.ry - 0.5}"></ellipse>
      </clipPath>
    </defs>
    <path class="rh-ground" d="M14 ${ground} C40 ${ground - 1.5} 70 ${ground + 1.2} 104 ${ground}
      S140 ${ground - 1} ${hole.cx - hole.rx - 6} ${ground}
      M${hole.cx + hole.rx + 5} ${ground} C${hole.cx + 52} ${ground - 1} ${hole.cx + 62} ${ground + 1} ${width - 12} ${ground}"></path>
    <path class="rh-mound" d="M${hole.cx - hole.rx - 4} ${ground}
      C${hole.cx - 28} ${ground - 15} ${hole.cx + 26} ${ground - 17} ${hole.cx + hole.rx + 4} ${ground}"></path>
    <ellipse class="rh-hole" cx="${hole.cx}" cy="${hole.cy}" rx="${hole.rx}" ry="${hole.ry}"></ellipse>
    <g class="rh-dust" opacity="0">
      <path d="M-54.5 -3 l-9 -1.5 M-54.5 -10 l-8 -5 M-51.5 -17 l-5 -6"></path>
    </g>
    <g clip-path="url(#${id}-clip)">
      <path class="rh-bunny"></path>
    </g>`;

  const line = svg.querySelector('.rh-bunny');
  const dust = svg.querySelector('.rh-dust');
  let spot = { ...spots[0] };
  let inHole = options.inHole === true;
  // Down the hole the line is posed below ground, where the clip hides it.
  const hidden = () => peekPose(spot, hole, ground, 0);
  let pose = inHole ? hidden() : { ...REST };
  let petReadyAt = 0;
  let busy = false;
  let token = 0; // bumps to cancel a running move

  function render() {
    line.setAttribute('d', bunnyPath(pose));
    line.setAttribute(
      'transform',
      bunnyTransform(pose, [spot.x, ground], spot.facing)
    );
    line.style.opacity = String(pose.opacity);
    dust.setAttribute(
      'transform',
      `translate(${spot.x + pose.x} ${ground + pose.y}) scale(${spot.facing} 1)`
    );
  }

  // Tween from the current pose to `target` (fields not given go to rest
  // unless keep is set).
  function to(target, ms, curve = 'inOut', keep = false) {
    const from = { ...pose };
    const goal = keep ? { ...pose, ...target } : { ...REST, ...target };
    const mine = token;
    if (reduced || ms <= 0) {
      pose = goal;
      render();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        if (mine !== token) return resolve();
        const t = Math.min(1, (now - t0) / ms);
        const k = ease[curve](t);
        for (const key of Object.keys(goal)) {
          pose[key] = lerp(from[key], goal[key], k);
        }
        render();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // Slide the loose line along a track, its back end going from d0 to d1.
  // The line is drawn in stage coordinates while it is loose; render() puts
  // the bunny's own transform back.
  function slide(track, len, d0, d1, speed = 0.55, curve = 'glide', time) {
    const mine = token;
    const n = threadPoints(len);
    const ms = time ?? slideMs(Math.abs(d1 - d0), speed);
    line.removeAttribute('transform');
    line.style.opacity = '1';
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        if (mine !== token) return resolve();
        const t = Math.min(1, (now - t0) / ms);
        line.setAttribute(
          'd',
          threadPath(track, lerp(d0, d1, ease[curve](t)), len, n)
        );
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // Play a pose-at-time function, t going from 0 to 1 over `ms`.
  function play(at, ms) {
    const mine = token;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        if (mine !== token) return resolve();
        const t = Math.min(1, (now - t0) / ms);
        pose = at(t);
        render();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // Reduced motion: fade out, change, fade back in.
  async function fadeSwap(change, hold = 0) {
    const out = line.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
      easing: 'ease-out',
      fill: 'forwards',
    });
    await out.finished;
    if (hold) await wait(hold);
    change();
    render();
    const back = line.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      easing: 'ease-in',
    });
    out.cancel();
    await back.finished;
  }

  async function run(move) {
    token += 1;
    busy = true;
    const mine = token;
    try {
      await move(mine);
    } finally {
      if (mine === token) busy = false;
    }
  }

  const alive = (mine) => mine === token;

  function puff() {
    if (reduced) return;
    dust.animate([{ opacity: 0.9 }, { opacity: 0 }], {
      duration: 280,
      easing: 'ease-out',
    });
  }

  // Unravel, travel along the route and wind up again at `target`.
  async function goTo(target, m) {
    if (reduced) {
      await fadeSwap(() => {
        spot = { ...target };
        pose = { ...REST };
      });
      return;
    }
    await to(POSES.crouch, 160, 'out');
    if (!alive(m)) return;
    const { track, len } = travelTrack(spot, target, ground, pose);
    await slide(track, len, 0, track.total - len);
    if (!alive(m)) return;
    spot = { ...target };
    pose = { ...REST };
    render();
  }

  const peek = (up, turn = 1, extra = {}) =>
    peekPose(spot, hole, ground, up, turn, extra);

  // The head rises slowly out of the hole: ear tips, then the eyes, a wary
  // pause, the rest of the head and an ear flick. After the dive it also
  // looks one way and back. Then it ducks down out of sight again.
  async function peekOut(m, lookAround) {
    await play((t) => peek(PEEK_EYES * ease.glideOut(t)), PEEK_MS.eyes);
    if (!alive(m)) return;
    await wait(PEEK_MS.wary);
    if (!alive(m)) return;
    await play((t) => peek(lerp(PEEK_EYES, 1, ease.glide(t))), PEEK_MS.rise);
    if (!alive(m)) return;
    await to(peek(1, 1, { earF: 18 }), 60, 'out');
    if (!alive(m)) return;
    await to(peek(1, 1, { earF: 0 }), 80, 'inOut');
    if (!alive(m)) return;
    await to(peek(1), 60, 'out');
    if (!alive(m)) return;
    if (lookAround) {
      await to(peek(1, -1), 110, 'inOut');
      if (!alive(m)) return;
      await wait(150);
      if (!alive(m)) return;
      await to(peek(1), 110, 'inOut');
      if (!alive(m)) return;
    }
    await wait(lookAround ? 110 : 260);
    if (!alive(m)) return;
    await play((t) => peek(1 - ease.in(t)), PEEK_MS.duck);
    if (!alive(m)) return;
    pose = hidden();
    render();
  }

  // A tap. Reduced motion fades to the pose and back, like travel and dive.
  async function petMove(m) {
    if (reduced) {
      await fadeSwap(() => {
        pose = inHole ? peek(1) : { ...REST, ...POSES.perk };
      });
      await wait(1200);
      if (!alive(m)) return;
      await fadeSwap(() => {
        pose = inHole ? hidden() : { ...REST };
      });
      return;
    }
    if (inHole) {
      await peekOut(m, false);
      return;
    }
    await to(POSES.perk, 160, 'back');
    if (!alive(m)) return;
    await wait(900);
    if (alive(m)) await to({}, 380, 'inOut');
  }

  const otherSpot = () =>
    Math.abs(spots[0].x - spot.x) > Math.abs(spots[1].x - spot.x)
      ? spots[0]
      : spots[1];

  const moves = {
    // A quick flick of one ear, the way a real rabbit checks a sound.
    twitch: () =>
      run(async (m) => {
        const front = Math.random() < 0.65;
        const key = front ? 'earF' : 'earB';
        await to({ [key]: 11 }, 70, 'out', true);
        if (!alive(m)) return;
        await to({ [key]: -5 }, 90, 'inOut', true);
        if (!alive(m)) return;
        await to({ [key]: 3 }, 80, 'inOut', true);
        if (!alive(m)) return;
        await to({}, 120, 'out');
      }),

    // Impatient: lift the toe, slam it down, three times.
    thump: () =>
      run(async (m) => {
        if (reduced) {
          dust.style.opacity = '1';
          await wait(700);
          dust.style.opacity = '0';
          return;
        }
        await to({ sy: 0.97, earB: -6, earF: -4 }, 120, 'out');
        for (let i = 0; i < 3 && alive(m); i += 1) {
          await to({ foot: -26 }, 120, 'out', true);
          if (!alive(m)) return;
          await to({ foot: 2, sy: 0.95 }, 55, 'in', true);
          puff();
          await to({ foot: 0, sy: 0.97 }, 70, 'out', true);
          await wait(110);
        }
        if (alive(m)) await to({}, 220, 'inOut');
      }),

    // Hind foot up to the back ear, a few quick rakes, foot down, then the
    // ear flicks as if shaking off the itch.
    scratch: () =>
      run(async (m) => {
        if (reduced) {
          await to(POSES.scratch, 0);
          await wait(900);
          if (alive(m)) await to({}, 0);
          return;
        }
        await to(POSES.scratch, 280, 'out');
        for (let i = 0; i < 4 && alive(m); i += 1) {
          await to(SCRATCH_STROKE.up, 75, 'inOut', true);
          if (!alive(m)) return;
          await to(SCRATCH_STROKE.down, 75, 'inOut', true);
        }
        if (!alive(m)) return;
        await to({ earB: -8 }, 260, 'inOut');
        if (!alive(m)) return;
        await to({ earB: 16 }, 70, 'out', true);
        if (!alive(m)) return;
        await to({ earB: -6 }, 90, 'inOut', true);
        if (!alive(m)) return;
        await to({ earB: 3 }, 80, 'inOut', true);
        if (!alive(m)) return;
        await to({}, 120, 'out');
      }),

    perk: () =>
      run(async (m) => {
        await to(POSES.perk, 160, 'back');
        if (!alive(m)) return;
        await wait(reduced ? 1200 : 900);
        if (alive(m)) await to({}, 380, 'inOut');
      }),

    droop: () =>
      run(async (m) => {
        await to(POSES.droop, 520, 'inOut');
        if (!alive(m)) return;
        await wait(reduced ? 1200 : 1100);
        if (alive(m)) await to({}, 420, 'out');
      }),

    // Over to the far side of the hole and back again.
    travel: () =>
      run(async (m) => {
        const start = spot;
        await goTo(otherSpot(), m);
        if (!alive(m)) return;
        await wait(700);
        if (alive(m)) await goTo(start, m);
      }),

    // Solved: the line pours into the hole, the head slowly peeks out, looks
    // around and ducks. It stays down there; only climb brings it back.
    dive: () =>
      run(async (m) => {
        if (reduced) {
          await fadeSwap(() => {
            pose = hidden();
          }, 400);
          return;
        }
        await to(POSES.crouch, 130, 'out');
        if (!alive(m)) return;
        const { len, down } = diveTracks(spot, hole, ground, pose);
        await slide(down, len, 0, down.total - len, 0, 'snapIn', DIVE_MS.pour);
        if (!alive(m)) return;
        pose = hidden();
        await wait(150);
        if (!alive(m)) return;
        await peekOut(m, true);
      }),

    // Out of the hole again: the line climbs up and winds into the bunny.
    climb: () =>
      run(async (m) => {
        if (reduced) {
          await fadeSwap(() => {
            pose = { ...REST };
          });
          return;
        }
        const { len, up } = diveTracks(spot, hole, ground);
        await slide(up, len, 0, up.total - len, 0, 'snapOut', DIVE_MS.climb);
        if (!alive(m)) return;
        pose = { ...REST };
        render();
      }),
  };

  // Draw the line in, like a pen stroke.
  async function drawOn(ms = 1300) {
    if (reduced || inHole) return;
    const len = line.getTotalLength();
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    line.getBoundingClientRect();
    await line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: ms,
      easing: 'cubic-bezier(.45,.05,.3,1)',
    }).finished;
    line.style.strokeDasharray = '';
    line.style.strokeDashoffset = '';
  }

  // Idle life: an ear twitch every few seconds, now and then an ear scratch,
  // and a thump if nobody has touched anything for a while. None of it down
  // the hole.
  let idleTimer = 0;
  let lastAction = performance.now();
  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (reduced || options.idle === false) return;
    idleTimer = setTimeout(
      () => {
        if (!busy && !inHole) {
          const next = idleMove(performance.now() - lastAction, Math.random());
          if (next === 'thump') lastAction = performance.now();
          void moves[next]();
        }
        scheduleIdle();
      },
      2200 + Math.random() * 3800
    );
  }

  render();
  scheduleIdle();

  return {
    play(name) {
      lastAction = performance.now();
      const move = moves[name];
      if (!move || !movePlays(name, inHole)) return Promise.resolve();
      inHole = inHoleAfter(name, inHole);
      return move();
    },
    // Unravel and wind up again at stage x, facing the hole unless told.
    travel(x, facing) {
      lastAction = performance.now();
      if (inHole) return Promise.resolve();
      const target = { ...faceHole(x), ...(facing ? { facing } : {}) };
      return run((m) => goTo(target, m));
    },
    // A tap: perks up, or peeks out of the hole and ducks back. Resolves
    // false when the tap was ignored (mid-move or cooling down).
    async pet() {
      if (!canPet(performance.now(), petReadyAt, busy)) return false;
      lastAction = performance.now();
      await run(petMove);
      petReadyAt = performance.now() + PET_COOLDOWN_MS;
      return true;
    },
    // Put it down the hole at once, with no dive.
    hide() {
      if (inHole) return;
      token += 1;
      busy = false;
      inHole = true;
      pose = hidden();
      render();
    },
    inHole: () => inHole,
    drawOn,
    pathFor: bunnyPath,
    destroy() {
      token += 1;
      clearTimeout(idleTimer);
      svg.innerHTML = '';
    },
  };
}

export { SVG_NS };
