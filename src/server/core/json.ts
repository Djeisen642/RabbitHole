/**
 * Small readers for JSON we stored ourselves, so parsed values get real
 * types without casts. Each returns null when the shape doesn't match.
 */

export type JsonRecord = { [key: string]: unknown };

export function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const out: JsonRecord = {};
  for (const [k, v] of Object.entries(value)) out[k] = v;
  return out;
}

export const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const asBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

export function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

export function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}
