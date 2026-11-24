/**
 * Parse a fetch response body as T. The server and client share response
 * types from src/shared/api.ts, so this is the one sanctioned place where an
 * untyped JSON body is treated as a known type.
 */
export async function getJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json();
  return body as T;
}
