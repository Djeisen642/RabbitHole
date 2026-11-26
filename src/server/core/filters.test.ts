import { describe, expect, it } from 'vitest';
import type { PoolEntry } from '../../shared/pool';
import {
  MAX_COMMENT_CHARS,
  MAX_COMMENT_WORDS,
  MIN_BODY_CHARS,
  MIN_SUBSCRIBERS,
  MIN_TEXT_POSTS,
  MIN_TITLE_ONLY_CHARS,
  containsGiveaway,
  isTextPost,
  jargonWords,
  looksLikeNews,
  maskGiveaways,
  pickRule,
  pickTopComment,
  postProblem,
  subredditProblem,
} from './filters';
import type { SourceComment, SourcePost, SubredditFacts } from './source';

const breadit: PoolEntry = {
  name: 'Breadit',
  aliases: ['breddit', 'bread it'],
  category: 'food',
};
const keyboards: PoolEntry = {
  name: 'MechanicalKeyboards',
  aliases: ['mechanical keyboards', 'mechkeys'],
  category: 'hobby',
};
const castiron: PoolEntry = {
  name: 'castiron',
  aliases: ['cast iron'],
  category: 'food',
};
const canada: PoolEntry = {
  name: 'canada',
  aliases: ['canadian', 'canadians'],
  category: 'country',
  newsHeavy: true,
};

const BODY =
  'A long enough body to read: I waited six hours, folded it four times and baked it hot in a pot with the lid on.';

const post = (over: Partial<SourcePost> = {}): SourcePost => ({
  id: 't3_a',
  title: 'My third loaf finally has an open crumb',
  body: BODY,
  isSelf: true,
  nsfw: false,
  spoiler: false,
  removed: false,
  stickied: false,
  flair: null,
  score: 100,
  comments: 10,
  createdAt: 0,
  ...over,
});

describe('containsGiveaway and maskGiveaways', () => {
  it('catches the name and aliases, with or without r/, in any case', () => {
    expect(containsGiveaway('Posted on r/Breadit today', breadit)).toBe(true);
    expect(containsGiveaway('posted on /r/breadit', breadit)).toBe(true);
    expect(containsGiveaway('Hello BREDDIT friends', breadit)).toBe(true);
    expect(containsGiveaway('my mechanical-keyboards build', keyboards)).toBe(
      true
    );
    expect(containsGiveaway('#mechanicalkeyboardsrule', keyboards)).toBe(true);
    expect(containsGiveaway('I bake bread every week', breadit)).toBe(false);
  });

  it('catches a country name and its demonym', () => {
    expect(containsGiveaway('A very Canadian morning', canada)).toBe(true);
    expect(containsGiveaway('Canadians, help me out', canada)).toBe(true);
    expect(containsGiveaway('Moving to Canada next year', canada)).toBe(true);
    expect(containsGiveaway('Northern lights in Manitoba', canada)).toBe(false);
  });

  it('masks mentions and keeps an r/ prefix', () => {
    expect(
      maskGiveaways('Welcome to r/Breadit, fellow breddit fans', breadit)
    ).toBe('Welcome to r/?????, fellow ????? fans');
  });
});

describe('postProblem', () => {
  it('accepts a readable text post that hides the sub', () => {
    expect(postProblem(post(), breadit)).toBeNull();
  });

  it('rejects anything that is not a text post', () => {
    expect(postProblem(post({ isSelf: false }), breadit)).toBe(
      'not a text post'
    );
    expect(postProblem(post({ isSelf: false, body: '' }), breadit)).toBe(
      'not a text post'
    );
  });

  it('rejects unsafe, removed and pinned posts', () => {
    expect(postProblem(post({ nsfw: true }), breadit)).toBe('nsfw');
    expect(postProblem(post({ spoiler: true }), breadit)).toBe('spoiler');
    expect(postProblem(post({ removed: true }), breadit)).toBe('removed');
    expect(postProblem(post({ body: '[deleted]' }), breadit)).toBe('removed');
    expect(postProblem(post({ stickied: true }), breadit)).toBe('stickied');
  });

  it('needs a body long enough to read, but not too long', () => {
    expect(
      postProblem(post({ body: 'x'.repeat(MIN_BODY_CHARS - 1) }), breadit)
    ).toBe('body too short');
    expect(postProblem(post({ body: 'x'.repeat(5000) }), breadit)).toBe(
      'body too long'
    );
    expect(postProblem(post({ title: 'Hi' }), breadit)).toBe('title too short');
  });

  it('accepts a title-only post (no body) when the title carries it', () => {
    const longTitle = 'x'.repeat(MIN_TITLE_ONLY_CHARS);
    const shortTitle = 'x'.repeat(MIN_TITLE_ONLY_CHARS - 1);
    expect(
      postProblem(post({ body: '', title: longTitle }), breadit)
    ).toBeNull();
    expect(postProblem(post({ body: '', title: shortTitle }), breadit)).toBe(
      'no body, title too short'
    );
  });

  it('rejects posts that name the sub in the title or body', () => {
    expect(
      postProblem(post({ title: 'First post on r/Breadit!' }), breadit)
    ).toBe('title names the sub');
    expect(
      postProblem(
        post({ body: `${BODY} Thanks breddit for the help.` }),
        breadit
      )
    ).toBe('body names the sub');
    expect(
      postProblem(post({ title: 'What is the most Canadian snack?' }), canada)
    ).toBe('title names the sub');
  });

  it('skips news and politics on news-heavy subs only', () => {
    const news = post({ title: 'Provincial election turnout numbers are out' });
    expect(postProblem(news, canada)).toBe('news or politics');
    expect(postProblem(news, breadit)).toBeNull();
    expect(
      postProblem(post({ title: 'Big week here', flair: 'Politics' }), canada)
    ).toBe('news or politics');
    expect(
      postProblem(post({ title: 'Saw the northern lights last night' }), canada)
    ).toBeNull();
  });
});

