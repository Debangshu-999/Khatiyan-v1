/** A five-minute grant kept only in memory and bound to the login token. */
let grant: { token: string; session: string; expiresAt: number } | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
export function subscribeWalletAccess(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function clearWalletAccess() {
  grant = null;
  clearTimeout(expiryTimer);
  listeners.forEach((listener) => listener());
}
export function walletAccessToken(session: string | null) {
  return grant && session === grant.session && Date.now() < grant.expiresAt ? grant.token : null;
}
export function saveWalletAccess(session: string, token: string, expiresAt: string) {
  clearTimeout(expiryTimer);
  grant = { session, token, expiresAt: Date.parse(expiresAt) };
  expiryTimer = setTimeout(clearWalletAccess, Math.max(0, grant.expiresAt - Date.now()));
  listeners.forEach((listener) => listener());
}
