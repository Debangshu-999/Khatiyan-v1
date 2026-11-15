import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CalendarDays, DoorOpen, UserRound } from "lucide-react-native";

import { Card } from "@/components/card";
import { FitText } from "@/components/fit-text";
import { StatusPill } from "@/components/status-pill";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export const reservationPalette = {
  header: ["#132F45", "#264D62"],
  headerInk: "#FFFFFF",
  headerMuted: "#D9E7EE",
  ink: "#18384E",
  muted: "#5C6F7B",
  gold: "#E2C996",
  icon: "#916B2E",
  line: "#DEE5E8",
  footer: "#F6F8FA",
} as const;

/** Confirmed bookings get a reservation summary; pending requests keep their status card. */
export function ConfirmedBookingTicket({ referenceCode, roomNumber, moveInDate, handlerName }: {
  referenceCode: string; roomNumber: string; moveInDate: string; handlerName?: string | null;
}) {
  const { fonts } = useTheme();
  const palette = reservationPalette;

  return <Card style={{ gap: 0, padding: 0, borderColor: palette.line }}>
    <View style={{ borderRadius: radii.card, overflow: "hidden" }}>
      <LinearGradient
        colors={palette.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 }}
      >
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text style={{ color: palette.headerMuted, fontFamily: fonts.sansSemiBold, fontSize: 10, letterSpacing: 1.1 }}>RESERVATION</Text>
          <FitText selectable numberOfLines={1} minimumFontScale={0.65} style={{ color: palette.headerInk, fontFamily: fonts.display, fontSize: 21, lineHeight: 28 }}>{referenceCode}</FitText>
        </View>
        <StatusPill label="Confirmed" tone="success" />
      </LinearGradient>
      <View accessible={false} style={{ backgroundColor: palette.gold, height: 2 }} />

      <View style={{ alignItems: "center", backgroundColor: "#FFFFFF", flexDirection: "row", padding: spacing.md }}>
        <View style={{ flex: 1, gap: 7, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
            <DoorOpen color={palette.icon} size={16} />
            <Text style={{ color: palette.muted, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>Room</Text>
          </View>
          <FitText numberOfLines={1} minimumFontScale={0.7} style={{ color: palette.ink, fontFamily: fonts.display, fontSize: 28, lineHeight: 34 }}>{roomNumber}</FitText>
        </View>
        <View accessible={false} style={{ alignSelf: "stretch", backgroundColor: palette.line, marginHorizontal: spacing.md, width: 1 }} />
        <View style={{ alignItems: "flex-end", backgroundColor: "transparent", flexShrink: 1, gap: 7, marginLeft: "auto", maxWidth: "65%", minWidth: 140 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
            <CalendarDays color={palette.icon} size={16} />
            <Text style={{ color: palette.muted, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>Move-in</Text>
          </View>
          <Text style={{ color: palette.ink, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, lineHeight: 26, textAlign: "right" }}>{bookingDateLabel(moveInDate)}</Text>
        </View>
      </View>

      {handlerName ? <View style={{ alignItems: "center", backgroundColor: palette.footer, borderTopColor: palette.line, borderTopWidth: 1, flexDirection: "row", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 }}>
        <UserRound color={palette.muted} size={14} />
        <Text style={{ color: palette.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 18 }}>Handled by <Text style={{ color: palette.ink, fontFamily: fonts.sansSemiBold }}>{handlerName}</Text></Text>
      </View> : null}
    </View>
  </Card>;
}
