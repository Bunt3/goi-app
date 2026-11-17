export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for non-secure contexts (e.g. opening the dev server over plain http on a LAN).
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return formatUuid(b);
}

function formatUuid(b: Uint8Array): string {
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Deterministic UUID (v5-style, SHA-1) so the same seed word gets the same id on every device. */
export async function uuidFromName(name: string): Promise<string> {
  const data = new TextEncoder().encode('goi-app:' + name);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  return formatUuid(hash);
}

export function daysAgoText(ts: number | null, now: number): string {
  if (ts == null) return 'never';
  const days = Math.floor((now - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
