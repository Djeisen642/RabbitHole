import { describe, expect, it } from 'vitest';
import { copyText } from './clipboard';
import type { ClipboardEnv } from './clipboard';

/** A clipboard that records which way the text went. */
function fakeEnv(api: 'ok' | 'refuse', exec: 'ok' | 'fail' | 'throw') {
  const calls: string[] = [];
  const env: ClipboardEnv = {
    writeText: (text) => {
      calls.push(`api:${text}`);
      return api === 'ok'
        ? Promise.resolve()
        : Promise.reject(new Error('NotAllowedError'));
    },
    execCopy: (text) => {
      calls.push(`exec:${text}`);
      if (exec === 'throw') throw new Error('no document');
      return exec === 'ok';
    },
  };
  return { env, calls };
}

describe('copyText', () => {
  it('uses the Clipboard API when it works', async () => {
    const { env, calls } = fakeEnv('ok', 'ok');
    expect(await copyText('hi', env)).toBe(true);
    expect(calls).toEqual(['api:hi']);
  });

  it('falls back to the copy command when the API is refused', async () => {
    const { env, calls } = fakeEnv('refuse', 'ok');
    expect(await copyText('hi', env)).toBe(true);
    expect(calls).toEqual(['api:hi', 'exec:hi']);
  });

  it('reports failure when both ways fail', async () => {
    expect(await copyText('hi', fakeEnv('refuse', 'fail').env)).toBe(false);
    expect(await copyText('hi', fakeEnv('refuse', 'throw').env)).toBe(false);
  });
});
