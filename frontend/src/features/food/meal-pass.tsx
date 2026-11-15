import { useEffect, useState } from "react";
import { SheetCloseButton } from "@/components/help-modal-header";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { HighlightPanel, highlightPalette } from "@/components/highlight-card";
import { MealGlassPanel, MealSkyCard, mealSkyMuted } from "@/features/food/serving-meal-card";
import { FitText } from "@/components/fit-text";
import { ModalTitle } from "@/components/modal-title";
import { ModalTitleRule } from "@/components/modal-title-rule";
import { formatMealTime, formatMealWindow, MEAL_LABEL, MealGlyph } from "@/features/food/food-ui";
import { formatPassCode, indiaDate, indiaMinutesNow, timeToMinutes } from "@/features/visits/visit-clock";
import { useGetMyMealPassQuery, type MealPass } from "@/store/services/food-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const QR_SIZE = 190;
const QR_CARD_WIDTH = QR_SIZE + spacing.md * 2 + 2;
const SAVED_PASS_KEY = "meal-pass";
/** The pass still scans this long after the meal ends. The server decides, this only keeps a saved one honest. */
const GRACE_MINUTES = 10;

/** "12:41 PM" in India, from a server time. */
export function formatMealMoment(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })
    .format(new Date(iso))
    .toUpperCase();
}

function stillUsable(pass: MealPass) {
  return pass.date === indiaDate() && indiaMinutesNow() < timeToMinutes(pass.endTime) + GRACE_MINUTES;
}

/**
 * The tenant's meal pass, read again every 30 seconds so it appears when the
 * meal starts and turns to recorded when it is scanned.
 *
 * <p>An open pass is also kept on the phone. Dining rooms have bad signal, and
 * losing it at the counter should not lose the pass (user, 2026-11-01). Once it
 * has been opened, the saved copy stands in while the server cannot be reached.
 */
