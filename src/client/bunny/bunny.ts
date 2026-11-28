// r/abbit_hole mascot: builds the drawing in an <svg> and plays its moves.
// The parts it is made from:
// - shape.ts: the one-line drawing, a pose's numbers and the path for them
// - poses.ts: the named poses, and peeking out of the hole
// - thread.ts: unravelling into a loose line to travel or dive
// - moves.ts: move names, timings, easing and the idle and petting rules
// See design/bunny/README.md for how it works.
import { lerp, REST, POSE_KEYS, bunnyPath, bunnyTransform } from './shape';
import type { Pose } from './shape';
import { POSES, SCRATCH_STROKE, peekPose, PEEK_EYES } from './poses';
import {
  travelTrack,
  diveTracks,
  threadPath,
  slideMs,
  threadPoints,
} from './thread';
import type { Track, Spot, Hole } from './thread';
import {
  PET_COOLDOWN_MS,
  DIVE_MS,
  PEEK_MS,
  ease,
  idleMove,
  canPet,
  movePlays,
  inHoleAfter,
} from './moves';
import type { EaseName, MoveName } from './moves';

export type BunnyOptions = {
  /** y of the ground line. */
  ground?: number;
  /** Width of the stage. */
  width?: number;
  /** The two places it sits, either side of the hole. */
  homeX?: number;
  awayX?: number;
  holeX?: number;
  reducedMotion?: boolean;
  /** Idle twitches, scratches and thumps; on unless false. */
  idle?: boolean;
  /** Start already down the hole (a round that was solved earlier). */
  inHole?: boolean;
};

