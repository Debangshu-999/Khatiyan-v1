const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Short access tokens renewed by a refresh token (user, 2026-11-02).
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const refresh = read("src/auth/session-refresh.ts");
const api = read("src/store/api.ts");

test("only one renewal goes out at a time, as a refresh token works once", () => {
  assert.match(refresh, /if \(!inFlight\) \{\s+inFlight = askForNewTokens\(store\)/);
});

test("a refusal signs out, no answer does not", () => {
  assert.match(refresh, /response\.status === 401[\s\S]*?store\.dispatch\(sessionExpired\(\)/);
  const unreachable = refresh.slice(refresh.indexOf("} catch {\n    // No answer"), refresh.indexOf("} finally {"));
  assert.doesNotMatch(unreachable, /sessionExpired/);
  assert.match(api, /keptSignedIn = true/);
  assert.match(api, /status === 401 && hadToken && !keptSignedIn/);
});

test("only the server's REFRESH_REFUSED signs out, never a bare 400, 401 or 403", () => {
  // A backend failing mid-restart answered 401 from its error page (user, 2026-11-07).
  assert.match(refresh, /response\.status === 401 && \(await refusalCode\(response\)\) === "REFRESH_REFUSED"/);
  assert.doesNotMatch(refresh, /response\.status === 400 \|\|/);
  assert.doesNotMatch(refresh, /response\.status === 403/);
});

test("the new refresh token is saved at once, as the old one no longer works", () => {
  assert.match(refresh, /tokensRefreshed\([\s\S]*?await saveSession\(\{ accessToken: body\.accessToken, refreshToken: body\.refreshToken/);
});

test("a request renews first when near expiry, and a 401 renews and retries once", () => {
  assert.match(api, /await freshAccessToken\(apiContext\)/);
  assert.match(api, /await refreshSession\(apiContext\)[\s\S]*?result = await baseQuery\(args, apiContext, extraOptions\)/);
});

test("every request made by hand renews too", () => {
  assert.match(read("src/features/uploads/upload-asset.ts"), /await freshAccessToken\(store\)/);
  assert.match(read("src/features/billing/tenant-bill-receipt-sheet.tsx"), /token: await freshAccessToken\(store\)/);
});

test("a renewal does not reset the session or lock the wallet", () => {
  const slice = read("src/store/slices/auth-slice.ts");
  const renewed = slice.slice(slice.indexOf("tokensRefreshed(state"), slice.indexOf("clearSession(state"));
  assert.doesNotMatch(renewed, /registeredDeviceTokenId|user/);
  assert.match(read("src/store/store.ts"), /let walletSession = store\.getState\(\)\.auth\.user\?\.id/);
  assert.doesNotMatch(read("src/features/billing/wallet-pin-gate.tsx"), /state\.auth\.accessToken/);
});

test("every sign-in keeps its refresh token, and so does editing a profile", () => {
  assert.match(read("src/features/auth/auth-screen.tsx"), /refreshToken: response\.refreshToken/);
  assert.match(read("app/account-settings.tsx"), /refreshToken: response\.refreshToken/);
  assert.equal(read("app/(tabs)/account.tsx").match(/refreshToken: auth\.refreshToken/g).length, 2);
});

test("the session countdown is gone, as the token it read renews by itself", () => {
  assert.doesNotMatch(read("src/features/auth/signed-in-devices.tsx"), /SessionCountdown/);
  assert.doesNotMatch(read("app/account-settings.tsx"), /SessionCountdown/);
});
