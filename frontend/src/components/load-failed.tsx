import { Component, useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Dimensions, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { errorMessage } from "@/features/forms/server-error";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { serverAnswered, UNREACHABLE_AFTER } from "@/store/slices/connection-slice";
import { themes } from "@/theme/colors";
import { radii, spacing } from "@/theme/spacing";
import { fonts as staffFonts, type } from "@/theme/typography";
import { useTheme } from "@/theme/use-theme";

/** The one sentence for a read or a screen that failed (user, 2026-10-31). */
export const LOAD_FAILED_TITLE = "Oops...something went wrong, please reload again!";

type Fonts = typeof staffFonts;

// Fixed, not read from the theme: the app is light-only, and the root boundary
// draws outside the store that useTheme reads.
const colors = themes.light;

function WarningArt({ size }: { size: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Path
        d="M24.7 9.2c3.3-5.6 11.3-5.6 14.6 0l20 34.6c3.3 5.6-.8 12.7-7.3 12.7H12c-6.5 0-10.6-7.1-7.3-12.7z"
        fill="#FF4D6A"
      />
      <Path d="M32 18.5c2.2 0 3.9 1.8 3.8 4l-.8 14.2c-.1 1.6-1.4 2.8-3 2.8s-2.9-1.2-3-2.8l-.8-14.2c-.1-2.2 1.6-4 3.8-4Z" fill="#FFFFFF" />
      <Circle cx={32} cy={46} fill="#FFFFFF" r={3.8} />
    </Svg>
  );
}

function ReloadButton({ fonts, onPress, small }: { fonts: Fonts; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: colors.ink,
        borderCurve: "continuous",
        borderRadius: small ? radii.card : 14,
        height: small ? 38 : 46,
        justifyContent: "center",
        opacity: pressed ? 0.8 : 1,
        width: small ? 112 : 150,
      })}
    >
      <Text style={{ color: colors.background, fontFamily: fonts.sansBold, fontSize: small ? 13 : 15 }}>Reload</Text>
    </Pressable>
  );
}

function FailedBody({
  fonts,
  onReload,
  title,
}: {
  fonts: Fonts;
  onReload: () => void;
  title: string;
}) {
  return (
    <View style={{ alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg }}>
      <WarningArt size={68} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 21, lineHeight: 27, maxWidth: 320, textAlign: "center" }}>
        {title}
      </Text>
      <View style={{ marginTop: spacing.xs }}>
        <ReloadButton fonts={fonts} onPress={onReload} />
      </View>
    </View>
  );
}

/** A refusal says why. Anything else (down, slow, broken) is the one sentence. */
function failedTitle(error: unknown) {
  return isRefusal(error) ? errorMessage(error) : LOAD_FAILED_TITLE;
}

/** The server answered and said no, which reloading alone will not change. */
function isRefusal(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? (error as { status: unknown }).status : null;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** The reload of the failure the focused screen is showing, for the whole-app screen. */
let focusedFailure: (() => void) | null = null;
const failureListeners = new Set<() => void>();

function setFocusedFailure(reload: (() => void) | null) {
  focusedFailure = reload;
  failureListeners.forEach((listener) => listener());
}

function subscribeToFailure(listener: () => void) {
  failureListeners.add(listener);
  return () => void failureListeners.delete(listener);
}

/**
 * A screen's main read failed. The screen is not shown at all (user, 2026-10-31):
 * this hands the failure to AppFailureOverlay, which covers it, tab bar included.
 * A refusal stays here, under the header, because it says why.
 */
export function LoadFailed({ error, onReload }: { error?: unknown; onReload: () => void }) {
  const { fonts } = useTheme();
  const refused = isRefusal(error);
  const reload = useRef(onReload);
  reload.current = onReload;

  useFocusEffect(
    useCallback(() => {
      if (refused) {
        return undefined;
      }
      setFocusedFailure(() => reload.current());
      return () => setFocusedFailure(null);
    }, [refused]),
  );

  if (!refused) {
    return null;
  }
  return (
    <View style={{ justifyContent: "center", minHeight: Math.round(Dimensions.get("window").height * 0.6) }}>
      <FailedBody fonts={fonts} onReload={onReload} title={failedTitle(error)} />
    </View>
  );
}

/** For one list or section failing on a screen that has other things on it, and inside sheets. */
export function LoadFailedCard({ error, onReload }: { error?: unknown; onReload: () => void }) {
  const { fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <WarningArt size={40} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 19, textAlign: "center" }}>
        {failedTitle(error)}
      </Text>
      <ReloadButton fonts={fonts} onPress={onReload} small />
    </View>
  );
}