export type BunnyControls = {
  play(name: MoveName): Promise<void>;
  /** Unravel and wind up again at stage x, facing the hole unless told. */
  travel(x: number, facing?: number): Promise<void>;
  /** A tap: perks up, or peeks out of the hole and ducks back. Resolves
   * false when the tap was ignored (mid-move or cooling down). */
  pet(): Promise<boolean>;
  /** Put it down the hole at once, with no dive. */
  hide(): void;
  inHole(): boolean;
  drawOn(ms?: number): Promise<void>;
  destroy(): void;
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Builds the drawing inside an <svg> and returns controls for it. */
export function createBunny(
  svg: SVGSVGElement,
  options: BunnyOptions = {}
): BunnyControls {
  const ground = options.ground ?? 170;
  const width = options.width ?? 264;
  const hole: Hole = {
    cx: options.holeX ?? 190,
    cy: ground + 1,
    rx: 40,
    ry: 10,
  };
  const faceHole = (x: number): Spot => ({ x, facing: x > hole.cx ? -1 : 1 });
  const home = faceHole(options.homeX ?? 78);
  const away = faceHole(options.awayX ?? width - 78);
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

  const line = svg.querySelector<SVGPathElement>('.rh-bunny');
  const dust = svg.querySelector<SVGGElement>('.rh-dust');
  if (!line || !dust) throw new Error('bunny: drawing failed');
  let spot: Spot = { ...home };
  let inHole = options.inHole === true;
  // Down the hole the line is posed below ground, where the clip hides it.
  const hidden = (): Pose => peekPose(spot, hole, ground, 0);
  let pose: Pose = inHole ? hidden() : { ...REST };
  let petReadyAt = 0;
  let busy = false;
  let token = 0; // bumps to cancel a running move
  let destroyed = false;

  function render(): void {
    if (!line || !dust) return;
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
  function to(
    target: Partial<Pose>,
    ms: number,
    curve: EaseName = 'inOut',
    keep = false
  ): Promise<void> {
    const from: Pose = { ...pose };
    const goal: Pose = keep ? { ...pose, ...target } : { ...REST, ...target };
    const mine = token;
    if (reduced || ms <= 0) {
      pose = goal;
      render();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now: number): void => {
        if (mine !== token) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / ms);
        const k = ease[curve](t);
        const next: Pose = { ...pose };
        for (const key of POSE_KEYS) next[key] = lerp(from[key], goal[key], k);
        pose = next;
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
  function slide(
    track: Track,
    len: number,
    d0: number,
    d1: number,
    curve: EaseName,
    time?: number
  ): Promise<void> {
    const mine = token;
    const n = threadPoints(len);
    const ms = time ?? slideMs(Math.abs(d1 - d0));
    line?.removeAttribute('transform');
    if (line) line.style.opacity = '1';
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now: number): void => {
        if (mine !== token) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / ms);
        line?.setAttribute(
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
  function play(poseAt: (t: number) => Pose, ms: number): Promise<void> {
    const mine = token;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now: number): void => {
        if (mine !== token) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / ms);
        pose = poseAt(t);
        render();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // Reduced motion: fade out, change, fade back in.
  async function fadeSwap(change: () => void, hold = 0): Promise<void> {
    if (!line) return;
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

  async function run(move: (mine: number) => Promise<void>): Promise<void> {
    if (destroyed) return;
    token += 1;
    busy = true;
    const mine = token;
    try {
      await move(mine);
    } finally {
      if (mine === token) busy = false;
    }
  }

  const alive = (mine: number): boolean => mine === token && !destroyed;

  function puff(): void {
    if (reduced || !dust) return;
    dust.animate([{ opacity: 0.9 }, { opacity: 0 }], {
      duration: 280,
      easing: 'ease-out',
    });
  }

  // Unravel, travel along the route and wind up again at `target`.
  async function goTo(target: Spot, m: number): Promise<void> {
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
    await slide(track, len, 0, track.total - len, 'glide');
    if (!alive(m)) return;
    spot = { ...target };
    pose = { ...REST };
    render();
  }

  const peek = (rise: number, turn = 1, extra: Partial<Pose> = {}): Pose =>
    peekPose(spot, hole, ground, rise, turn, extra);

  // The head rises slowly out of the hole: ear tips, then the eyes, a wary
  // pause, the rest of the head and an ear flick. After the dive it also
  // looks one way and back. Then it ducks down out of sight again.
  async function peekOut(m: number, lookAround: boolean): Promise<void> {
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
  async function petMove(m: number): Promise<void> {
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

  const otherSpot = (): Spot =>
    Math.abs(home.x - spot.x) > Math.abs(away.x - spot.x) ? home : away;

  const moves: Record<MoveName, () => Promise<void>> = {
    // A quick flick of one ear, the way a real rabbit checks a sound.
    twitch: () =>
      run(async (m) => {
        const key = Math.random() < 0.65 ? 'earF' : 'earB';
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
        await slide(down, len, 0, down.total - len, 'snapIn', DIVE_MS.pour);
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
        await slide(up, len, 0, up.total - len, 'snapOut', DIVE_MS.climb);
        if (!alive(m)) return;
        pose = { ...REST };
        render();
      }),
  };

  // Draw the line in, like a pen stroke.
  async function drawOn(ms = 1300): Promise<void> {
    if (reduced || inHole || !line) return;
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
  function scheduleIdle(): void {
    window.clearTimeout(idleTimer);
    if (reduced || options.idle === false || destroyed) return;
    idleTimer = window.setTimeout(
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
      if (!movePlays(name, inHole)) return Promise.resolve();
      inHole = inHoleAfter(name, inHole);
      return moves[name]();
    },
    travel(x, facing) {
      lastAction = performance.now();
      if (inHole) return Promise.resolve();
      const target: Spot = facing ? { x, facing } : faceHole(x);
      return run((m) => goTo(target, m));
    },
    async pet() {
      if (destroyed || !canPet(performance.now(), petReadyAt, busy))
        return false;
      lastAction = performance.now();
      await run(petMove);
      petReadyAt = performance.now() + PET_COOLDOWN_MS;
      return true;
    },
    hide() {
      if (inHole || destroyed) return;
      token += 1;
      busy = false;
      inHole = true;
      pose = hidden();
      render();
    },
    inHole: () => inHole,
    drawOn,
    destroy() {
      destroyed = true;
      token += 1;
      window.clearTimeout(idleTimer);
      svg.innerHTML = '';
    },
  };
}
