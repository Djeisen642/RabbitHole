import type {
  ChoicesRequest,
  ErrorResponse,
  GuessRequest,
  PuzzleResponse,
  SuggestResponse,
} from '../../shared/api';

/**
 * Parse a fetch response body as T. The server and client share response
 * types from src/shared/api.ts, so this is the one sanctioned place where an
 * untyped JSON body is treated as a known type.
 */
async function getJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json();
  return body as T;
}

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

export async function sendGuess(
  request: GuessRequest
): Promise<PuzzleResponse> {
  return read<PuzzleResponse>(
    await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  );
}

/** Answer the training-wheels offer ("Want some options?"). */
export async function sendChoices(
  request: ChoicesRequest
): Promise<PuzzleResponse> {
  return read<PuzzleResponse>(
    await fetch('/api/choices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
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