describe('isTextPost', () => {
  it('counts a title-only post as text when the title is long enough', () => {
    expect(
      isTextPost(post({ body: '', title: 'x'.repeat(MIN_TITLE_ONLY_CHARS) }))
    ).toBe(true);
    expect(
      isTextPost(
        post({ body: '', title: 'x'.repeat(MIN_TITLE_ONLY_CHARS - 1) })
      )
    ).toBe(false);
  });

  it('still requires a self post that is not removed or deleted', () => {
    expect(isTextPost(post({ isSelf: false }))).toBe(false);
    expect(isTextPost(post({ body: '[removed]' }))).toBe(false);
  });
});

describe('looksLikeNews', () => {
  it('matches whole keywords in the title or flair', () => {
    expect(looksLikeNews('Minister resigns', null)).toBe(true);
    expect(looksLikeNews('Police called to the park', null)).toBe(true);
    expect(looksLikeNews('Cozy cabin weekend', 'News')).toBe(true);
    expect(looksLikeNews('Warm socks for winter', null)).toBe(false);
    expect(looksLikeNews('Taxidermy at the museum', null)).toBe(false);
  });
});

describe('subredditProblem', () => {
  const facts = (over: Partial<SubredditFacts> = {}): SubredditFacts => ({
    name: 'Breadit',
    subscribers: 1_000_000,
    createdAt: 0,
    nsfw: false,
    quarantined: false,
    iconUrl: null,
    ...over,
  });
  const posts = Array.from({ length: MIN_TEXT_POSTS }, () => post());

  it('needs the sub to exist, be safe, big enough and have text posts', () => {
    expect(subredditProblem(facts(), posts)).toBeNull();
    expect(subredditProblem(null, posts)).toBe('not found');
    expect(subredditProblem(facts({ nsfw: true }), posts)).toBe('nsfw');
    expect(subredditProblem(facts({ quarantined: true }), posts)).toBe(
      'quarantined'
    );
    expect(
      subredditProblem(facts({ subscribers: MIN_SUBSCRIBERS - 1 }), posts)
    ).toMatch(/members/);
    expect(
      subredditProblem(
        facts(),
        posts.map((p) => ({ ...p, isSelf: false, body: '' }))
      )
    ).toMatch(/text posts/);
  });
});

