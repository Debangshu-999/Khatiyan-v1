import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Globe, Laptop, Monitor, Smartphone, Tablet, type LucideProps } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useAppSelector } from "@/store/hooks";
import { useListSessionsQuery, useRevokeSessionMutation, type UserSession } from "@/store/services/auth-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Where this account is signed in, and a way to end any of it.
 *
 * <p>The current device shows "This device" instead of a button. The server
 * refuses to revoke the caller's own session anyway — signing yourself out is a
 * different action with different consequences — so this is the UI agreeing with
 * a rule that is enforced either way, not the rule itself.
 */
export function SignedInDevices() {
  const { colors, type } = useTheme();
  const toast = useToast();
  // Sessions change on OTHER devices, so a cached list goes stale without
  // anything happening here to invalidate it. Re-asked whenever this screen is
  // mounted or refocused; pull-to-refresh clears the tag as well.
  const sessionsQuery = useListSessionsQuery(undefined, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });
  const { refetch } = sessionsQuery;
  // RTK Query refetchOnFocus watches the APP regaining focus, not this screen.
  // Walking back here from another screen never leaves the foreground, so
  // without this the list is whatever it was when the screen last mounted.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const [revokeSession, revokeState] = useRevokeSessionMutation();
  const [pending, setPending] = useState<UserSession | null>(null);
  // Refusals here come from the server — a session already gone, or the
  // caller's own. Nothing on screen to correct, so they interrupt.
  const opErrors = useFormErrors<never>();

  // This device first, whatever order the server returned. The countdown above
  // the list describes THIS session, and it only reads as belonging to the top
  // row if the top row is the one it is talking about.
  const sessions = useMemo(() => {
    const all = sessionsQuery.data ?? [];
    return [...all].sort((left, right) => Number(right.current) - Number(left.current));
  }, [sessionsQuery.data]);

  async function confirmRevoke() {
    const target = pending;
    setPending(null);
    if (!target) {
      return;
    }
    try {
      await revokeSession(target.id).unwrap();
      toast.success(`${target.deviceLabel ?? "That device"} was signed out.`);
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught) || "Could not sign that device out. Try again.");
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {sessionsQuery.isLoading ? <SkeletonList /> : null}

      {!sessionsQuery.isLoading && sessions.length === 0 ? (
        <Card>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            No other devices are signed in.
          </Text>
        </Card>
      ) : null}

      {sessions.map((session) => (
        <DeviceRow
          busy={revokeState.isLoading}
          key={session.id}
          onSignOut={() => setPending(session)}
          session={session}
        />
      ))}

      {pending ? (
        <ConfirmDialog
          confirmLabel="Sign out"
          destructive
          message={`${pending.deviceLabel ?? "That device"} will need to sign in again.`}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmRevoke()}
          title="Sign out this device?"
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}

function DeviceRow({
  busy,
  onSignOut,
  session,
}: {
  busy: boolean;
  onSignOut: () => void;
  session: UserSession;
}) {
  const { colors, type } = useTheme();
  const DeviceIcon = iconFor(session.platform);

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <DeviceIcon color={colors.ink} size={20} strokeWidth={2.2} />

        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink }]}>
            {session.deviceLabel ?? "Unknown device"}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {session.current ? "Active now" : `Signed in ${formatRelative(session.createdAt)}`}
          </Text>
        </View>

        {session.current ? (
          <Text style={[type.action, { color: colors.jade }]}>
            This Device
          </Text>
        ) : (
          <AnimatedPressable
            accessibilityLabel={`Sign out ${session.deviceLabel ?? "this device"}`}
            accessibilityRole="button"
            disabled={busy}
            onPress={onSignOut}
            style={{
              alignItems: "center",
              backgroundColor: colors.danger,
              borderRadius: 999,
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
              paddingHorizontal: spacing.md,
              paddingVertical: 7,
            }}
          >
            {/* Literal white, not colors.onPrimary: that token is near-black in
                the dark theme and would vanish into the red fill. */}
            <Text style={[type.action, { color: "#FFFFFF" }]}>
              Sign Out
            </Text>
          </AnimatedPressable>
        )}
      </View>
    </Card>
  );
}

/**
 * How long this session has left, counted down from the token's own expiry.
 *
 * <p>Read from the JWT already in memory rather than asked of the server: the
 * `exp` claim IS the deadline, so this cannot drift from the truth and costs no
 * request. It ticks once a minute — a second-by-second countdown on a one-hour
 * session is a distraction, not information.
 */
export function SessionCountdown() {
  const { colors, type } = useTheme();
  const token = useAppSelector((state) => state.auth.accessToken);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const expiresAt = token ? tokenExpiryMs(token) : null;
  if (expiresAt == null) {
    return null;
  }

  const remaining = expiresAt - now;

  return (
    <Text style={[type.caption, { color: remaining <= 0 ? colors.danger : colors.muted }]}>
      {remaining <= 0 ? "Session has ended. Sign in again." : `Session ends in ${formatDuration(remaining)}`}
    </Text>
  );
}

/**
 * The `exp` claim, in milliseconds.
 *
 * <p>Decodes the payload WITHOUT verifying the signature, which is correct here
 * and would be wrong anywhere else: the client cannot verify a signature it has
 * no key for, and this drives a label rather than a decision. The server checks
 * the real thing on every request.
 */
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
    // A token we cannot read is not a crash — it just means no countdown.
    return null;
  }
}

/**
 * The glyph for a device, chosen by form factor rather than OS — "android" says
 * nothing about whether the thing in someone's hand is a phone or a tablet.
 *
 * <p>Falls back to the phone for anything unrecognised, including the raw
 * `Platform.OS` values older sessions were recorded with.
 */
function iconFor(platform: string | null): ComponentType<LucideProps> {
  switch (platform) {
    case "web":
      return Globe;
    case "tablet":
      return Tablet;
    case "desktop":
      return Monitor;
    case "tv":
      return Monitor;
    case "macos":
    case "windows":
      return Laptop;
    default:
      return Smartphone;
  }
}

function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function formatRelative(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })
    .format(new Date(iso));
}
