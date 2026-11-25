import type { ClueView } from '../../shared/api';
import { CLUE_LABELS } from '../lib/clue-labels';
import { compact, grouped } from '../lib/format';

/** One revealed clue, as a layer of the burrow. */
export function Clue({
  clue,
  layer,
  fresh,
  clearIcon = false,
}: {
  clue: ClueView;
  layer: number;
  fresh: boolean;
  clearIcon?: boolean;
}) {
  return (
    <section className={`rh-clue${fresh ? ' fresh' : ''}`}>
      <div className="rh-clue-label">
        Layer {layer}: {CLUE_LABELS[clue.kind]}
      </div>
      <ClueBody clue={clue} clearIcon={clearIcon} />
    </section>
  );
}

function ClueBody({ clue, clearIcon }: { clue: ClueView; clearIcon: boolean }) {
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
    case 'rule':
      return (
        <p>
          <strong>{clue.title}</strong>
          {clue.description ? (
            <>
              <br />
              <span className="rh-muted">{clue.description}</span>
            </>
          ) : null}
        </p>
      );
    case 'jargon':
      return (
        <p className="rh-jargon">
          {clue.words.map((word, i) => (
            <span key={word} style={{ fontSize: 22 - Math.min(i, 6) * 1.5 }}>
              {word}
            </span>
          ))}
        </p>
      );
    case 'stats':
      return (
        <div className="rh-stats">
          <p>
            <b>{grouped(clue.subscribers)}</b>
            <span className="rh-muted">members</span>
          </p>
          <p>
            <b>{clue.createdYear}</b>
            <span className="rh-muted">founded</span>
          </p>
        </div>
      );
    case 'icon':
      return (
        <img
          className={`rh-icon-clue${clearIcon ? ' clear' : ''}`}
          src={clue.url}
          alt={clearIcon ? 'Community icon' : 'Community icon, blurred'}
        />
      );
  }
}
