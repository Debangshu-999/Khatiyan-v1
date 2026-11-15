import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";

/**
 * Home's four Live digest tiles, filled and in colour (user, 2026-11-09), in
 * the payment-claims artwork's manner: a pale fill, a deeper outline of the
 * same hue, a solid badge with a white mark. Each has an all-blue twin of the
 * same shapes for its screen's empty state. Vector, fixed colours, the same in
 * light and dark. Shaped like lucide icons: `color` and `strokeWidth` are
 * accepted and ignored.
 */

const WHITE = "#FFFFFF";

/** A fill, its outline and the badge's colour. */
type Palette = { badge: string; fill: string; stroke: string };

/** The empty states' palette: every icon in the app's blues (user, 2026-11-09). */
const BLUE: Palette = { badge: "#3B82F6", fill: "#DBEAFE", stroke: "#2563EB" };

function Receipt({ palette, size = 24 }: { palette: Palette; size?: number | string }) {
  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      <Path
        d="M5.5 3h11v17.5l-1.83-1.3-1.84 1.3-1.83-1.3-1.83 1.3-1.84-1.3-1.83 1.3Z"
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path
        d="M8.5 7.5h5M8.5 9.9h5M9.2 7.5c2.3 0 2.3 4.1 0 4.1h-.7l3.6 3.6"
        fill="none"
        stroke={palette.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.4}
      />
      <Circle cx={17.6} cy={17.4} fill={palette.badge} r={4.2} stroke={WHITE} strokeWidth={1.4} />
      <Path d="M15.8 17.5l1.2 1.2 2.4-2.5" fill="none" stroke={WHITE} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} />
    </Svg>
  );
}

function Bubble({ palette, size = 24 }: { palette: Palette; size?: number | string }) {
  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      <Path
        d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5v-8A2.5 2.5 0 0 1 6.5 3Z"
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path d="M12 6.4v4.4" stroke={palette.stroke} strokeLinecap="round" strokeWidth={2} />
      <Circle cx={12} cy={13.3} fill={palette.stroke} r={1.1} />
    </Svg>
  );
}

/** A door, its badge saying which way. */
function Door({ inward, palette, size = 24 }: { inward: boolean; palette: Palette; size?: number | string }) {
  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      <Path
        d="M4.5 21V4.5A1.5 1.5 0 0 1 6 3h7.5A1.5 1.5 0 0 1 15 4.5V21"
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path d="M3 21h14" stroke={palette.stroke} strokeLinecap="round" strokeWidth={1.5} />
      <Circle cx={12} cy={12.5} fill={palette.stroke} r={1} />
      <Circle cx={18.2} cy={8.2} fill={palette.badge} r={4.2} stroke={WHITE} strokeWidth={1.4} />
      <Path
        d={inward ? "M20 8.2h-3.6M17.8 6.8l-1.4 1.4 1.4 1.4" : "M16.4 8.2H20M18.6 6.8 20 8.2l-1.4 1.4"}
        fill="none"
        stroke={WHITE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}

const DOOR_BLUE = { fill: "#DBEAFE", stroke: "#2563EB" };

/** Money in: a green receipt with a rupee and a tick. */
export function DigestPaymentsColorIcon({ size = 24 }: LucideProps) {
  return <Receipt palette={{ badge: "#10B981", fill: "#ECFDF5", stroke: "#059669" }} size={size} />;
}

/** Raised today: an amber speech bubble with an exclamation mark. */
export function DigestConcernsColorIcon({ size = 24 }: LucideProps) {
  return <Bubble palette={{ badge: "#D97706", fill: "#FEF3C7", stroke: "#D97706" }} size={size} />;
}

/** Started today: a blue door, in through it, green. */
export function DigestMoveInsColorIcon({ size = 24 }: LucideProps) {
  return <Door inward palette={{ ...DOOR_BLUE, badge: "#10B981" }} size={size} />;
}

/** Ending today: a blue door, out through it, red. */
export function DigestMoveOutsColorIcon({ size = 24 }: LucideProps) {
  return <Door inward={false} palette={{ ...DOOR_BLUE, badge: "#EF4444" }} size={size} />;
}

/** The empty states' twins: the same shapes, all blue. */
export function DigestPaymentsBlueIcon({ size = 64 }: LucideProps) {
  return <Receipt palette={BLUE} size={size} />;
}

export function DigestConcernsBlueIcon({ size = 64 }: LucideProps) {
  return <Bubble palette={BLUE} size={size} />;
}

export function DigestMoveInsBlueIcon({ size = 64 }: LucideProps) {
  return <Door inward palette={BLUE} size={size} />;
}

export function DigestMoveOutsBlueIcon({ size = 64 }: LucideProps) {
  return <Door inward={false} palette={BLUE} size={size} />;
}
