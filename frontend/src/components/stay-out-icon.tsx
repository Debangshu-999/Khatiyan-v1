import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Stay outs' mark (user, 2026-11-09): the empty state's filled blue suitcase
 * with a moon badge, "away for the night". Vector, fixed colours, so it reads
 * the same in light and dark. Shaped like a lucide icon: `color` and
 * `strokeWidth` are accepted and ignored.
 */
export function StayOutIcon({ size = 24 }: LucideProps) {
  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      {/* The empty state's filled blue suitcase (user, 2026-11-09)... */}
      <Path d="M8.6 6.2V4.5A1.5 1.5 0 0 1 10.1 3h3.8a1.5 1.5 0 0 1 1.5 1.5v1.7" fill="none" stroke="#1E4FB8" strokeLinecap="round" strokeWidth={1.5} />
      <Rect fill="#3B82F6" height={13.8} rx={2.8} width={15} x={4.5} y={5.8} />
      <Rect fill="#93C5FD" height={13.8} opacity={0.55} rx={2.8} width={7.5} x={4.5} y={5.8} />
      <Path d="M9 5.8v13.8M15 5.8v13.8" stroke="#DBEAFE" strokeLinecap="round" strokeWidth={1.3} />
      <Circle cx={7.6} cy={21.1} fill="#1E4FB8" r={1.3} />
      <Circle cx={16.4} cy={21.1} fill="#1E4FB8" r={1.3} />
      {/* ...with its moon: a white moon on deep blue, ringed white to stand off the case. */}
      <Circle cx={18.6} cy={17.4} fill="#1E4FB8" r={4.3} stroke="#FFFFFF" strokeWidth={1.4} />
      <Path d="M20.1 18.9a2.4 2.4 0 0 1-2.9-3.4 2.6 2.6 0 1 0 2.9 3.4Z" fill="#FFFFFF" />
    </Svg>
  );
}

/**
 * The stay-out empty state's mark (user, 2026-11-09): the suitcase filled in
 * blue, like the other empty-state illustrations, for the owner's and the
 * tenant's screens alike.
 */
export function StayOutEmptyIcon({ size = 64 }: LucideProps) {
  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      <Path d="M8.6 6.2V4.5A1.5 1.5 0 0 1 10.1 3h3.8a1.5 1.5 0 0 1 1.5 1.5v1.7" fill="none" stroke="#1E4FB8" strokeLinecap="round" strokeWidth={1.5} />
      <Rect fill="#3B82F6" height={13.8} rx={2.8} width={15} x={4.5} y={5.8} />
      <Rect fill="#93C5FD" height={13.8} opacity={0.55} rx={2.8} width={7.5} x={4.5} y={5.8} />
      <Path d="M9 5.8v13.8M15 5.8v13.8" stroke="#DBEAFE" strokeLinecap="round" strokeWidth={1.3} />
      <Circle cx={7.6} cy={21.1} fill="#1E4FB8" r={1.3} />
      <Circle cx={16.4} cy={21.1} fill="#1E4FB8" r={1.3} />
    </Svg>
  );
}
