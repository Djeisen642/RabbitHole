import { bunnyPath, createBunny, POSES } from './bunny.js';

const stage = document.getElementById('stage');
const reducedToggle = document.getElementById('reduced');
const systemReduced = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

reducedToggle.checked = systemReduced;

let bunny = null;

function mount() {
  if (bunny) bunny.destroy();
  bunny = createBunny(stage, { reducedMotion: reducedToggle.checked });
  void bunny.drawOn();
}

mount();
reducedToggle.addEventListener('change', mount);

for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('click', () => {
    void bunny.play(button.dataset.move);
  });
}

document.getElementById('redraw').addEventListener('click', () => {
  void bunny.drawOn();
});

// Still frames of the key poses, drawn from the same path builder.
const stills = {
  rest: {},
  perk: POSES.perk,
  droop: POSES.droop,
  thump: { foot: -26, sy: 0.97, earB: -6, earF: -4 },
};
for (const [name, pose] of Object.entries(stills)) {
  const svg = document.querySelector(`[data-still="${name}"]`);
  if (!svg) continue;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'rh-bunny');
  path.setAttribute('d', bunnyPath(pose));
  path.setAttribute(
    'transform',
    `translate(70 172) scale(${pose.sx ?? 1} ${pose.sy ?? 1})`
  );
  svg.append(path);
}
