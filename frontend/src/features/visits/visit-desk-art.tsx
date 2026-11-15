import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Manage Visits' bottom cards as coloured vector drawings (user, 2026-11-14), in
 * the style of the Home tools: flat colours, one shade, no plain white parts so
 * they stand on a white card. Each draws on a 64 grid.
 */

const SKIN = "#F6C9A4";
const HAIR = "#2B2F45";

function Frame({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      {children}
    </Svg>
  );
}

/** Record external: a walk-in visitor in green with an amber + badge. */
export function RecordExternalArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Path d="M8 60c0-13 8-21 20-21s20 8 20 21Z" fill="#1F9D63" />
      <Path d="M24 40l4 6 4-6Z" fill="#DDF5E9" />
      <Circle cx={28} cy={24} fill={SKIN} r={11} />
      <Path d="M17 23c-.5-8 4.6-12.6 11-12.6S39.6 15 39 22.4c-2.2-3.8-6.2-5.4-11-5.4S19.5 18.8 17 23Z" fill={HAIR} />
      <Circle cx={49} cy={20} fill="#F5A524" r={11} />
      <Path d="M49 14.5v11M43.5 20h11" stroke="#7A4A06" strokeLinecap="round" strokeWidth={3.2} />
    </Frame>
  );
}

/** History: a violet clock with the arrow turning back round it. */
export function VisitHistoryArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Path d="M12.6 22A22 22 0 1 1 10 32" fill="none" stroke="#7C3AED" strokeLinecap="round" strokeWidth={5} />
      <Path d="M4.5 21.5 12.8 23l3.4-7.8Z" fill="#7C3AED" />
      <Circle cx={32} cy={32} fill="#EDE4FF" r={15} />
      <Path d="M32 23v10l7 4" fill="none" stroke="#4C1D95" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.4} />
    </Frame>
  );
}

/** Earlier today: an amber clipboard of the day's visits, with an orange clock for the slots that ended. */
export function EarlierTodayArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#F5A524" height={50} rx={6} width={38} x={8} y={9} />
      <Rect fill="#FFF1D6" height={40} rx={3} width={30} x={12} y={15} />
      <Rect fill="#9A5B07" height={8} rx={2.5} width={16} x={19} y={5} />
      {[24, 32, 40].map((y) => (
        <Rect fill="#E2A646" height={3.4} key={y} rx={1.7} width={y === 40 ? 12 : 20} x={17} y={y} />
      ))}
      <Circle cx={47} cy={46} fill="#EA580C" r={13} />
      <Circle cx={47} cy={46} fill="#FFE7D6" r={9.6} />
      <Path d="M47 40v6.4l4 2.4" fill="none" stroke="#C2410C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
    </Frame>
  );
}