export function useMyMealPass(skip = false) {
  const query = useGetMyMealPassQuery(undefined, { pollingInterval: 30_000, skip });
  const [saved, setSaved] = useState<MealPass | null>(null);
  const live = query.data;

  useEffect(() => {
    if (live?.state === "OPEN") {
      setSaved(live);
      AsyncStorage.setItem(SAVED_PASS_KEY, JSON.stringify(live)).catch(() => undefined);
    }
  }, [live]);

  useEffect(() => {
    if (!query.isError) {
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(SAVED_PASS_KEY)
      .then((text) => {
        if (!cancelled && text) {
          setSaved(JSON.parse(text) as MealPass);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [query.isError]);

  if (query.isError && saved && stillUsable(saved)) {
    return saved;
  }
  return live ?? null;
}

/**
 * The tenant's card for their meal pass. Nothing at all when they have no pass
 * today: no plan, no meal left, or the property is not recording attendance.
 * Home leaves out the wait for an upcoming meal, the food screen shows it.
 */
export function MealPassCard({ showUpcoming = false, skip = false }: { showUpcoming?: boolean; skip?: boolean }) {
  const { colors, fonts } = useTheme();
  const pass = useMyMealPass(skip);
  const [open, setOpen] = useState(false);

  if (!pass || (pass.state === "UPCOMING" && !showUpcoming)) {
    return null;
  }
  const meal = MEAL_LABEL[pass.mealType];
  const palette = { ink: "#FFFFFF", muted: mealSkyMuted(pass.mealType) };
  const title =
    pass.state === "OPEN" ? `${meal}, serving now` : pass.state === "RECORDED" ? `${meal} recorded` : `${meal} meal pass`;
  const line =
    pass.state === "OPEN"
      ? "Show your meal pass at the counter before you are served."
      : pass.state === "RECORDED" && pass.attendedAt
        ? `Your meal pass was scanned at ${formatMealMoment(pass.attendedAt)}.`
        : `Your meal pass opens at ${formatMealTime(pass.startTime)}.`;

  return (
    // The meal's own sky, not always the night (user, 2026-11-09).
    <MealSkyCard mealType={pass.mealType}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.08)",
            borderColor: "rgba(255,255,255,0.22)",
            borderRadius: 999,
            borderWidth: 1,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <MealGlyph color="#FFE4AA" meal={pass.mealType} size={20} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <FitText numberOfLines={1} style={{ color: palette.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {title}
          </FitText>
          <Text style={{ color: palette.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>{line}</Text>
        </View>
        {pass.state === "RECORDED" ? (
          <MaterialCommunityIcons color="#A9E9CE" name="check-circle" size={22} />
        ) : null}
      </View>
      {pass.state === "OPEN" ? (
        <AnimatedPressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ minHeight: 44, justifyContent: "center" }}>
          <MealGlassPanel compact>
            <MaterialCommunityIcons color="#FFE4AA" name="qrcode" size={18} />
            <Text style={{ color: palette.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>Show meal pass</Text>
          </MealGlassPanel>
        </AnimatedPressable>
      ) : null}
      {open && pass.state === "OPEN" ? <MealPassSheet onClose={() => setOpen(false)} pass={pass} /> : null}
    </MealSkyCard>
  );
}

/**
 * The pass itself, the visitor pass's twin (user, 2026-11-01): the property's
 * name, a grey box with the meal and its time, the QR, and a six digit code
 * under it for when it cannot be scanned. The close sits above the sheet. The
 * QR stays on white whatever the theme, because a scanner reads dark on light.
 */
function MealPassSheet({ onClose, pass }: { onClose: () => void; pass: MealPass }) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => (
        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: insets.top + spacing.md }}>
          <SheetCloseButton onClose={() => dismiss()} />
          <HighlightPanel motif={false} variant="night"
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              padding: 0,
              flexShrink: 1,
            }}
          >
            <ScrollView
              bounces={false}
              contentContainerStyle={{
                paddingBottom: insets.bottom + spacing.md,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.lg,
              }}
              overScrollMode="never"
              showsVerticalScrollIndicator={false}
            >
              <View style={{ alignItems: "center", gap: spacing.md }}>
                <ModalTitle
                  style={{ color: highlightPalette.night.ink, fontFamily: fonts.display, fontSize: 22, lineHeight: 28, textAlign: "center" }}
                >
                  {pass.propertyName}
                </ModalTitle>
                <ModalTitleRule />
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.09)",
                    borderCurve: "continuous",
                    borderRadius: radii.card,
                    gap: 2,
                    minWidth: QR_CARD_WIDTH,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  {/* The plan sits beside the meal, not under the code (user, 2026-11-13). */}
                  <Text style={{ color: "#FFE4AA", fontFamily: fonts.sansBold, fontSize: 15, textAlign: "center" }}>
                    {MEAL_LABEL[pass.mealType]}
                    {pass.profileName ? <Text style={{ color: highlightPalette.night.muted, fontFamily: fonts.sansMedium }}>{`  ·  ${pass.profileName}`}</Text> : null}
                  </Text>
                  <Text style={{ color: highlightPalette.night.muted, fontFamily: fonts.sansMedium, fontSize: 14 }}>
                    {formatMealWindow(pass.startTime, pass.endTime)}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderColor: colors.border,
                    borderCurve: "continuous",
                    borderRadius: radii.card,
                    borderWidth: 1,
                    padding: spacing.md,
                  }}
                >
                  <QRCode backgroundColor="#FFFFFF" color="#000000" size={QR_SIZE} value={pass.token ?? ""} />
                </View>
                <Text
                  accessibilityLabel={`Pass code ${(pass.code ?? "").split("").join(" ")}`}
                  style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 28, letterSpacing: 4 }}
                >
                  {formatPassCode(pass.code ?? "")}
                </Text>
                <Text style={[type.description, { color: highlightPalette.night.muted, textAlign: "center" }]}>
                  Show this at the counter. If it cannot be scanned, use the code to record attendance.
                </Text>
              </View>
            </ScrollView>
          </HighlightPanel>
        </View>
      )}
    </BottomSheetModal>
  );
}
