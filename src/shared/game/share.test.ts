import { describe, expect, it } from 'vitest';
import { postLink, shareText, solvedWith } from './share';

const POST = 'https://www.reddit.com/r/abbitHole/comments/abc123/';

describe('shareText', () => {
  it('says how many clues a solve took, with a square per guess and the link', () => {
    const text = shareText({
      puzzleNumber: 12,
      guesses: [false, false, true],
      maxGuesses: 6,
      postUrl: POST,
    });
    expect(text).toBe(
      `r/abbitHole #12: dug it up with 2 clues 🐇\n🟫🟫🟧⬜⬜⬜\n${POST}`
    );
  });

  it('counts one clue in the singular and a first-guess solve as no clues', () => {
    const one = shareText({
      puzzleNumber: 3,
      guesses: [false, true],
      maxGuesses: 5,
      postUrl: POST,
    });
    expect(one.split('\n')[0]).toBe('r/abbitHole #3: dug it up with 1 clue 🐇');

    const none = shareText({
      puzzleNumber: 1,
      guesses: [true],
      maxGuesses: 5,
      postUrl: POST,
    });
    expect(none.split('\n')[0]).toBe(
      'r/abbitHole #1: dug it up with no clues 🐇'
    );
    expect(none.split('\n')[1]).toBe('🟧⬜⬜⬜⬜');
  });

  it('has its own line for a lost round', () => {
    expect(
      shareText({
        puzzleNumber: 2,
        guesses: [false, false, false, false, false],
        maxGuesses: 5,
        postUrl: POST,
      })
    ).toBe(`r/abbitHole #2: stayed buried 🕳️\n🟫🟫🟫🟫🟫\n${POST}`);
  });

  it('leaves the link line out when there is no post', () => {
    expect(
      shareText({
        puzzleNumber: 4,
        guesses: [true],
        maxGuesses: 6,
        postUrl: null,
      })
    ).toBe('r/abbitHole #4: dug it up with no clues 🐇\n🟧⬜⬜⬜⬜⬜');
  });

  it('is made of the headline, the squares and the link, nothing else', () => {
    // The input has no answer, clue or title to leak; this pins the shape
    // so a later change can't start adding free text to it.
    const text = shareText({
      puzzleNumber: 40,
      guesses: [false, false, false, true],
      maxGuesses: 6,
      postUrl: POST,
    });
    const [headline, squares, link, ...rest] = text.split('\n');
    expect(headline).toMatch(
      /^r\/abbitHole #40: dug it up with \d+ clues? 🐇$/
    );
    expect(squares).toMatch(/^[🟫🟧⬜]+$/u);
    expect(link).toBe(POST);
    expect(rest).toEqual([]);
  });
});

describe('postLink', () => {
  it('builds the permalink from the bare id, with or without t3_', () => {
    expect(postLink('abbitHole', 't3_abc123')).toBe(POST);
    expect(postLink('abbitHole', 'abc123')).toBe(POST);
  });
});

describe('solvedWith', () => {
  it('counts clues in words, singular for one', () => {
    expect(solvedWith(0)).toBe('solved on the post alone');
    expect(solvedWith(1)).toBe('solved with 1 clue');
    expect(solvedWith(3)).toBe('solved with 3 clues');
  });
});
