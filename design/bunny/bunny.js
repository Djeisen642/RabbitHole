// r/abbitHole mascot: one continuous line, posed by a handful of numbers.
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
const NECK = [6, -66];
const FOOT_PIVOT = [-29, -1];
const EAR_BACK = { pivot: [2, -100], rest: -14, w: 13, len: 45 };
const EAR_FRONT = { pivot: [19, -103], rest: 4, w: 15, len: 50 };

// A leaf-shaped ear in its own frame, base at the origin, pointing up.
// Returns [start, ...cubic points] so it can be spliced into the line.
function earPoints(w, len, tag) {
  const h = w / 2;
  return {
    start: [-h, 0, tag],
    curves: [
      [-w * 0.95, -len * 0.42, tag],
      [-w * 0.6, -len * 0.93, tag],
      [w * 0.05, -len, tag],
      [w * 0.55, -len * 0.96, tag],
      [w * 0.9, -len * 0.44, tag],
      [h, 0, tag],
    ],
  };
}

// The drawing, in pen order. 'b' body, 'h' head, 'eb'/'ef' ears (in ear
// frame), 'f' hind foot. Each C entry is three points.
function buildSpec() {
  const eb = earPoints(EAR_BACK.w, EAR_BACK.len, 'eb');
  const ef = earPoints(EAR_FRONT.w, EAR_FRONT.len, 'ef');
  return [
    // Tail: a small curl, then up the back to the nape.
    ['M', [-49, -31, 'b']],
    ['C', [-61, -29, 'b'], [-64, -43, 'b'], [-55, -45, 'b']],
    ['C', [-47, -47, 'b'], [-44, -37, 'b'], [-50, -35, 'b']],
    ['C', [-62, -64, 'b'], [-34, -90, 'h'], [-6, -90, 'h']],
    // Back of the head up to the back ear.
    ['C', [-4, -94, 'h'], [-3, -98, 'h'], eb.start],
    ['C', eb.curves[0], eb.curves[1], eb.curves[2]],
    ['C', eb.curves[3], eb.curves[4], eb.curves[5]],
    // Dip between the ears, then the front ear.
    ['C', [9, -97, 'h'], [10, -101, 'h'], ef.start],
    ['C', ef.curves[0], ef.curves[1], ef.curves[2]],
    ['C', ef.curves[3], ef.curves[4], ef.curves[5]],
    // Into the face: the eye is a little loop in the line, then out to the
    // brow and down to the nose.
    ['C', [30, -96, 'h'], [36, -93, 'h'], [36, -88, 'h']],
    ['C', [36, -83, 'h'], [30, -83, 'h'], [30.5, -87.5, 'h']],
    ['C', [31, -92, 'h'], [39, -93, 'h'], [44, -91, 'h']],
    ['C', [51, -88, 'h'], [56, -81, 'h'], [55, -75, 'h']],
    // Nose bump, mouth, chin.
    ['C', [58.5, -74, 'h'], [58.5, -69, 'h'], [54, -69.5, 'h']],
    ['C', [50, -64, 'h'], [43, -62, 'h'], [37, -64, 'h']],
    // Chest down the front leg to the paw.
    ['C', [41, -50, 'b'], [36, -34, 'b'], [36, -20, 'b']],
    ['C', [36, -11, 'b'], [39, -6, 'b'], [45, -5, 'b']],
    ['C', [52, -4, 'b'], [53, 0, 'b'], [46, 0, 'b']],
    ['C', [40, 0, 'b'], [34, 0, 'b'], [30, -1, 'b']],
    // Belly back into the big haunch, round to the heel.
    ['C', [27, -9, 'b'], [25, -14, 'b'], [21, -17, 'b']],
    ['C', [12, -42, 'b'], [-25, -50, 'b'], [-34, -29, 'b']],
    ['C', [-39, -17, 'b'], [-35, -8, 'f'], [-26, -7, 'f']],
    // Long hind foot: along the top to the toe, back along the sole.
    ['C', [-12, -8, 'f'], [4, -7, 'f'], [14, -4, 'f']],
    ['C', [21, -3, 'f'], [21, 0, 'f'], [14, 0, 'f']],
    ['C', [0, 0.5, 'f'], [-18, 0.5, 'f'], [-30, 0, 'f']],
    // Round the heel and trail back up toward the tail.
    ['C', [-37, -1, 'f'], [-38, -6, 'b'], [-41, -11, 'b']],
    ['C', [-44, -17, 'b'], [-46, -26, 'b'], [-49.5, -32, 'b']],
  ];
}

