import { useState } from 'react';
import type { PostCard as Post } from '../../shared/api';
import { ago, compact } from '../lib/format';

/** Today's post, drawn like a Reddit post with the community hidden. */
export function PostCard({
  post,
  answer,
}: {
  post: Post;
  /** Shown once the round is over. */
  answer: string | null;
}) {
  const [open, setOpen] = useState(false);
  const long = post.body.length > 320;
  return (
    <article className="rh-post" aria-label="Today's post">
      <div className="rh-post-meta">
        <span className="rh-avatar" aria-hidden="true">
          ?
        </span>
        <span className="sub">{answer ? `r/${answer}` : 'r/?????'}</span>
        <span aria-hidden="true">·</span>
        <span>{ago(post.createdAt)} ago</span>
      </div>
      <h2>{post.title}</h2>
      <p className={`rh-post-body${long && !open ? ' clamped' : ''}`}>
        {post.body}
      </p>
      {long ? (
        <button
          type="button"
          className="rh-link"
          style={{ justifySelf: 'start', fontSize: 14 }}
          onClick={() => {
            setOpen((o) => !o);
          }}
        >
          {open ? 'Show less' : 'Read more'}
        </button>
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
      </div>
    </article>
  );
}
