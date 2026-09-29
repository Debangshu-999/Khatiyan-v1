/**
 * Incoming links that must not move the app.
 *
 * <p>The Aadhaar App check hands the tenant back with
 * `khatiyan://verification/return?attempt=…`. That link exists only to bring
 * Khatiyan to the front: the screen that opened the session is still there and
 * polls for the result when the app becomes active. Routing it would land on a
 * screen that does not exist, so it is swallowed here. Returning null keeps the
 * app on its current path (Expo Router v56, `redirectSystemPath`).
 *
 * <p>Everything else passes through unchanged.
 */
export function redirectSystemPath({ path }: { initial: boolean; path: string }) {
  try {
    if (path.includes("verification/return")) {
      return null;
    }
    return path;
  } catch {
    // Throwing here can crash the app, so the worst case is no redirect.
    return path;
  }
}
