import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";

/** A prospective tenant and magnifier, in the Dashboard's shared outline weight. */
export function LeadsInsightsIcon({ color = "currentColor", size = 24, strokeWidth = 2 }: LucideProps) {
  return <Svg width={Number(size)} height={Number(size)} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={Number(strokeWidth)} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    <Circle cx={8} cy={7} r={3} />
    <Path d="M2 21v-2a6 6 0 0 1 7.5-5.8" />
    <Circle cx={17} cy={15.5} r={4.5} />
    <Path d="m20.2 18.7 2.3 2.3" />
  </Svg>;
}