describe('pickTopComment', () => {
  const comment = (over: Partial<SourceComment> = {}): SourceComment => ({
    id: 't1_a',
    body: 'Lovely crumb, try a longer cold proof next time.',
    author: 'example_user',
    score: 10,
    stickied: false,
    removed: false,
    distinguished: false,
    ...over,
  });

  it('skips bots, pinned, removed and odd-length comments, and masks the name', () => {
    const picked = pickTopComment(
      [
        comment({ author: 'AutoModerator', stickied: true }),
        comment({ distinguished: true }),
        comment({ body: '[removed]' }),
        comment({ body: 'nice' }),
        comment({
          body: 'Welcome to r/Breadit, that crumb is lovely!',
          score: 7,
        }),
      ],
      breadit
    );
    expect(picked).toEqual({
      id: 't1_a',
      body: 'Welcome to r/?????, that crumb is lovely!',
      score: 7,
    });
    expect(pickTopComment([], breadit)).toBeNull();
  });

  it('needs at least MIN_COMMENT_WORDS words, by word count not length', () => {
    // 5 words: rejected even though it reads fine.
    expect(
      pickTopComment(
        [comment({ body: 'Kicks like a mule, honestly.' })],
        breadit
      )
    ).toBeNull();
    // 6 words: the same kind of short, punchy comment, now accepted.
    expect(
      pickTopComment(
        [comment({ body: 'Kicks like a mule, no joke.' })],
        breadit
      )?.body
    ).toBe('Kicks like a mule, no joke.');
  });

  it('truncates a comment past MAX_COMMENT_WORDS instead of rejecting it', () => {
    const long = Array.from(
      { length: MAX_COMMENT_WORDS + 10 },
      (_, i) => `word${String(i)}`
    ).join(' ');
    const picked = pickTopComment([comment({ body: long })], breadit);
    expect(picked?.body).toBe(
      `${Array.from({ length: MAX_COMMENT_WORDS }, (_, i) => `word${String(i)}`).join(' ')}…`
    );
  });

  it('skips a comment that still names the sub after masking', () => {
    // Masking only replaces whole words; a name glued into a hashtag can't
    // be masked, so the comment would give the answer away as clue one.
    expect(
      pickTopComment(
        [
          comment({ body: 'Welcome to the #castironcooking club, friend!' }),
          comment({ body: 'Lovely seasoning, keep using it every day.' }),
        ],
        castiron
      )?.body
    ).toBe('Lovely seasoning, keep using it every day.');
  });
});

describe('pickRule', () => {
  it('prefers a rule that says something about the sub', () => {
    expect(
      pickRule(
        [
          { title: 'Be kind', description: 'No insults.' },
          { title: 'Share your recipe', description: 'Post it on r/Breadit.' },
        ],
        breadit
      )
    ).toEqual({
      title: 'Share your recipe',
      description: 'Post it on r/?????.',
    });
  });

  it('falls back to the first rule, and to null with none', () => {
    expect(
      pickRule([{ title: 'Be civil', description: '' }], breadit)?.title
    ).toBe('Be civil');
    expect(pickRule([], breadit)).toBeNull();
  });

  it('skips a rule that still names the sub after masking', () => {
    expect(
      pickRule(
        [
          { title: 'Castironcookware only', description: 'Pans and pots.' },
          { title: 'Show the pan', description: 'Photos of the cooking.' },
        ],
        castiron
      )?.title
    ).toBe('Show the pan');
  });
});

describe('jargonWords', () => {
  it('ranks repeated distinctive words and drops common words and the name', () => {
    const words = jargonWords(
      [
        'Open crumb on my third loaf',
        'Why is my crumb gummy?',
        'Starter hooch, is it fine?',
        'Rye starter vs wheat starter',
        'Proud of this loaf for r/Breadit',
        'Breddit what am I doing wrong',
      ],
      breadit
    );
    expect(words.slice(0, 3)).toEqual(['starter', 'crumb', 'loaf']);
    expect(words).not.toContain('breadit');
    expect(words).not.toContain('breddit');
    expect(words).not.toContain('what');
    expect(words.length).toBeLessThanOrEqual(8);
  });

  it('drops the words of a spaced name', () => {
    const words = jargonWords(
      [
        'My cast iron skillet after a year',
        'Cast iron seasoning flaking off',
        'Stripping a cast iron skillet',
      ],
      castiron
    );
    expect(words).not.toContain('cast');
    expect(words).not.toContain('iron');
    expect(words[0]).toBe('skillet');
  });
});

describe('pickTopComment length cap', () => {
  const comment = (body: string): SourceComment => ({
    id: 't1_a',
    body,
    author: 'example_user',
    score: 10,
    stickied: false,
    removed: false,
    distinguished: false,
  });
  it('cuts a comment of long words at a word break under MAX_COMMENT_CHARS', () => {
    const long = Array.from(
      { length: 12 },
      (_, i) => `https://example.com/${'x'.repeat(40)}/${String(i)}`
    ).join(' ');
    const picked = pickTopComment([comment(long)], breadit);
    expect(picked).not.toBeNull();
    const body = picked?.body ?? '';
    expect(body.length).toBeLessThanOrEqual(MAX_COMMENT_CHARS + 1);
    expect(body.endsWith('…')).toBe(true);
    expect(long.startsWith(body.slice(0, -1))).toBe(true);
    expect(body.slice(0, -1).endsWith(' ')).toBe(false);
  });
});
