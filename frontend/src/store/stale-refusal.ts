/**
 * The latest "data has changed" refusal (409 STALE), as the API layer saw it.
 *
 * <p>Every refusal reaches the user through the same dialog, as nothing but a
 * sentence, so the dialog cannot tell a stale refusal from any other by what
 * it is handed. The API layer notes the sentence here the moment the server
 * sends it, and the dialog asks whether the sentence it is showing is that
 * one. It then knows to leave the form or sheet when it is closed (user,
 * 2026-10-04). See `leave-on-stale`.
 *
 * <p>A plain module with no React in it, so the store can import it without
 * pulling a component in.
 */
let latest: { at: number; message: string } | null = null;

/** A dialog opens within moments of its refusal. Past this, the same words are a new matter. */
const FRESH_FOR_MS = 15_000;

export function noteStaleRefusal(message: string) {
  latest = { at: Date.now(), message };
}

/** Whether the sentence being shown is a stale refusal that has just come back. */
export function isStaleRefusal(message: string) {
  return latest !== null && latest.message === message && Date.now() - latest.at < FRESH_FOR_MS;
}
