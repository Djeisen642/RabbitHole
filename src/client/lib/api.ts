import type {
  ErrorResponse,
  PuzzleResponse,
  SuggestResponse,
} from '../../shared/api';
import { getJson } from './http';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function read<T>(res: Response): Promise<T> {
  if (res.ok) return getJson<T>(res);
  let message = `Something went wrong (${res.status}).`;
  try {
    const body = await getJson<ErrorResponse>(res);
    if (body.message) message = body.message;
  } catch {
    // keep the generic message
  }
  throw new ApiError(message, res.status);
}

export async function fetchPuzzle(): Promise<PuzzleResponse> {
  return read<PuzzleResponse>(await fetch('/api/puzzle'));
}

export async function sendGuess(guess: string): Promise<PuzzleResponse> {
  return read<PuzzleResponse>(
    await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess }),
    })
  );
}

export async function fetchSuggestions(
  prefix: string,
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(`/api/suggest?q=${encodeURIComponent(prefix)}`, {
    ...(signal ? { signal } : {}),
  });
  const body = await read<SuggestResponse>(res);
  return body.names;
}
