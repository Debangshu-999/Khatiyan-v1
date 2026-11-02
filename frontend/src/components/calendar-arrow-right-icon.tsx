import type { LucideProps } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

/** An upright calendar with a right-pointing move-in arrow, in the app's line-icon style. */
export function CalendarArrowRightIcon({ color = "currentColor", size = 24, strokeWidth = 2 }: LucideProps) {
  return <Svg width={Number(size)} height={Number(size)} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={Number(strokeWidth)} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
    <Path d="M8 2v4M16 2v4M3 10h18" />
    <Path d="M12 17h10M18 13l4 4-4 4" />
  </Svg>;
}