const SPEC = buildSpec();

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
    earB: 12,
    earF: 8,
    earLen: 1.07,
    headDy: -5,
    headRot: -4,
    sy: 1.04,
    sx: 0.98,
  },
  droop: {
    earB: -90,
    earF: -102,
    earLen: 0.94,
    headDy: 6,
    headRot: 12,
    sy: 0.95,
    sx: 1.03,
  },
  crouch: { sy: 0.86, sx: 1.07, earB: -28, earF: -30, headDy: 3 },
};

// Keyframes for the dive, given the distance from home to the hole.
// rot 100 points the nose straight down; ears lie back so they trail up.
export function diveFrames(dx) {
  return {
    crouch: POSES.crouch,
    hop: {
      x: dx * 0.38,
      y: -30,
      rot: 34,
      sx: 1.04,
      sy: 0.92,
      earB: -70,
      earF: -80,
      headRot: -4,
    },
    fall: {
      x: dx + 4,
      y: 30,
      rot: 100,
      sx: 1.06,
      sy: 0.72,
      earB: -92,
      earF: -104,
      headRot: 6,
    },
    gone: {
      x: dx + 4,
      y: 150,
      rot: 100,
      sx: 1.06,
      sy: 0.7,
      earB: -92,
      earF: -104,
      headRot: 6,
    },
    peek: { x: dx - 22, y: 90, earB: -6, earF: 6, headRot: -4 },
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
  const hole = { cx: options.holeX ?? 190, cy: ground + 1, rx: 36, ry: 9 };
  const reduced =
    options.reducedMotion ??
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const id = `rh${Math.random().toString(36).slice(2, 7)}`;
  svg.innerHTML = `
    <defs>
      <clipPath id="${id}-clip">
        <rect x="-400" y="-400" width="1200" height="${400 + ground + 2}"></rect>
        <ellipse cx="${hole.cx}" cy="${hole.cy}" rx="${hole.rx - 3}" ry="${hole.ry - 1}"></ellipse>
      </clipPath>
    </defs>
    <path class="rh-ground" d="M14 ${ground} C40 ${ground - 1.5} 70 ${ground + 1.2} 104 ${ground}
      S140 ${ground - 1} ${hole.cx - hole.rx - 6} ${ground}
      M${hole.cx + hole.rx + 5} ${ground} C${hole.cx + 52} ${ground - 1} ${hole.cx + 62} ${ground + 1} 252 ${ground}"></path>
    <path class="rh-mound" d="M${hole.cx - hole.rx - 4} ${ground}
      C${hole.cx - 28} ${ground - 15} ${hole.cx + 26} ${ground - 17} ${hole.cx + hole.rx + 4} ${ground}"></path>
    <ellipse class="rh-hole" cx="${hole.cx}" cy="${hole.cy}" rx="${hole.rx}" ry="${hole.ry}"></ellipse>
    <g class="rh-dust" opacity="0">
      <path d="M-44 -6 l-9 -4 M-46 -14 l-8 -9 M-38 -18 l-2 -10"></path>
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
          await to({ foot: -16 }, 120, 'out', true);
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
        await to(f.hop, 280, 'out');
        if (!alive(m)) return;
        await to(f.fall, 240, 'in');
        if (!alive(m)) return;
        await to(f.gone, 200, 'in');
        if (!alive(m)) return;
        await wait(450);
        // Peek: the head comes back up just far enough to look around.
        await to({ ...f.peek, y: 150 }, 0);
        await to(f.peek, 300, 'back');
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
