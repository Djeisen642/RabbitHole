/**
 * Guesses as pips along a small squiggly tunnel: one chamber per guess, dug
 * out (filled) as guesses are used, the winning one lit in orange. Small
 * enough to sit in the header next to the bunny.
 */
export function Tunnel({
  max,
  used,
  wonAt,
}: {
  max: number;
  used: number;
  wonAt: number | null;
}) {
  const step = 20;
  const pad = 7;
  const w = pad * 2 + step * Math.max(0, max - 1);
  const xs = Array.from({ length: max }, (_, i) => pad + i * step);
  const y = (i: number): number => 10 + (i % 2 === 0 ? -2.5 : 2.5);
  const d = xs
    .map((x, i) =>
      i === 0
        ? `M${x} ${y(i)}`
        : `Q${x - step / 2} ${y(i - 1) + (i % 2 === 0 ? 6 : -6)} ${x} ${y(i)}`
    )
    .join(' ');
  const left = Math.max(0, max - used);
  return (
    <svg
      className="rh-tunnel"
      viewBox={`0 0 ${w} 20`}
      width={w}
      height={20}
      role="img"
      aria-label={
        wonAt !== null
          ? `Solved on guess ${wonAt + 1} of ${max}`
          : `${left} of ${max} guesses left`
      }
    >
      <path className="track" d={d} />
      {xs.map((x, i) => (
        <circle
          key={x}
          className={`slot${i === wonAt ? ' won' : i < used ? ' used' : ''}`}
          cx={x}
          cy={y(i)}
          r={i === wonAt ? 6 : 5}
        />
      ))}
    </svg>
  );
}
