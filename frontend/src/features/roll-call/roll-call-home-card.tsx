import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { ActiveTenancyArt, OnNoticeTenancyArt, RollCallArt } from "@/components/control-art";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  rollCallTime,
  useCheckInRollCallMutation,
  useGetMyRollCallQuery,
  useMarkRollCallPresentMutation,
} from "@/store/services/roll-call-api";
import { cardShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { probePresence } from "./presence-probe";

/**
 * The tenant's roll call card (user, 2026-11-09, 2026-11-15), on Home directly
 * under the first card, only while the window is open.
 *
 * <p>With automatic check-in on, opening the app checks the property's WiFi and
 * then the location, once: a match marks them present and the card says when.
 * No background check, and a failed check marks nothing. Otherwise, or when the
 * check fails, it asks "Are you present today?" with Mark present. A declared
 * stay out reads "You are away tonight".
 */
export function RollCallHomeCard() {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // Checked again on return to the app, so a window that opens while it is in the background shows.
  const query = useGetMyRollCallQuery(undefined, { pollingInterval: 5 * 60_000, refetchOnFocus: true });
  const [checkIn] = useCheckInRollCallMutation();
  const [markPresent, markState] = useMarkRollCallPresentMutation();
  const [checking, setChecking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const tried = useRef<string | null>(null);
  const today = query.data;
  const showing = Boolean(today?.available && today.open);

  // One automatic try per night per app run, never a loop.
  useEffect(() => {
    if (!today || !showing || !today.autoCheckIn || today.state !== "NOT_MARKED" || tried.current === today.night) return;
    tried.current = today.night;
    setChecking(true);
    void probePresence()
      .then((seen) => checkIn(seen).unwrap())
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [checkIn, showing, today]);

  if (!today || !showing) return null;

  async function present() {
    try {
      await markPresent().unwrap();
      toast.success("Marked present");
    } catch (caught) {
      setRefusal(errorMessage(caught));
    }
  }

  const marked = today.state === "PRESENT";
  const away = today.state === "AWAY" || today.state === "AWAY_DECLARED";
  const title = today.state === "ABSENT"
    ? "Marked absent tonight"
    : away
      ? "You are away tonight"
      : marked
        ? today.method === "SELF" ? `Marked present at ${rollCallTime(today.markedAt)}` : `Attendance marked at ${rollCallTime(today.markedAt)}`
        : checking ? "Checking your attendance" : "Are you present today?";
  const detail = today.state === "ABSENT"
    ? "The warden marked this. Speak to them if it is wrong."
    : away
      ? today.state === "AWAY_DECLARED" ? "Your stay out covers tonight." : "The warden marked you away."
      : marked
        ? today.method === "WIFI" ? "Checked on the property's WiFi." : today.method === "LOCATION" ? "Checked by your location." : today.method === "WARDEN" ? "Marked by the warden." : "You marked yourself present."
        : checking ? "Looking for the property's WiFi or your location." : "Mark your attendance for tonight's roll call.";

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {marked ? <ActiveTenancyArt size={44} /> : away ? <OnNoticeTenancyArt size={44} /> : <RollCallArt size={44} />}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{title}</Text>
          <Text style={[type.caption, { color: colors.muted }]}>{detail}</Text>
        </View>
        {checking ? <ActivityIndicator color={colors.muted} /> : null}
      </View>
      {!marked && !away && today.state !== "ABSENT" && !checking ? (
        <View style={{ flexDirection: "row" }}>
          <ActionButton label={markState.isLoading ? "Marking" : "Mark present"} onPress={() => void present()} />
        </View>
      ) : null}
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </View>
  );
}
