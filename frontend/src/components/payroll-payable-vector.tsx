import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useTheme } from "@/theme/use-theme";

/** Payroll sheet and wallet, drawn at display size without bitmap compression. */
export function PayrollPayableVector() {
  const { colors } = useTheme();
  return (
    <Svg width={104} height={84} viewBox="0 0 104 84" accessibilityLabel="Monthly payroll" accessibilityRole="image">
      <Circle cx={52} cy={43} r={37} fill="#E7F0FF" />
      <Path d="M27 12H56L67 23V61H27Z" fill="#D4E5FF" stroke={colors.primaryDeep} strokeWidth={2.8} strokeLinejoin="round" />
      <Path d="M56 12V23H67Z" fill="#82AAE8" />
      <Path d="M56 12V23H67M35 42H53M35 49H47" fill="none" stroke={colors.primaryDeep} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={42} cy={28} r={4} fill="#4775C5" />
      <Path d="M35 37Q35 32 42 32Q49 32 49 37Z" fill="#4775C5" />
      <Path d="M45 48V44Q45 40 50 40H83V48" fill="#233E72" stroke="#233E72" strokeWidth={2.8} strokeLinejoin="round" />
      <Rect x={43} y={48} width={48} height={27} rx={5} fill="#4775C5" stroke="#2E5192" strokeWidth={2.8} />
      <Path d="M54 55H67M54 60H67M58 55Q67 55 64 60Q62 63 55 63L64 69" fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={78} y={55} width={15} height={12} rx={3} fill="#F5CE73" stroke="#B38937" strokeWidth={2.8} />
      <Circle cx={84} cy={61} r={1.8} fill="#77551C" />
    </Svg>
  );
}
