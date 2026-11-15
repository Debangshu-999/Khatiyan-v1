import Svg, { Circle, Path } from "react-native-svg";

/**
 * The male and female symbols together, interlocked: a blue ring with its arrow
 * up and right, a pink ring with its cross below (user, 2026-11-08: the
 * Account tab's Gender tile). Fixed colours, the same in light and dark.
 */
export function GenderPairIcon({ size = 26 }: { size?: number }) {
  return (
    <Svg accessibilityElementsHidden fill="none" height={size} importantForAccessibility="no" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24" width={size}>
      {/* Female: ring, stem and crossbar. */}
      <Circle cx={8.5} cy={10.5} r={4.5} stroke="#EC4899" />
      <Path d="M8.5 15v7M5.5 19h6" stroke="#EC4899" />
      {/* Male: ring and arrow, through the female ring. */}
      <Circle cx={14.5} cy={10.5} r={4.5} stroke="#3B82F6" />
      <Path d="M17.7 7.3 22 3M18 3h4v4" stroke="#3B82F6" />
    </Svg>
  );
}
