import type { ClueView } from '../../shared/api';
import { CLUE_LABELS } from '../lib/clue-labels';
import { compact, grouped } from '../lib/format';

/**
 * One revealed clue, as a layer of the burrow. Closed, it is a single line
 * (the layer, what kind of clue, and the start of it); a tap opens it.
 */
export function Clue({
  clue,
  layer,
  open,
  fresh,
  onToggle,
}: {
  clue: ClueView;
  layer: number;
  open: boolean;
  fresh: boolean;
  onToggle: () => void;
}) {
  const bodyId = `rh-clue-${clue.kind}`;
  return (
    <section
      className={`rh-clue${open ? ' open' : ''}${fresh ? ' fresh' : ''}`}
    >
      <button
        type="button"
        className="rh-clue-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="rh-clue-label">
          {layer} · {CLUE_LABELS[clue.kind]}
        </span>
        {open ? null : <span className="rh-clue-peek">{preview(clue)}</span>}
        <svg className="rh-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {open ? (
        <div className="rh-clue-body" id={bodyId}>
          <ClueBody clue={clue} />
        </div>
      ) : null}
    </section>
  );
}

/** The one-line preview of a closed clue. */
function preview(clue: ClueView): string {
  switch (clue.kind) {
    case 'topComment':
      return clue.body;
    case 'about':
      return clue.text;
    case 'jargon':
      return clue.words.join(' · ');
    case 'topPost':
      return clue.title;
    case 'stats':
      return clue.createdYear === null
        ? `${compact(clue.subscribers)} members`
        : `${compact(clue.subscribers)} members · ${String(clue.createdYear)}`;
    case 'icon':
      return 'Tap to see it';
  }
}

function ClueBody({ clue }: { clue: ClueView }) {
  switch (clue.kind) {
    case 'topComment':
      return (
        <p className="quote">
          {clue.body}{' '}
          <span className="rh-muted" style={{ fontSize: 13 }}>
            ({compact(clue.score)} points)
          </span>
        </p>
      );
    case 'about':
      return <p className="quote">{clue.text}</p>;
    case 'jargon':
      return (
        <p className="rh-jargon">
          {clue.words.map((word, i) => (
            <span key={word} style={{ fontSize: 20 - Math.min(i, 6) * 1.2 }}>
              {word}
            </span>
          ))}
        </p>
      );
    case 'topPost':
      return (
        <p className="quote">
          {clue.title}{' '}
          <span className="rh-muted" style={{ fontSize: 13 }}>
            ({compact(clue.score)} points ·{' '}
            {String(new Date(clue.createdAt).getUTCFullYear())})
          </span>
        </p>
      );
    case 'stats':
      return (
        <div className="rh-stats">
          <p>
            <b>{grouped(clue.subscribers)}</b>
            <span className="rh-muted">members</span>
          </p>
          {clue.createdYear === null ? null : (
            <p>
              <b>{clue.createdYear}</b>
              <span className="rh-muted">founded</span>
            </p>
          )}
        </div>
      );
    case 'icon':
      return (
        <img className="rh-icon-clue" src={clue.url} alt="Community icon" />
      );
  }
}
