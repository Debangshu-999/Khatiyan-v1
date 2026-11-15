import Svg, { Path, Rect } from "react-native-svg";

/**
 * A coloured calendar: red header with binder rings, a white page and a few date squares
 * (user, 2026-11-08: the shared month picker). Fixed colours, the same in light and dark.
 */
export function ColorCalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      <Rect fill="#FFFFFF" height={18} rx={3.2} stroke="#D3D9E4" strokeWidth={1} width={19} x={2.5} y={3.5} />
      <Path d="M2.5 6.7a3.2 3.2 0 0 1 3.2-3.2h12.6a3.2 3.2 0 0 1 3.2 3.2V9h-19V6.7Z" fill="#EF4444" />
      <Rect fill="#B91C1C" height={4.6} rx={1} width={2} x={6.5} y={1.5} />
      <Rect fill="#B91C1C" height={4.6} rx={1} width={2} x={15.5} y={1.5} />
      <Rect fill="#CBD5E1" height={2.6} rx={0.6} width={2.6} x={5.4} y={11.2} />
      <Rect fill="#CBD5E1" height={2.6} rx={0.6} width={2.6} x={10.7} y={11.2} />
      <Rect fill="#3B82F6" height={2.6} rx={0.6} width={2.6} x={16} y={11.2} />
      <Rect fill="#CBD5E1" height={2.6} rx={0.6} width={2.6} x={5.4} y={16} />
      <Rect fill="#CBD5E1" height={2.6} rx={0.6} width={2.6} x={10.7} y={16} />
      <Rect fill="#CBD5E1" height={2.6} rx={0.6} width={2.6} x={16} y={16} />
    </Svg>
  );
}
