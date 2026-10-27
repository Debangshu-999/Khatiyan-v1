import type { ReactNode } from "react";
import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/** Black status drawings, with the same optical size as the billing vectors. */
function BookingMark({ children, size = 32, strokeColor = "#000000" }: LucideProps & { children: ReactNode; strokeColor?: LucideProps["color"] }) {
  return (
    <Svg width={Number(size)} height={Number(size)} viewBox="0 0 64 64" fill="none" stroke={strokeColor} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      {children}
    </Svg>
  );
}

/** The reference card's two-building property silhouette, with its sloped roof. */
export function BookingPropertyIcon(props: LucideProps) {
  return <BookingMark {...props} strokeColor={props.color ?? "currentColor"}>
    <Path d="M11 56V13a3 3 0 0 1 4-3l20 6a3 3 0 0 1 2 3v37M37 29l12 4a3 3 0 0 1 2 3v20M6 56h51" />
    <Rect x={18} y={21} width={4} height={6} rx={1} fill={props.color ?? "currentColor"} stroke="none" />
    <Rect x={28} y={24} width={4} height={6} rx={1} fill={props.color ?? "currentColor"} stroke="none" />
    <Rect x={18} y={33} width={4} height={6} rx={1} fill={props.color ?? "currentColor"} stroke="none" />
    <Rect x={28} y={36} width={4} height={6} rx={1} fill={props.color ?? "currentColor"} stroke="none" />
    <Path d="M21 56V46h7v10M44 40v4M44 49v3" />
  </BookingMark>;
}

/** A property handler beside the request that needs reviewing. */
export function BookingAwaitingHandlerIcon(props: LucideProps) {
  return <BookingMark {...props}>
    <Rect x={30} y={10} width={28} height={43} rx={4} />
    <Rect x={38} y={6} width={12} height={8} rx={2} fill="#FFFFFF" />
    <Path d="M37 23h14M37 31h14M37 39h9" />
    <Circle cx={15} cy={26} r={7} />
    <Path d="M4 55v-6a11 11 0 0 1 22 0v6" />
  </BookingMark>;
}

/** A reply on the tenant's phone, rather than a generic waiting hourglass. */
export function BookingAwaitingTenantIcon(props: LucideProps) {
  return <BookingMark {...props}>
    <Rect x={6} y={5} width={30} height={54} rx={6} />
    <Path d="M16 12h10M18 52h6" />
    <Path d="M35 23h19a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-6l-8 7v-7h-5a6 6 0 0 1-6-6V29a6 6 0 0 1 6-6Z" fill="#FFFFFF" />
    <Circle cx={38} cy={35} r={1.6} fill="#000000" stroke="none" />
    <Circle cx={45} cy={35} r={1.6} fill="#000000" stroke="none" />
    <Circle cx={52} cy={35} r={1.6} fill="#000000" stroke="none" />
  </BookingMark>;
}

/** The token payment owed: a payment slip and a rupee, not a balance wallet. */
export function BookingTokenDueIcon(props: LucideProps) {
  return <BookingMark {...props}>
    <Rect x={7} y={6} width={35} height={50} rx={4} />
    <Path d="M15 17h19M15 25h15M15 34h9M15 43h7" />
    <Circle cx={44} cy={44} r={15} fill="#FFFFFF" />
    <Path d="M38 37h12M38 42h12M40 37c9 0 9 8 0 8l10 7" strokeWidth={2.8} />
  </BookingMark>;
}

/** The original calendar/check mark, redrawn in the same black vector weight. */
export function BookingConfirmedIcon(props: LucideProps) {
  return <BookingMark {...props}>
    <Rect x={10} y={12} width={44} height={44} rx={5} />
    <Path d="M21 7v10M43 7v10M10 25h44" />
    <Path d="m21 39 8 8 14-15" />
  </BookingMark>;
}

/** Past bookings: a calendar and clock in the payment-setup drawing's blue line style. */
export function BookingHistoryIcon({ size = 32 }: LucideProps) {
  return <Svg width={Number(size)} height={Number(size)} viewBox="0 0 64 64" fill="none" stroke="#4775C5" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    <Rect x={7} y={11} width={43} height={42} rx={5} />
    <Path d="M18 6v10M39 6v10M7 24h43M16 33h12M16 42h8" />
    <Circle cx={45} cy={44} r={15} fill="#FFFFFF" />
    <Path d="M45 35v10l7 4" />
  </Svg>;
}

/**
 * Confirmed bookings: the history drawing, with a tick in its circle where the
 * clock's hands are (user, 2026-10-11). The same calendar, line and blue, so
 * the two cards read as a pair.
 */
export function BookingConfirmedListIcon({ size = 32 }: LucideProps) {
  return <Svg width={Number(size)} height={Number(size)} viewBox="0 0 64 64" fill="none" stroke="#4775C5" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    <Rect x={7} y={11} width={43} height={42} rx={5} />
    <Path d="M18 6v10M39 6v10M7 24h43M16 33h12M16 42h8" />
    <Circle cx={45} cy={44} r={15} fill="#FFFFFF" />
    <Path d="m38 44.5 5 5 9-10.5" />
  </Svg>;
}

/** A rupee token with a minted rim, distinct from a purse or balance wallet. */
export function BookingTokenAmountIcon(props: LucideProps) {
  return <BookingMark {...props} strokeColor={props.color}>
    <Circle cx={32} cy={32} r={26} />
    <Circle cx={32} cy={32} r={20} strokeWidth={2} />
    <Path d="M23 22h18M23 28h18M26 22c14 0 14 13 0 13l14 13" strokeWidth={3} />
    <Path d="M32 6v6M32 52v6M6 32h6M52 32h6" strokeWidth={2} />
  </BookingMark>;
}

/**
 * The token as a status mark: a rupee in a plain circle (user, 2026-10-11, on
 * the Token due chip: "a circle with rupee icon not wallet").
 *
 * <p>Drawn on the 24 grid the app's line icons use, and it takes their colour,
 * size and stroke, so it sits beside a clock or a tick in a status chip at the
 * same weight. The token drawing above is a headline mark and too fine for 15pt.
 */
export function BookingTokenStatusIcon({ color = "currentColor", size = 16, strokeWidth = 2 }: LucideProps) {
  return (
    <Svg width={Number(size)} height={Number(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={Number(strokeWidth)} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M8.7 7h6.6M8.7 9.8h6.6M8.7 12.5h1.6M10.3 12.5c3.7 0 3.7-5.5 0-5.5M8.7 12.5l4.7 4.5" strokeWidth={Number(strokeWidth) * 0.75} />
    </Svg>
  );
}
