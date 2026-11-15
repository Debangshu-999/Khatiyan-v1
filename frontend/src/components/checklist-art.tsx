import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path as SvgPath, Rect, Stop } from "react-native-svg";

/**
 * A checklist on a board (user, 2026-11-11: no stamp). Accepted: every line
 * ticked and a green tick badge. Pending: open boxes and a yellow clock badge.
 * Shapes only, no text, so it draws the same on every phone.
 */
export function ChecklistArt({ pending, size = 92 }: { pending: boolean; size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 96 96" width={size}>
      <Defs>
        <SvgGradient id="checklistBoardArt" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#D49A5E" />
          <Stop offset="1" stopColor="#A56A33" />
        </SvgGradient>
        <SvgGradient id="checklistBadgeArt" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor={pending ? "#FDB022" : "#3CCB7F"} />
          <Stop offset="1" stopColor={pending ? "#DC6803" : "#079455"} />
        </SvgGradient>
      </Defs>
      {/* The board and its paper. */}
      <Rect fill="url(#checklistBoardArt)" height={76} rx={8} width={58} x={14} y={12} />
      <Rect fill="#FFFFFF" height={62} rx={4} width={48} x={19} y={21} />
      <Rect fill="#8A8F98" height={10} rx={3} width={24} x={31} y={7} />
      <Circle cx={43} cy={12} fill="#C4C8D0" r={2.4} />
      {[33, 48, 63].map((y) => (
        <G key={y}>
          {pending ? (
            <Rect fill="#FFFFFF" height={9} rx={2.5} stroke="#F79009" strokeWidth={1.4} width={9} x={24} y={y - 4.5} />
          ) : (
            <>
              <Rect fill="#DCFAE6" height={9} rx={2.5} width={9} x={24} y={y - 4.5} />
              <SvgPath d={`M ${25.8} ${y} l 2.2 2.4 l 4 -4.6`} fill="none" stroke="#079455" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
            </>
          )}
          <Rect fill="#D0D5DD" height={3.4} rx={1.7} width={y === 63 ? 18 : 25} x={37} y={y - 1.7} />
        </G>
      ))}
      {/* The badge, over the corner: a tick, or a clock while it waits. */}
      <Circle cx={70} cy={72} fill="#FFFFFF" r={17} />
      <Circle cx={70} cy={72} fill="url(#checklistBadgeArt)" r={14} />
      {pending ? (
        <>
          <Circle cx={70} cy={72} fill="none" r={7.5} stroke="#FFFFFF" strokeWidth={2.2} />
          <SvgPath d="M 70 67.5 V 72 L 73.5 74" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
        </>
      ) : (
        <SvgPath d="M 63.5 72 L 68.5 77 L 77 67.5" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2} />
      )}
    </Svg>
  );
}
