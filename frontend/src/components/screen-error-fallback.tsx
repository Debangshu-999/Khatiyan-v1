import type { ErrorBoundaryProps } from "expo-router";

import { CrashedScreen } from "@/components/load-failed";

/**
 * The last resort, for a crash in the root layout itself. A screen that throws
 * is caught nearer, by the ScreenBoundary around each screen.
 *
 * <p>No hooks that need the app's providers (2026-09-29). Expo Router draws this
 * OUTSIDE the root layout, so the Redux store is not there. It once used
 * useTheme(), and crashed on every screen error with "could not find react-redux
 * context value", hiding the real error behind its own.
 */
export function ScreenErrorFallback({ error, retry }: ErrorBoundaryProps) {
  return <CrashedScreen error={error} onReload={() => void retry()} />;
}
