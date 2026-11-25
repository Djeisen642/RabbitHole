import { useEffect, useRef, useState } from 'react';
import type { PostCard as Post } from '../../shared/api';
import { ago, compact } from '../lib/format';

/**
 * Today's post, drawn like a Reddit post with the community hidden. The body
 * is clamped to a few lines so the clues and the guess box stay in view on a
 * phone; a More button opens it up when it runs longer.
 */
export function PostCard({
  post,
  answer,
}: {
  post: Post;
  /** Shown once the round is over. */
  answer: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const body = useRef<HTMLParagraphElement>(null);

  // Only offer More when the clamp actually hides something. Measured on
  // resize too, since the line count depends on the width.
  useEffect(() => {
    const el = body.current;
    if (!el || open) return;
    const measure = (): void => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [open, post.body]);

  return (
    <article className="rh-post" aria-label="Today's post">
      <div className="rh-post-meta">
        <span className="sub">{answer ? `r/${answer}` : 'r/?????'}</span>
        <span aria-hidden="true">·</span>
        <span>{ago(post.createdAt)} ago</span>
      </div>
      <h2>{post.title}</h2>
      {post.body ? (
        <p ref={body} className={`rh-post-body${open ? '' : ' clamped'}`}>
          {post.body}
        </p>
      ) : null}
      <div className="rh-post-actions">
        <span>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5 13 8h-3v5.5H6V8H3z" />
          </svg>
          {compact(post.score)}
          <span className="rh-sr-only">upvotes</span>
        </span>
        <span>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
          </svg>
          {compact(post.comments)}
          <span className="rh-sr-only">comments</span>
        </span>
        {overflows || open ? (
          <button
            type="button"
            className="rh-link rh-more"
            aria-expanded={open}
            onClick={() => {
              setOpen((o) => !o);
            }}
          >
            {open ? 'Less' : 'More'}
          </button>
        ) : null}
      </div>
    </article>
  );
}
