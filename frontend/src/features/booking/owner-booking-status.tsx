import { Text, View } from "react-native";
import { CalendarCheck, CircleCheck, CircleX, Clock3, Undo2, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { BookingTokenStatusIcon } from "@/components/booking-vector-icons";
import { BOOKING_STATUS, BOOKING_TOKEN_STATUS } from "@/features/booking/booking-ui";
import type { BookingStatus, BookingTokenStatus } from "@/store/services/booking-api";
import { useTheme } from "@/theme/use-theme";

type ChipTone = "warning" | "success" | "danger" | "neutral" | "primary" | "accent";
type Theme = ReturnType<typeof useTheme>;

const STATUS_ICON: Record<BookingStatus, ComponentType<LucideProps>> = {
  AWAITING_HANDLER: Clock3,
  AWAITING_TENANT: Clock3,
  // A rupee in a circle. A wallet is the Service balance's mark, and a token is not held in one (user, 2026-10-11).
  AWAITING_TOKEN: BookingTokenStatusIcon,
  TOKEN_RECEIVED: CircleCheck,
  CONFIRMED: CalendarCheck,
  CANCELLED: CircleX,
  EXPIRED: Clock3,
  MOVED_IN: CircleCheck,
};

/** The shorter word a list card uses, where the chip shares the name's row (user, 2026-10-11: "just Awaiting"). */
const SHORT_LABEL: Partial<Record<BookingStatus, string>> = { AWAITING_HANDLER: "Awaiting" };

const TOKEN_STATUS_ICON: Record<BookingTokenStatus, ComponentType<LucideProps>> = {
  NOT_REQUIRED: CircleCheck,
  DUE: BookingTokenStatusIcon,
  CLAIMED: Clock3,
  NOT_RECEIVED: CircleX,
  // Money in hand: a tick (user, 2026-10-11).
  RECEIVED: CircleCheck,
  ADJUSTED: CircleCheck,
  KEPT: BookingTokenStatusIcon,
  REFUND_DUE: Undo2,
  DECISION_PENDING: Clock3,
};

/** The word a token's chip can carry at the end of a name's row. The filter keeps the full one. */
const SHORT_TOKEN_LABEL: Partial<Record<BookingTokenStatus, string>> = {};

/** The chip itself: a mark and a word on a soft tint. One drawing for a booking's status and a token's. */
function chip(theme: Theme, accessibilityLabel: string, Icon: ComponentType<LucideProps>, label: string, tone: ChipTone) {
  const { colors, fonts } = theme;
  const palette = {
    warning: [colors.warningSoft, colors.warningText],
    success: [colors.successSoft, colors.successText],
    danger: [colors.dangerSoft, colors.danger],
    neutral: [colors.neutralSoft, colors.neutralText],
    primary: [colors.primarySoft, colors.primaryDeep],
    accent: [colors.accentSoft, colors.warningText],
  };
  const [backgroundColor, color] = palette[tone];
  return <View accessibilityLabel={accessibilityLabel} style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor, borderRadius: 999, flexDirection: "row", gap: 5, paddingHorizontal: 10, paddingVertical: 7 }}>
    <Icon color={color} size={15} strokeWidth={2.2} />
    <Text style={{ color, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{label}</Text>
  </View>;
}

/**
 * Where a booking stands, in the property's words, as the chip the tenant's
 * booking screen draws: a mark and a word on a soft tint. One chip for the
 * owner's Review booking screen and for every card in the owner's list, so a
 * request reads the same in both places (user, 2026-10-11).
 */
export function OwnerBookingStatus({ short, status }: { short?: boolean; status: BookingStatus }) {
  const theme = useTheme();
  const { label: full, tone } = BOOKING_STATUS[status] ?? { label: "Booking updated", tone: "neutral" as const };
  const label = (short ? SHORT_LABEL[status] : undefined) ?? full;
  // A live backend update can introduce a status before Fast Refresh replaces this module.
  const Icon = STATUS_ICON[status] ?? Clock3;
  return chip(theme, `Booking status: ${full}`, Icon, label, tone);
}

/**
 * Where a token stands, as the very chip a booking's status is drawn in (user,
 * 2026-10-11: "make the Received token status chip like the booking status
 * chip with a tick"). On the Token record screen the two chips sit on one
 * card, so they are one shape and each says what it is about.
 */
export function OwnerTokenStatus({ status }: { status: BookingTokenStatus }) {
  const theme = useTheme();
  const { label: full, tone } = BOOKING_TOKEN_STATUS[status] ?? { label: "Token updated", tone: "neutral" as const };
  return chip(theme, `Token status: ${full}`, TOKEN_STATUS_ICON[status] ?? Clock3, SHORT_TOKEN_LABEL[status] ?? full, tone);
}
