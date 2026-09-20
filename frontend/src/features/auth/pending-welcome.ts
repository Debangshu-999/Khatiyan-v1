/**
 * The sign-in greeting, held until Home is actually on screen.
 *
 * <p>It used to fire the moment the server accepted the PIN. The app then
 * spends a beat on the account check and the loading screen before Home
 * appears, so the toast (and the location prompt behind it) arrived over a
 * logo instead of over the screen they belong to. Sign-in now only queues the
 * message and Home shows it once it has rendered.
 *
 * <p>A module variable rather than Redux: it is a one-shot hand-off between two
 * screens in the same session, never persisted and never rendered from.
 */
let pendingWelcome: string | null = null;

export function queueWelcome(message: string) {
  pendingWelcome = message;
}

/** Returns the queued greeting once, then forgets it. */
export function takeWelcome(): string | null {
  const message = pendingWelcome;
  pendingWelcome = null;
  return message;
}
