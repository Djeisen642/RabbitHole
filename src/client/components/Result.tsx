import { useState } from 'react';
import type { RoundResult } from '../../shared/api';
import { onReddit, toast, visit } from '../lib/platform';

/** End of round: the answer, the score, what others guessed, sharing. */
export function Result({
  result,
  solved,
  clueCount,
}: {
  result: RoundResult;
  solved: boolean;
  clueCount: number;
}) {
  const [copied, setCopied] = useState(false);
  const headline = solved
    ? result.score === 0
      ? 'Straight down the hole, no clues needed.'
      : `Found it with ${result.score ?? 0} of ${clueCount} clues.`
    : 'This one stayed buried.';

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(result.shareText);
      setCopied(true);
      toast('Copied. Paste it in the comments!');
    } catch {
      setCopied(false);
      toast('Select the text to copy it.');
    }
  }

  return (
    <section className="rh-result" aria-live="polite">
      <div>
        <p className="rh-muted" style={{ margin: 0 }}>
          {solved ? 'You dug it up!' : 'Out of guesses.'} It was
        </p>
        <h2>
          <b>r/</b>
          {result.answer}
        </h2>
        <p style={{ margin: '4px 0 0' }}>{headline}</p>
      </div>

      <div className="rh-result-actions">
        {onReddit ? (
          <button
            type="button"
            className="rh-button"
            onClick={() => {
              visit(result.visitUrl);
            }}
          >
            Visit r/{result.answer}
          </button>
        ) : (
          <a
            className="rh-button"
            href={result.visitUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit r/{result.answer}
          </a>
        )}
        <button
          type="button"
          className="rh-button quiet"
          onClick={() => {
            void copy();
          }}
        >
          {copied ? 'Copied' : 'Copy result'}
        </button>
      </div>

      <textarea
        className="rh-share"
        readOnly
        rows={2}
        value={result.shareText}
        aria-label="Your result, without spoilers"
        onFocus={(e) => {
          e.target.select();
        }}
      />

      <div className="rh-chart">
        <h3 className="rh-section-title">What everyone else guessed</h3>
        {result.wrongGuesses.length === 0 ? (
          <p className="rh-muted" style={{ margin: 0 }}>
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