function FullScreen({
  fonts,
  onReload,
  title,
}: {
  fonts: Fonts;
  onReload: () => void;
  title: string;
}) {
  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <FailedBody fonts={fonts} onReload={onReload} title={title} />
      </View>
    </View>
  );
}

/** A whole screen that could not load, in place of the screen. */
export function LoadFailedScreen({ failure }: { failure: LoadFailure }) {
  const { fonts } = useTheme();
  return <FullScreen fonts={fonts} onReload={failure.reload} title={failedTitle(failure.error)} />;
}

/** How often to ask whether the server is back, while it cannot be reached. */
const SERVER_CHECK_MS = 5_000;

/**
 * The one failure screen over the whole app, above the navigator: when the server
 * cannot be reached at all, whichever screen is open and whatever it has cached,
 * or when the focused screen's main read failed.
 *
 * <p>It covers rather than replaces, so a form someone was filling in is still
 * there when the server comes back. Most screens have no timer of their own to
 * notice that, so while the server is unreachable this asks it directly, and any
 * answer at all lifts the screen.
 */
export function AppFailureOverlay() {
  const { fonts } = useTheme();
  const dispatch = useAppDispatch();
  const unreachable = useAppSelector(
    (state) => Boolean(state.auth.accessToken) && state.connection.unansweredReads >= UNREACHABLE_AFTER,
  );
  const apiBaseUrl = useAppSelector((state) => state.appConfig.apiBaseUrl.trim().replace(/\/$/, ""));
  const screenReload = useSyncExternalStore(subscribeToFailure, () => focusedFailure);
  const checking = useRef(false);

  // One question at a time, so one outage ends in one reset. A second reset aborts the
  // reads the first has just started, which the server logs as dropped connections.
  const checkServer = useCallback(() => {
    if (checking.current) {
      return;
    }
    checking.current = true;
    // no-cors: only whether anything answered matters, never what it said.
    fetch(`${apiBaseUrl}/actuator/health`, { mode: "no-cors" })
      .then(() => {
        dispatch(serverAnswered());
        dispatch(api.util.resetApiState());
      })
      .catch(() => undefined)
      .finally(() => {
        checking.current = false;
      });
  }, [apiBaseUrl, dispatch]);

  useEffect(() => {
    if (!unreachable) {
      return undefined;
    }
    const timer = setInterval(checkServer, SERVER_CHECK_MS);
    return () => clearInterval(timer);
  }, [checkServer, unreachable]);

  if (!unreachable && !screenReload) {
    return null;
  }
  return (
    <View style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 1000 }}>
      <FullScreen
        fonts={fonts}
        // The answer starts every read again, which makes the open screen ask and drops
        // the cached figures that were standing in for an answer.
        onReload={() => (unreachable ? checkServer() : screenReload?.())}
        title={LOAD_FAILED_TITLE}
      />
    </View>
  );
}

/**
 * No hooks that need the app's providers: Expo Router draws the root layout's
 * ErrorBoundary OUTSIDE the root layout, so the store is not there.
 */
export function CrashedScreen({ onReload }: { error?: Error; onReload: () => void }) {
  return (
    <FullScreen
      // The one sentence and nothing technical, even while developing (user,
      // 2026-11-01). React logs the crash's message to the console.
      fonts={staffFonts}
      onReload={onReload}
      title={LOAD_FAILED_TITLE}
    />
  );
}

/**
 * Wraps every screen, so one that throws while rendering is replaced on its own.
 * There is no back arrow on the failure screen: it raised an unhandled GO_BACK
 * error, so it was removed (user, 2026-11-01).
 */
export class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? (
      <CrashedScreen error={this.state.error} onReload={() => this.setState({ error: null })} />
    ) : (
      this.props.children
    );
  }
}

type Loadable = { currentData?: unknown; error?: unknown; isError?: boolean; refetch?: () => unknown };

export type LoadFailure = { error: unknown; reload: () => void };

/**
 * The failure a screen should stop for, or null. Pass the reads the screen cannot
 * be drawn without.
 *
 * <p>Only a read with nothing to show counts: one that fails on a refresh keeps
 * its data. A refusal does not count either, because several reads are refused
 * as an ordinary answer (a tenant lookup on an owner, a section a manager cannot
 * see) and those screens already say what that means.
 */
export function loadFailure(...queries: Loadable[]): LoadFailure | null {
  const failed = queries.filter((query) => query.isError && query.currentData === undefined && !isRefusal(query.error));
  if (failed.length === 0) {
    return null;
  }
  return {
    error: failed[0].error,
    reload: () => failed.forEach((query) => void query.refetch?.()),
  };
}
