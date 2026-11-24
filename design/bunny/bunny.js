// r/abbitHole mascot: one continuous line (plus a dot for the eye), posed by
// a handful of numbers.
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
const NECK = [16, -80];
// The hind foot hinges where it comes out from under the haunch, so a thump
// lifts the toe clear of the thigh.
const FOOT_PIVOT = [2, -1];
// Ears lie swept back along the head; the far ear sits lower, behind the
// near one.
const EAR_BACK = { pivot: [15, -109], rest: -58, w: 15, len: 46 };
const EAR_FRONT = { pivot: [25, -113], rest: -44, w: 17, len: 54 };

// The head is drawn a little small below and scaled up from the chin, which
// keeps the face big and round without redrawing every point.
const HEAD_SCALE = 1.14;
const CHIN = [36, -76];
const big = ([x, y]) => [
  CHIN[0] + (x - CHIN[0]) * HEAD_SCALE,
  CHIN[1] + (y - CHIN[1]) * HEAD_SCALE,
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
// frame), 'f' hind foot. Each C entry is three points. An upright, sitting
// bunny: big round head, ears swept back, a dipped nape, thin front legs and
// a big round haunch with a puff of tail behind it.
function buildSpec() {
  const eb = earPoints(EAR_BACK.w, EAR_BACK.len, 'eb');
  const ef = earPoints(EAR_FRONT.w, EAR_FRONT.len, 'ef');
  return [
    // Start at the crease where the belly meets the thigh and run down the
    // round front of the haunch onto the hind foot.
    ['M', [2, -39, 'b']],
    ['C', [6.5, -33, 'b'], [9.5, -25, 'b'], [8.5, -18, 'b']],
    ['C', [8, -14, 'b'], [6, -11.5, 'b'], [4, -9.5, 'b']],
    // A long hind foot flat on the ground: top, round toe, sole. Only the
    // part in front of the haunch lifts for a thump.
    ['C', [9, -9.8, 'f'], [14, -9.3, 'f'], [18, -7, 'f']],
    ['C', [23.5, -4.5, 'f'], [23, 0.5, 'f'], [16, 0.5, 'f']],
    ['C', [11, 0.6, 'f'], [5, 0.7, 'f'], [0, 0.7, 'f']],
    ['C', [-12, 0.7, 'b'], [-26, 0.6, 'b'], [-36, 0.3, 'b']],
    // Round the heel and up the full back of the haunch to the tail.
    ['C', [-45, 0, 'b'], [-52, -6, 'b'], [-53, -15, 'b']],
    ['C', [-53.5, -21, 'b'], [-52, -26, 'b'], [-50, -30, 'b']],
    // Tail: a round puff on the rump.
    ['C', [-60, -28, 'b'], [-66, -38, 'b'], [-61, -45, 'b']],
    ['C', [-58, -50, 'b'], [-51, -50, 'b'], [-49, -45, 'b']],
    // The rump rolls up into one smooth slope to the nape.
    ['C', [-50, -59, 'b'], [-36, -73, 'b'], [-12, -79, 'b']],
    ['C', [-4, -81, 'h'], [2, -82, 'h'], [6, -86, 'h']],
    // The back of the big round head, up to the far ear.
    ['C', [3, -92, 'h'], [5, -101, 'h'], eb.start],
    ['C', eb.curves[0], eb.curves[1], eb.curves[2]],
    ['C', eb.curves[3], eb.curves[4], eb.curves[5]],
    // Across the crown to the near ear.
    ['C', [17, -110, 'h'], [18, -111, 'h'], ef.start],
    ['C', ef.curves[0], ef.curves[1], ef.curves[2]],
    ['C', ef.curves[3], ef.curves[4], ef.curves[5]],
    // A full forehead down to the nose.
    ['C', [44, -117, 'h'], [55, -105, 'h'], [55, -93, 'h']],
    // Nose bump, a small smile, a round cheek and chin.
    ['C', [58.5, -92, 'h'], [58.5, -86.5, 'h'], [54.5, -86.5, 'h']],
    ['C', [53.5, -82.5, 'h'], [49.5, -81.5, 'h'], [47, -83.5, 'h']],
    ['C', [46, -77, 'h'], [41, -72.5, 'h'], [34, -73, 'h']],
    // A full chest down a sturdy front leg to the paw.
    ['C', [47, -66, 'b'], [49, -52, 'b'], [46, -40, 'b']],
    ['C', [44, -28, 'b'], [43, -14, 'b'], [45, -6, 'b']],
    ['C', [47, -2, 'b'], [54, -3.5, 'b'], [54, -0.5, 'b']],
    ['C', [54, 1.5, 'b'], [48, 1, 'b'], [41, 0.5, 'b']],
    ['C', [32, 0, 'b'], [27, -2, 'b'], [27, -7, 'b']],
    ['C', [27, -14, 'b'], [26, -19, 'b'], [24, -25, 'b']],
    // A short belly into the crease, then the domed top of the thigh arcs
    // back over the haunch and into the rump at the tail.
    ['C', [18, -32, 'b'], [9, -39, 'b'], [2, -39, 'b']],
    ['C', [-2, -48, 'b'], [-11, -56, 'b'], [-23, -56, 'b']],
    ['C', [-35, -56, 'b'], [-43, -51, 'b'], [-49, -45, 'b']],
    // The one pen lift: a big round eye.
    ['M', [43, -97, 'h']],
    ['C', [43, -94.2, 'h'], [38.6, -94.2, 'h'], [38.6, -97, 'h']],
    ['C', [38.6, -99.8, 'h'], [43, -99.8, 'h'], [43, -97, 'h']],
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
  if (tag === 'f') return rotate([x, y], FOOT_PIVOT, pose.foot);
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

export function bunnyPath(pose = REST) {
  const p = { ...REST, ...pose };
  return SPEC.map(([cmd, ...pts]) => {
    const coords = pts.map((pt) => place(pt, p).map(fmt).join(' '));
    return `${cmd}${coords.join(' ')}`;
  }).join(' ');
}

// The rotation pivot for the whole body sits around its middle.
const BODY_CENTRE = [0, -48];

export function bunnyTransform(pose, origin) {
  const p = { ...REST, ...pose };
  const [ox, oy] = origin;
  return (
    `translate(${fmt(ox + p.x)} ${fmt(oy + p.y)}) ` +
    `rotate(${fmt(p.rot)} ${BODY_CENTRE[0]} ${BODY_CENTRE[1]}) ` +
    `scale(${p.sx} ${p.sy})`
  );
}

// ---------------------------------------------------------------------------
// Poses and moves

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
};

// Keyframes for the dive, given the distance from home to the hole centre.
// The bunny turns nose-down while it is still in the air above the hole and
// squeezes narrower than the opening, then drops straight in, so nothing
// crosses the rim on the way down. rot 90 is nose straight down; the ears lie
// back so they trail upward.
export function diveFrames(dx) {
  const over = dx + 17; // centres the nose-down bunny on the hole
  return {
    crouch: POSES.crouch,
    rise: {
      x: dx * 0.62,
      y: -40,
      rot: 40,
      sx: 1.04,
      sy: 0.82,
      earB: -30,
      earF: -40,
    },
    over: {
      x: over,
      y: -52,
      rot: 90,
      sx: 1.12,
      sy: 0.46,
      earB: -38,
      earF: -48,
      headRot: 6,
    },
    gone: {
      x: over,
      y: 170,
      rot: 90,
      sx: 1.12,
      sy: 0.46,
      earB: -38,
      earF: -48,
      headRot: 6,
    },
    peek: { x: dx - 26, y: 86, earB: 46, earF: 40, headRot: -4 },
  };
}

const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => {
    const c = 1.7;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
};

const lerp = (a, b, t) => a + (b - a) * t;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Builds the drawing inside an <svg> and returns controls for it.
export function createBunny(svg, options = {}) {
  const ground = options.ground ?? 170;
  const home = [options.homeX ?? 78, ground];
  const hole = { cx: options.holeX ?? 190, cy: ground + 1, rx: 40, ry: 10 };
  const reduced =
    options.reducedMotion ??
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const id = `rh${Math.random().toString(36).slice(2, 7)}`;
  svg.innerHTML = `
    <defs>
      <clipPath id="${id}-clip">
        <rect x="-400" y="-400" width="1200" height="${400 + ground + 2}"></rect>
        <ellipse cx="${hole.cx}" cy="${hole.cy}" rx="${hole.rx - 1}" ry="${hole.ry - 0.5}"></ellipse>
      </clipPath>
    </defs>
    <path class="rh-ground" d="M14 ${ground} C40 ${ground - 1.5} 70 ${ground + 1.2} 104 ${ground}
      S140 ${ground - 1} ${hole.cx - hole.rx - 6} ${ground}
      M${hole.cx + hole.rx + 5} ${ground} C${hole.cx + 52} ${ground - 1} ${hole.cx + 62} ${ground + 1} 252 ${ground}"></path>
    <path class="rh-mound" d="M${hole.cx - hole.rx - 4} ${ground}
      C${hole.cx - 28} ${ground - 15} ${hole.cx + 26} ${ground - 17} ${hole.cx + hole.rx + 4} ${ground}"></path>
    <ellipse class="rh-hole" cx="${hole.cx}" cy="${hole.cy}" rx="${hole.rx}" ry="${hole.ry}"></ellipse>
    <g class="rh-dust" opacity="0">
      <path d="M-58 -3 l-9 -1.5 M-58 -10 l-8 -5 M-55 -17 l-5 -6"></path>
    </g>
    <g clip-path="url(#${id}-clip)">
      <path class="rh-bunny"></path>
    </g>`;

  const line = svg.querySelector('.rh-bunny');
  const dust = svg.querySelector('.rh-dust');
  let pose = { ...REST };
  let busy = false;
  let token = 0; // bumps to cancel a running move

  function render() {
    line.setAttribute('d', bunnyPath(pose));
    line.setAttribute('transform', bunnyTransform(pose, home));
    line.style.opacity = String(pose.opacity);
    dust.setAttribute(
      'transform',
      `translate(${home[0] + pose.x} ${home[1] + pose.y})`
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

  const moves = {
    // A quick flick of one ear, the way a real rabbit checks a sound.
    twitch: () =>
      run(async (m) => {
        const front = Math.random() < 0.65;
        const key = front ? 'earF' : 'earB';
        const base = 0;
        await to({ [key]: base + 11 }, 70, 'out', true);
        if (!alive(m)) return;
        await to({ [key]: base - 5 }, 90, 'inOut', true);
        if (!alive(m)) return;
        await to({ [key]: base + 3 }, 80, 'inOut', true);
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

    // Solved: crouch, hop into the hole, peek out, then come back.
    dive: () =>
      run(async (m) => {
        const dx = hole.cx - home[0];
        if (reduced) {
          await to({ opacity: 0 }, 0);
          await wait(1200);
          await to({}, 0);
          return;
        }
        const f = diveFrames(dx);
        await to(f.crouch, 200, 'out');
        if (!alive(m)) return;
        await to(f.rise, 230, 'out');
        if (!alive(m)) return;
        await to(f.over, 190, 'inOut');
        if (!alive(m)) return;
        await to(f.gone, 300, 'in');
        if (!alive(m)) return;
        await wait(450);
        // Peek: the head comes back up just far enough to look around.
        await to({ ...f.peek, y: 150 }, 0);
        await to(f.peek, 320, 'out');
        if (!alive(m)) return;
        await wait(200);
        await to({ ...f.peek, earF: 18 }, 80, 'out');
        await to({ ...f.peek, earF: -3 }, 110, 'inOut');
        await to(f.peek, 120, 'out');
        await wait(450);
        if (!alive(m)) return;
        await to({ ...f.peek, y: 150, earB: -40, earF: -40 }, 200, 'in');
        if (!alive(m)) return;
        await wait(350);
        pose = { ...REST };
        render();
        await drawOn(900);
      }),
  };

  // Draw the line in, like a pen stroke.
  async function drawOn(ms = 1300) {
    if (reduced) return;
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

  // Idle life: an ear twitch every few seconds; a thump if nobody has
  // touched anything for a while.
  let idleTimer = 0;
  let lastAction = performance.now();
  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (reduced || options.idle === false) return;
    idleTimer = setTimeout(
      () => {
        if (!busy) {
          const quiet = performance.now() - lastAction > 15000;
          if (quiet) {
            lastAction = performance.now();
            void moves.thump();
          } else {
            void moves.twitch();
          }
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
      return move ? move() : Promise.resolve();
    },
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
