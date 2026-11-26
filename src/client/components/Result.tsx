import { useState } from 'react';
import type { RoundResult } from '../../shared/api';
import { copyText } from '../lib/clipboard';
import { onReddit, toast, visit } from '../lib/platform';

/** End of round: the answer, the score and what others guessed. */
export function Result({
  result,
  solved,
  clueCount,
}: {
  result: RoundResult;
  solved: boolean;
  clueCount: number;
}) {
  const headline = solved
    ? result.score === 0
      ? 'Straight down the hole, no clues needed.'
      : `Found it with ${result.score ?? 0} of ${clueCount} clues.`
    : 'Out of guesses. This one stayed buried.';

  return (
    <section className="rh-result" aria-live="polite">
      <div>
        <h2>
          <span className="rh-sr-only">It was </span>
          <b>r/</b>
          {result.answer}
        </h2>
        <p className="rh-result-line">{headline}</p>
      </div>

      <div className="rh-chart">
        <h3 className="rh-section-title">What others guessed</h3>
        {result.wrongGuesses.length === 0 ? (
          <p className="rh-muted" style={{ margin: 0, fontSize: 14 }}>
            No wrong guesses yet today.
          </p>
        ) : (
          result.wrongGuesses.map((bar) => (
            <div className="rh-bar" key={bar.name}>
              <span className="name">r/{bar.name}</span>
              <span className="rh-muted">{bar.percent}%</span>
              <span className="fill" aria-hidden="true">
                <span style={{ width: `${Math.max(3, bar.percent)}%` }} />
              </span>
            </div>
          ))
        )}
        <p className="rh-muted" style={{ margin: 0, fontSize: 13 }}>
          {result.players} {result.players === 1 ? 'player' : 'players'} today
        </p>
      </div>
    </section>
  );
}

/**
 * The end-of-round buttons, docked at the bottom like the guess box. The
 * share text only appears when copying fails, so it can be selected by hand.
 */
export function ResultActions({ result }: { result: RoundResult }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyResult(): Promise<void> {
    if (await copyText(result.shareText)) {
      setCopy('copied');
      toast('Copied. Paste it in the comments.');
    } else {
      setCopy('failed');
      toast('Couldn’t copy. Select the text to copy it.');
    }
  }

  return (
    <div className="rh-result-actions">
      {copy === 'failed' ? (
        <textarea
          className="rh-share"
          readOnly
          rows={4}
          value={result.shareText}
          aria-label="Your result, without spoilers"
          onFocus={(e) => {
            e.target.select();
          }}
        />
      ) : null}
      {onReddit ? (
        <button
          type="button"
          className="rh-button"
          onClick={() => {
            visit(result.visitUrl);
          }}
        >
          <span className="rh-ellipsis">Visit r/{result.answer}</span>
        </button>
      ) : (
        <a
          className="rh-button"
          href={result.visitUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="rh-ellipsis">Visit r/{result.answer}</span>
        </a>
      )}
      <button
        type="button"
        className="rh-button quiet"
        onClick={() => {
          void copyResult();
        }}
      >
        {copy === 'copied'
          ? 'Copied'
          : copy === 'failed'
            ? 'Couldn’t copy'
            : 'Copy result'}
      </button>
    </div>
  );
}
