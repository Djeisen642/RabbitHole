import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, SubmitEvent } from 'react';
import { normalizeSubreddit } from '../../shared/game/rules';
import { fetchSuggestions } from '../lib/api';

/**
 * The guess input. Suggests a few matching communities once two letters are
 * typed; the full list of answers is never shown.
 */
export function GuessBox({
  disabled,
  guessed,
  guessesLeft,
  onGuess,
}: {
  disabled: boolean;
  guessed: readonly string[];
  guessesLeft: number;
  onGuess: (name: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState('');
  // Suggestions, remembered with the prefix they answer.
  const [found, setFound] = useState<{ prefix: string; names: string[] }>({
    prefix: '',
    names: [],
  });
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const prefix = normalizeSubreddit(value);
  const options = found.prefix === prefix ? found.names : [];

  useEffect(() => {
    if (prefix.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchSuggestions(prefix, controller.signal)
        .then((names) => {
          const seen = new Set(guessed.map(normalizeSubreddit));
          setFound({
            prefix,
            names: names.filter((n) => !seen.has(normalizeSubreddit(n))),
          });
          setActive(-1);
        })
        .catch(() => {
          // Aborted or offline: keep whatever was shown.
        });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [prefix, guessed]);

  async function submit(name: string): Promise<void> {
    const guess = name.trim();
    if (guess === '' || disabled) return;
    setOpen(false);
    const ok = await onGuess(guess);
    if (ok) {
      setValue('');
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const chosen =
      options[active] ?? (options.length === 1 ? options[0] : undefined);
    void submit(chosen ?? value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!open || options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && options.length > 0 && !disabled;
  const activeId = active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <form className="rh-guess" onSubmit={onSubmit} autoComplete="off">
      <label htmlFor={`${listId}-input`} className="rh-sr-only">
        Which community is this from?
      </label>
      <div className="rh-guess-row">
        <input
          ref={inputRef}
          id={`${listId}-input`}
          className="rh-input"
          placeholder="r/ which community?"
          value={value}
          disabled={disabled}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(activeId ? { 'aria-activedescendant': activeId } : {})}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={40}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
            }, 150);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="rh-button"
          disabled={disabled || value.trim() === ''}
        >
          Dig
        </button>
        {showList ? (
          <ul className="rh-suggest" id={listId} role="listbox">
            {options.map((name, i) => (
              <li
                key={name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void submit(name);
                }}
              >
                r/{name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="rh-muted" style={{ margin: 0, fontSize: 14 }}>
        {guessesLeft === 1
          ? 'Last guess. Make it count.'
          : `${guessesLeft} guesses left. A wrong one digs up a clue.`}
      </p>
    </form>
  );
}
