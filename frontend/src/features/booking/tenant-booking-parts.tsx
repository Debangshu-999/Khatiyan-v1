import { useState, type ComponentType, type ReactNode } from "react";
import { Image, Text, View, type DimensionValue } from "react-native";
import { CalendarCheck, CircleCheck, CircleX, Clock3, ImageOff, type LucideProps } from "lucide-react-native";

import { BookingTokenStatusIcon } from "@/components/booking-vector-icons";
import { RoomAmenityRow } from "@/features/booking/booking-form-parts";
import type { RoomAmenity } from "@/store/services/property-api";

import type { BookingStatus } from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Tenant-facing words; the underlying status and capabilities remain the server's. */
const STATUS = {
  AWAITING_HANDLER: { label: "Awaiting handler", tone: "warning", icon: Clock3 },
  AWAITING_TENANT: { label: "Offer received", tone: "success", icon: CircleCheck },
  // A rupee in a circle, as on the property's chip. A wallet is the Service balance's mark (user, 2026-10-11).
  AWAITING_TOKEN: { label: "Token due", tone: "warning", icon: BookingTokenStatusIcon },
  TOKEN_RECEIVED: { label: "Token received", tone: "success", icon: CircleCheck },
  CONFIRMED: { label: "Confirmed", tone: "success", icon: CalendarCheck },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: CircleX },
  EXPIRED: { label: "Expired", tone: "neutral", icon: Clock3 },
  MOVED_IN: { label: "Moved in", tone: "success", icon: CircleCheck },
} as const;

export function TenantBookingStatus({ status }: { status: BookingStatus }) {
  const { colors, fonts } = useTheme();
  const { label, tone, icon: Icon } = STATUS[status] ?? { label: "Booking updated", tone: "neutral", icon: Clock3 };
  const palette = {
    warning: [colors.warningSoft, colors.warningText],
    success: [colors.successSoft, colors.successText],
    danger: [colors.dangerSoft, colors.danger],
    neutral: [colors.neutralSoft, colors.neutralText],
  };
  const [backgroundColor, color] = palette[tone];
  return <View accessibilityLabel={`Booking status: ${label}`} style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor, borderRadius: 999, flexDirection: "row", gap: 5, paddingHorizontal: 10, paddingVertical: 7 }}>
    <Icon color={color} size={15} strokeWidth={2.2} />
    <Text style={{ color, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{label}</Text>
  </View>;
}

/**
 * A soft, full-width fact row, as in the tenant booking reference.
 *
 * <p>Grey unless told otherwise. "warning" is the notice board's yellow, for a
 * fact that is itself the thing to act on, such as when a token falls due.
 *
 * <p>{@code iconInset} is how far in from the band's edge its mark starts. A
 * band under a card's own heading mark passes a small one, so the two marks
 * share a centre line.
 */
export function BookingInfoBand({ children, icon: Icon, iconGap = spacing.md, iconInset = spacing.md, tone = "neutral" }: { children: ReactNode; icon?: ComponentType<LucideProps>; iconGap?: number; iconInset?: number; /** danger: pale red, as a confirmed booking past its move-in shows (user, 2026-10-27). */ tone?: "neutral" | "warning" | "danger" }) {
  const { colors } = useTheme();
  const [fill, ink] = tone === "warning" ? [colors.warningSoft, colors.warningText] : tone === "danger" ? [colors.dangerSoft, colors.danger] : [colors.neutralSoft, colors.muted];
  return <View style={{ alignItems: "center", backgroundColor: fill, borderRadius: 10, flexDirection: "row", gap: iconGap, paddingLeft: iconInset, paddingRight: spacing.md, paddingVertical: spacing.sm, minHeight: 42 }}>
    {Icon ? <Icon color={ink} size={21} strokeWidth={1.9} /> : null}
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>{children}</View>
  </View>;
}

/** Two compact facts with a rule between them, without nesting another card. */
export function BookingFactPair({ left, right }: { left: ReactNode; right: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: "row", gap: spacing.md }}>
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{left}</View>
    <View style={{ alignSelf: "stretch", backgroundColor: colors.border, width: 1 }} />
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{right}</View>
  </View>;
}

/**
 * One fact on a soft grey box. The Offer card holds four, two to a row with a
 * gap between each, so the white between them reads as a plus (user,
 * 2026-10-11). They replaced two ruled pairs with a line between the rows.
 */
export function BookingFactBox({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.neutralSoft, borderRadius: 10, flex: 1, gap: 4, minWidth: 0, padding: spacing.sm }}>{children}</View>;
}

export function BookingCardRule() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, height: 1 }} />;
}

/** The real room-type photo, with a no-image mark on the same grey square when absent. */
export function BookingRoomPhoto({ imageUrls, height = 72, width = 72 }: { imageUrls: string[]; height?: number; width?: DimensionValue }) {
  const { colors } = useTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const uri = imageUrls[0]?.trim() || null;
  return <View accessibilityLabel={uri && failedUri !== uri ? "Booked room type photo" : "No room type photo"} style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderRadius: 10, height, justifyContent: "center", overflow: "hidden", width }}>
    {uri && failedUri !== uri ? <Image source={{ uri }} resizeMode="cover" onError={() => setFailedUri(uri)} style={{ height: "100%", width: "100%" }} /> : <ImageOff color={colors.muted} size={25} strokeWidth={1.6} />}
  </View>;
}

/** Warm-tinted initials for this detail card only; other modules retain their avatars. */
export function BookingInitialsAvatar({ name }: { name: string }) {
  const { colors, fonts } = useTheme();
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
  return <View style={{ alignItems: "center", backgroundColor: `${colors.accent}12`, borderRadius: 999, height: 56, justifyContent: "center", width: 56 }}>
    <Text style={{ color: colors.accent, fontFamily: fonts.sansBold, fontSize: 20, height: 56, includeFontPadding: false, lineHeight: 56, textAlign: "center", textAlignVertical: "center", width: "100%" }}>{initials}</Text>
  </View>;
}

/** The booking flow's own amenity row, hidden completely when nothing is listed. */
export function BookingRoomAmenities({ amenities, custom }: { amenities: RoomAmenity[]; custom: string[] }) {
  if (!amenities.length && !custom.length) return null;
  return <RoomAmenityRow room={{ amenities, customAmenities: custom }} />;
}
