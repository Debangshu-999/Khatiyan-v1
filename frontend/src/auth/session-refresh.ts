import { deviceLabel, devicePlatform } from "@/auth/device-identity";
import { clearStoredSession, saveSession } from "@/auth/session-storage";
import { sessionExpired, tokensRefreshed } from "@/store/slices/auth-slice";
import type { RootState } from "@/store/store";

/** Enough of the store for this file. It is handed in, as the store itself imports the API layer that calls here. */
type SessionStore = { dispatch: (action: never) => unknown; getState: () => unknown };

/** Renewed this long before it runs out, so a request does not leave with a token about to die. */
const RENEW_BEFORE_MS = 60_000;
const REFRESH_TIMEOUT_MS = 20_000;

let inFlight: Promise<string | null> | null = null;

/** When the token runs out, from its own `exp` claim. Read only to decide when to renew: the server checks the real thing. */
function tokenExpiryMs(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }
    // Base64URL, and React Native's atob does not accept the URL alphabet.
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), "=");
    const claims = JSON.parse(globalThis.atob(padded)) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** The error code in a refusal's body, or null when there is none. */
async function refusalCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

async function askForNewTokens(store: SessionStore): Promise<string | null> {
  const { appConfig, auth } = store.getState() as RootState;
  const presented = auth.refreshToken;
  if (!presented) {
    return null;
  }
  const rawBaseUrl = appConfig.apiBaseUrl.trim();
  const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/auth/token/refresh`, {
      body: JSON.stringify({ refreshToken: presented }),
      headers: {
        "Content-Type": "application/json",
        "X-Device-Label": deviceLabel(),
        "X-Device-Platform": devicePlatform(),
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch {
    // No answer says nothing about the session. Whoever asked sees a failed request, and stays signed in.
    return null;
  } finally {
    clearTimeout(timer);
  }

  // They signed out, or into something else, while this was on its way.
  const now = (store.getState() as RootState).auth;
  if (now.refreshToken !== presented) {
    return now.accessToken;
  }

  // Signed out ONLY when the server says this token is refused (2026-11-07). Any 401 used
  // to do it, and a backend failing while it restarted answered 401 from its error page,
  // signing a phone out with a perfectly good session.
  if (response.status === 401 && (await refusalCode(response)) === "REFRESH_REFUSED") {
    store.dispatch(sessionExpired() as never);
    await clearStoredSession();
    return null;
  }
  if (!response.ok) {
    return null;
  }

  let body: { accessToken: string; refreshToken: string };
  try {
    body = (await response.json()) as { accessToken: string; refreshToken: string };
  } catch {
    return null;
  }
  store.dispatch(tokensRefreshed({ accessToken: body.accessToken, refreshToken: body.refreshToken }) as never);
  // Saved at once: the old refresh token no longer works, so a restart must find the new one.
  await saveSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, user: now.user });
  return body.accessToken;
}

/**
 * New tokens for this session. Only one request at a time goes out, and everyone waiting
 * shares its answer: a refresh token works once, so ten screens asking together would
 * otherwise look like a stolen token being replayed.
 *
 * @return the new access token, or null when there is none. The session has been marked
 *         expired if the server refused, and is untouched if it could not be reached.
 */
export function refreshSession(store: SessionStore): Promise<string | null> {
  if (!inFlight) {
    inFlight = askForNewTokens(store).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** The access token to send now, renewed first if it is about to run out. */
export async function freshAccessToken(store: SessionStore): Promise<string | null> {
  const { accessToken, refreshToken } = (store.getState() as RootState).auth;
  if (!accessToken || !refreshToken) {
    return accessToken;
  }
  const expiresAt = tokenExpiryMs(accessToken);
  if (expiresAt == null || expiresAt - Date.now() > RENEW_BEFORE_MS) {
    return accessToken;
  }
  return (await refreshSession(store)) ?? (store.getState() as RootState).auth.accessToken;
}
