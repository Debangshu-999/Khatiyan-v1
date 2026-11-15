import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The deposit history's marks in colour (user, 2026-11-14): money in with a
 * plus, money out with a minus, and a settlement as a settled slip with a tick.
 */

type Kind = "ADDITION" | "DEDUCTION" | "SETTLEMENT";

const NOTE = {
  ADDITION: { from: "#4ADE80", to: "#16A34A", line: "#BBF7D0", badge: "#15803D" },
  DEDUCTION: { from: "#FB7185", to: "#E11D48", line: "#FECDD3", badge: "#BE123C" },
} as const;

/** A banknote with a plus (addition) or minus (deduction) badge. */
function NoteIcon({ kind, size }: { kind: "ADDITION" | "DEDUCTION"; size: number }) {
  const look = NOTE[kind];
  const id = `depositNote${kind}`;
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor={look.from} />
          <Stop offset="1" stopColor={look.to} />
        </LinearGradient>
      </Defs>
      <G transform="rotate(-8 22 22)">
        {/* A second note behind, then the front one. */}
        <Rect fill={look.line} height={20} rx={3.5} width={32} x={8} y={9} />
        <Rect fill={`url(#${id})`} height={20} rx={3.5} width={32} x={5} y={14} />
        <Circle cx={21} cy={24} fill="none" r={5} stroke={look.line} strokeWidth={1.8} />
        <Path d="M9.5 18.5 h3 M29.5 29.5 h3" stroke={look.line} strokeLinecap="round" strokeWidth={1.8} />
      </G>
      {/* The badge: plus for money in, minus for money out. */}
      <Circle cx={36} cy={35} fill="#FFFFFF" r={10} />
      <Circle cx={36} cy={35} fill={look.badge} r={8} />
      <Path d={kind === "ADDITION" ? "M36 31 V39 M32 35 H40" : "M32 35 H40"} stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.4} />
    </Svg>
  );
}

/** A settled slip with a tick: the account paid out and closed. */
function SettlementIcon({ size }: { size: number }) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Defs>
        <LinearGradient id="depositSettle" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#8EA8FF" />
          <Stop offset="1" stopColor="#4B67E8" />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 6 H32 a3 3 0 0 1 3 3 V38 l-3 -2 -3 2 -3 -2 -3 2 -3 -2 -3 2 -3 -2 -3 2 V9 a3 3 0 0 1 3 -3 Z"
        fill="#FFFFFF"
        stroke="#C9D6F2"
        strokeLinejoin="round"
        strokeWidth={1.4}
      />
      <Path d="M14 14 H30 M14 20 H30 M14 26 H24" stroke="#9AA9C9" strokeLinecap="round" strokeWidth={2.2} />
      <Circle cx={35} cy={34} fill="#FFFFFF" r={11} />
      <Circle cx={35} cy={34} fill="url(#depositSettle)" r={9} />
      <Path d="M30.8 34.2 l3 3 5.4 -6" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}

export function DepositMovementIcon({ kind, size = 40 }: { kind: Kind; size?: number }) {
  return kind === "SETTLEMENT" ? <SettlementIcon size={size} /> : <NoteIcon kind={kind} size={size} />;
}
