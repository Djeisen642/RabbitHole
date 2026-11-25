/**
 * Progress as a squiggly tunnel: one chamber per guess, dug out as guesses
 * are used, the winning one lit in orange.
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
  const w = 300;
  const pad = 14;
  const step = (w - pad * 2) / Math.max(1, max - 1);
  const xs = Array.from({ length: max }, (_, i) => pad + i * step);
  const y = (i: number): number => 17 + (i % 2 === 0 ? -4 : 4);
  const d = xs
    .map((x, i) =>
      i === 0
        ? `M${x} ${y(i)}`
        : `Q${x - step / 2} ${y(i - 1) + (i % 2 === 0 ? 10 : -10)} ${x} ${y(i)}`
    )
    .join(' ');
  const dugTo = Math.min(used, max) - 1;
  const dugD =
    dugTo > 0
      ? d
          .split(' Q')
          .slice(0, dugTo + 1)
          .join(' Q')
      : '';
  return (
    <svg
      className="rh-tunnel"
      viewBox={`0 0 ${w} 34`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${used} of ${max} guesses used`}
    >
      <path className="track" d={d} />
      {dugD ? <path className="dug" d={dugD} /> : null}
      {xs.map((x, i) => (
        <circle
          key={x}
          className={`slot${i === wonAt ? ' won' : i < used ? ' used' : ''}`}
          cx={x}
          cy={y(i)}
          r={i === wonAt ? 7 : 6}
        />
      ))}
    </svg>
  );
}
