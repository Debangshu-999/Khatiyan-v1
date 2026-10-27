import type { LucideProps } from "lucide-react-native";
import Svg, { Path, Rect } from "react-native-svg";

/** A banknote with a drawn rupee, sized and stroked like the neighbouring line icons. */
export function RupeeBanknoteIcon({ color = "currentColor", size = 24, strokeWidth = 2 }: LucideProps) {
  return <Svg width={Number(size)} height={Number(size)} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={Number(strokeWidth)} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    <Rect x={2} y={5} width={20} height={14} rx={2} />
    <Path d="M5.5 12h.01M18.5 12h.01" />
    <Path d="M9 8h6M9 10.5h6M10 8c5 0 5 5.5 0 5.5H9l5 3.5" strokeWidth={Number(strokeWidth) * 0.75} />
  </Svg>;
}
