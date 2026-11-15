import { forwardRef, type ReactNode } from "react";
import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

/**
 * Tenancy control, Billing control and Concern queues as coloured vector icons
 * (user, 2026-11-14), in the style of the Manage tab and Home tools: flat
 * colours, one shade, no plain white parts so they stand on a white card. Each
 * takes a Lucide icon's props so the cards that drew outlines can draw these:
 * the size is used, the colour and stroke are the drawing's own. A 48 grid.
 */
function art(name: string, draw: ReactNode) {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function ControlArt({ size = 40 }, _ref) {
    const box = typeof size === "number" ? size : Number(size) || 40;
    return (
      <Svg height={box} viewBox="0 0 48 48" width={box}>
        {draw}
      </Svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

const SKIN = "#F6C9A4";
const HAIR = "#2B2F45";
const PAPER = "#E8F0FE";
const PAPER_EDGE = "#9DB6E3";
const GREEN = "#1F9D63";
const RED = "#E5484D";
const AMBER = "#F5A524";
const BLUE = "#2F6CD9";
const VIOLET = "#7C3AED";
const TEAL = "#0D9488";
const ORANGE = "#EA580C";

/** A person, head and shoulders, on the left of the box. */
const person = (shirt: string) => (
  <>
    <Path d="M4 42c0-8.8 6-14.4 13.5-14.4S31 33.2 31 42Z" fill={shirt} />
    <Circle cx={17.5} cy={16} fill={SKIN} r={7.6} />
    <Path d="M9.9 15.4c-.3-5.6 3.3-8.9 7.6-8.9s8 3.3 7.6 8.4c-1.5-2.6-4.3-3.7-7.6-3.7s-5.9 1.2-7.6 4.2Z" fill={HAIR} />
  </>
);

/** A round badge at the bottom right, its colour and what is drawn on it. */
const badge = (fill: string, glyph: ReactNode, cx = 36, cy = 34) => (
  <>
    <Circle cx={cx} cy={cy} fill={fill} r={9.5} />
    <G transform={`translate(${cx} ${cy})`}>{glyph}</G>
  </>
);
const tick = <Path d="M-4.4 0.2l2.9 2.9 5.6-5.8" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />;
const plus = <Path d="M0-4.6v9.2M-4.6 0h9.2" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.6} />;
const cross = <Path d="M-3.6-3.6l7.2 7.2M3.6-3.6l-7.2 7.2" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.6} />;
const clockFace = (hand: string) => (
  <>
    <Circle fill="#FFF4E0" r={6.4} />
    <Path d="M0-4v4.2l2.8 1.8" fill="none" stroke={hand} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </>
);

/** A door ajar in its frame, on the floor line. */
const door = (panel: string) => (
  <>
    <Rect fill="#DCE6F5" height={34} rx={2} width={20} x={14} y={7} />
    <Path d="M16 41V9.5l13 3.2V41Z" fill={panel} />
    <Circle cx={26} cy={26} fill="#FFFFFF" opacity={0.85} r={1.4} />
    <Rect fill="#9AA6B8" height={2.6} rx={1.3} width={36} x={6} y={40.6} />
  </>
);

/** A receipt with a torn foot and its lines. */
const receipt = (lines: string) => (
  <>
    <Path d="M7 5h24l7 7v31l-3.1-2.2-3.1 2.2-3.1-2.2-3.1 2.2-3.1-2.2-3.1 2.2-3.1-2.2-3.1 2.2L7 43Z" fill={PAPER} stroke={PAPER_EDGE} strokeLinejoin="round" strokeWidth={1.2} />
    <Path d="M31 5v7h7Z" fill="#C9D8F2" />
    <Rect fill={lines} height={3} rx={1.5} width={16} x={12} y={16} />
    <Rect fill={lines} height={3} rx={1.5} opacity={0.7} width={12} x={12} y={23} />
    <Rect fill={lines} height={3} rx={1.5} opacity={0.5} width={14} x={12} y={30} />
  </>
);

/** A page with lines, for documents and concerns. */
const page = (edge: string, lines: string) => (
  <>
    <Path d="M9 4h20l9 9v29a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill={PAPER} stroke={edge} strokeLinejoin="round" strokeWidth={1.2} />
    <Path d="M29 4v9h9Z" fill="#C9D8F2" />
    <Rect fill={lines} height={3} rx={1.5} width={18} x={12} y={18} />
    <Rect fill={lines} height={3} rx={1.5} opacity={0.7} width={14} x={12} y={25} />
    <Rect fill={lines} height={3} rx={1.5} opacity={0.5} width={10} x={12} y={32} />
  </>
);

// ---------- Tenancy control ----------

export const ActiveTenancyArt = art("ActiveTenancyArt", <>{person(BLUE)}{badge(GREEN, tick)}</>);
export const OnNoticeTenancyArt = art("OnNoticeTenancyArt", <>{person(TEAL)}{badge(AMBER, clockFace("#9A5B07"))}</>);
export const StartedTenancyArt = art("StartedTenancyArt", (
  <>
    {door(BLUE)}
    <Path d="M2 26h13" stroke={GREEN} strokeLinecap="round" strokeWidth={3.4} />
    <Path d="M11 20.5l6.5 5.5-6.5 5.5Z" fill={GREEN} />
  </>
));
export const EndedTenancyArt = art("EndedTenancyArt", (
  <>
    {door("#64748B")}
    <Path d="M28 26h13" stroke={RED} strokeLinecap="round" strokeWidth={3.4} />
    <Path d="M38 20.5l6.5 5.5-6.5 5.5Z" fill={RED} />
  </>
));
export const CreateTenancyArt = art("CreateTenancyArt", <>{person(BLUE)}{badge(GREEN, plus)}</>);
export const ExitRequestArt = art("ExitRequestArt", (
  <>
    {door(AMBER)}
    <Path d="M28 26h13" stroke={ORANGE} strokeLinecap="round" strokeWidth={3.4} />
    <Path d="M38 20.5l6.5 5.5-6.5 5.5Z" fill={ORANGE} />
  </>
));
export const RoomChangeArt = art("RoomChangeArt", (
  <>
    {/* Two beds, one above the other, with the swap between them. */}
    <Rect fill={VIOLET} height={10} rx={1.5} width={3} x={4} y={6} />
    <Rect fill="#C4B5FD" height={4.4} rx={2} width={20} x={7} y={9.6} />
    <Rect fill={VIOLET} height={4} rx={1.5} width={24} x={4} y={13.6} />
    <Rect fill={TEAL} height={10} rx={1.5} width={3} x={20} y={30} />
    <Rect fill="#99F6E4" height={4.4} rx={2} width={20} x={23} y={33.6} />
    <Rect fill={TEAL} height={4} rx={1.5} width={24} x={20} y={37.6} />
    <Path d="M33 8h7v12" fill="none" stroke={ORANGE} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    <Path d="M35.5 18h9l-4.5 6Z" fill={ORANGE} />
    <Path d="M15 40H8V28" fill="none" stroke={ORANGE} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    <Path d="M12.5 30h-9L8 24Z" fill={ORANGE} />
  </>
));
export const TenancyHistoryArt = art("TenancyHistoryArt", <>{page(PAPER_EDGE, BLUE)}{badge(VIOLET, clockFace("#4C1D95"), 37, 36)}</>);
export const UpcomingExitsArt = art("UpcomingExitsArt", (
  <>
    <Rect fill="#FDE2E2" height={34} rx={5} width={34} x={4} y={8} />
    <Path d="M4 13a5 5 0 0 1 5-5h24a5 5 0 0 1 5 5v4H4Z" fill={RED} />
    {[12, 21, 30].map((x) => <Rect fill="#9AA6B8" height={8} key={x} rx={1.5} width={3} x={x - 1.5} y={4} />)}
    {[[10, 23], [18, 23], [26, 23], [10, 31], [18, 31]].map(([x, y]) => <Rect fill="#F8B4B4" height={5} key={`${x}${y}`} rx={1} width={5} x={x} y={y} />)}
    <Circle cx={37} cy={36} fill={ORANGE} r={9.5} />
    <Path d="M32.4 36h8" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.6} />
    <Path d="M38.2 32.4l3.6 3.6-3.6 3.6" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
  </>
));

// ---------- Billing control ----------

export const BillingCyclesArt = art("BillingCyclesArt", (
  <>
    {receipt(BLUE)}
    {badge(GREEN, (
      <>
        <Path d="M-4.6-1A4.8 4.8 0 0 1 3.6-3.2" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.2} />
        <Path d="M4.6 1A4.8 4.8 0 0 1-3.6 3.2" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.2} />
        <Path d="M2.2-5.8l2.6 2.2-3 1.6Z" fill="#FFFFFF" />
        <Path d="M-2.2 5.8l-2.6-2.2 3-1.6Z" fill="#FFFFFF" />
      </>
    ), 37, 36)}
  </>
));
export const OverdueBillArt = art("OverdueBillArt", <>{receipt(RED)}{badge(RED, clockFace("#9B1C1C"), 37, 36)}</>);
export const OtherBillsArt = art("OtherBillsArt", (
  <>
    <Path d="M13 2h22l6 6v26H13Z" fill="#FDE9C4" stroke="#E2A646" strokeLinejoin="round" strokeWidth={1.2} />
    {receipt(AMBER)}
  </>
));
export const PaidBillArt = art("PaidBillArt", <>{receipt(GREEN)}{badge(GREEN, tick, 37, 36)}</>);
export const UnpaidBillArt = art("UnpaidBillArt", <>{receipt(AMBER)}{badge(RED, cross, 37, 36)}</>);
export const DiscountArt = art("DiscountArt", (
  <>
    {/* A scalloped tag with the per cent sign. */}
    {Array.from({ length: 12 }, (_, i) => {
      const angle = (i * Math.PI) / 6;
      return <Circle cx={24 + Math.cos(angle) * 15} cy={24 + Math.sin(angle) * 15} fill={VIOLET} key={i} r={5} />;
    })}
    <Circle cx={24} cy={24} fill={VIOLET} r={16} />
    <Circle cx={18.5} cy={18.5} fill="#FFFFFF" r={3} />
    <Circle cx={29.5} cy={29.5} fill="#FFFFFF" r={3} />
    <Path d="M30 17.5 18 30.5" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={3} />
  </>
));

// ---------- Concern queues ----------

export const OpenConcernArt = art("OpenConcernArt", <>{page(PAPER_EDGE, BLUE)}{badge(AMBER, <Path d="M0-4.6v5M0 3.6v.4" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.8} />, 37, 36)}</>);
export const InReviewConcernArt = art("InReviewConcernArt", (
  <>
    {page(PAPER_EDGE, VIOLET)}
    <Circle cx={31} cy={31} fill="#EDE4FF" r={8} stroke={VIOLET} strokeWidth={3.4} />
    <Path d="M37 37l7 7" stroke={VIOLET} strokeLinecap="round" strokeWidth={4} />
  </>
));
export const InProgressConcernArt = art("InProgressConcernArt", (
  <>
    {Array.from({ length: 8 }, (_, i) => (
      <Rect fill={ORANGE} height={10} key={i} rx={2} transform={`rotate(${i * 45} 24 24)`} width={8} x={20} y={4} />
    ))}
    <Circle cx={24} cy={24} fill={ORANGE} r={14} />
    <Circle cx={24} cy={24} fill="#FFE7D6" r={6} />
  </>
));
export const EscalatedConcernArt = art("EscalatedConcernArt", (
  <>
    <Circle cx={24} cy={24} fill="#FDE2E2" r={20} />
    <Path d="M24 36V14" stroke={RED} strokeLinecap="round" strokeWidth={4.4} />
    <Path d="M13.5 22 24 10.5 34.5 22Z" fill={RED} />
  </>
));
export const ResolvedConcernArt = art("ResolvedConcernArt", (
  <>
    <Circle cx={24} cy={24} fill={GREEN} r={20} />
    <Path d="M14.5 24.5l6.5 6.5 12.5-13" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4.2} />
  </>
));
export const ReopenedConcernArt = art("ReopenedConcernArt", (
  <>
    <Path d="M8.5 20A16 16 0 0 1 37 13" fill="none" stroke={TEAL} strokeLinecap="round" strokeWidth={4.4} />
    <Path d="M33 5.5l7.5 9.5-11 2.5Z" fill={TEAL} />
    <Path d="M39.5 28A16 16 0 0 1 11 35" fill="none" stroke={AMBER} strokeLinecap="round" strokeWidth={4.4} />
    <Path d="M15 42.5 7.5 33l11-2.5Z" fill={AMBER} />
  </>
));

// ---------- Staff ----------

/** Past employees (user, 2026-11-14; was a picture): two of the team, one gone grey, and a violet clock. */
export const PastEmployeesArt = art("PastEmployeesArt", (
  <>
    <G transform="translate(12 -2)">
      <Path d="M4 42c0-8.8 6-14.4 13.5-14.4S31 33.2 31 42Z" fill="#94A3B8" />
      <Circle cx={17.5} cy={16} fill="#E2D3C4" r={7.6} />
      <Path d="M9.9 15.4c-.3-5.6 3.3-8.9 7.6-8.9s8 3.3 7.6 8.4c-1.5-2.6-4.3-3.7-7.6-3.7s-5.9 1.2-7.6 4.2Z" fill="#64748B" />
    </G>
    <G transform="translate(-4 4)">{person(BLUE)}</G>
    {badge(VIOLET, clockFace("#4C1D95"), 38, 37)}
  </>
));

// ---------- Profit and loss ----------

/** Income (user, 2026-11-14): a green wallet with a gold rupee coin going in. */
export const IncomeArt = art("IncomeArt", (
  <>
    <Rect fill="#15803D" height={26} rx={5} width={38} x={4} y={16} />
    <Path d="M8 16 30 7.5a3 3 0 0 1 3.8 1.8L36 16Z" fill="#86EFAC" />
    <Rect fill={GREEN} height={24} rx={4.5} width={38} x={4} y={18} />
    <Rect fill="#15803D" height={10} rx={3} width={13} x={31} y={25} />
    <Circle cx={36.5} cy={30} fill="#BBF7D0" r={2} />
    <Circle cx={15} cy={13} fill={AMBER} r={8} />
    <Path d="M11.8 9.8h6.4M11.8 12.3h6.4M12.8 9.8c3.9 0 3.9 5.2-.2 5.2l4.2 3.8" fill="none" stroke="#7A4A06" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
  </>
));

/** Expense (user, 2026-11-14): a red-lined receipt with the rupee on it. */
export const ExpenseArt = art("ExpenseArt", (
  <>
    <Path d="M7 5h34v38l-4.25-3-4.25 3-4.25-3-4.25 3-4.25-3-4.25 3-4.25-3L7 43Z" fill="#FDE2E2" stroke={RED} strokeLinejoin="round" strokeWidth={1.4} />
    <Circle cx={24} cy={19} fill={RED} r={8.5} />
    <Path d="M20.4 15.2h7.2M20.4 18h7.2M21.6 15.2c4.4 0 4.4 5.8-.2 5.8l4.8 4.4" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} />
    <Rect fill="#F8B4B4" height={3} rx={1.5} width={20} x={14} y={31} />
  </>
));

/** Net (user, 2026-11-14): blue bars with a violet trend line over them. */
export const NetArt = art("NetArt", (
  <>
    <Rect fill="#9AA6B8" height={2.6} rx={1.3} width={40} x={4} y={41} />
    <Rect fill="#BCD3F7" height={14} rx={2} width={7} x={7} y={27} />
    <Rect fill="#5B8FE8" height={20} rx={2} width={7} x={17} y={21} />
    <Rect fill={BLUE} height={13} rx={2} width={7} x={27} y={28} />
    <Rect fill="#1F4FBF" height={26} rx={2} width={7} x={37} y={15} />
    <Path d="M6 22 16 13l9 6 15-13" fill="none" stroke={VIOLET} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    <Path d="M35.5 4.6 42.5 4l-.6 7Z" fill={VIOLET} />
  </>
));

/**
 * The profit and loss hero's picture (user, 2026-11-14; was a 3D image): pale bars
 * on the card's dark blue, a green arrow climbing them for a profit or a red one
 * falling for a loss, and a gold rupee coin. 132 by 96.
 */
export function PnlHeroArt({ profit, width = 132 }: { profit: boolean; width?: number }) {
  const bars = profit ? [26, 38, 50, 64] : [64, 50, 38, 26];
  const arrow = profit ? "#34D399" : "#F87171";
  return (
    <Svg height={(width * 96) / 132} viewBox="0 0 132 96" width={width}>
      <Rect fill="#FFFFFF" height={3} opacity={0.35} rx={1.5} width={104} x={20} y={86} />
      {bars.map((height, index) => (
        <G key={index}>
          <Rect fill="#DCE8FF" height={height} rx={4} width={16} x={34 + index * 22} y={86 - height} />
          <Rect fill="#A9C4F5" height={height} rx={4} width={5} x={45 + index * 22} y={86 - height} />
        </G>
      ))}
      {profit ? (
        <>
          <Path d="M30 62 56 44l20 10 40-34" fill="none" stroke={arrow} strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} />
          <Path d="M104 14.5 122 12l-3.4 17.6Z" fill={arrow} />
        </>
      ) : (
        <>
          <Path d="M30 16 56 34l20-8 40 32" fill="none" stroke={arrow} strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} />
          <Path d="M104 64.5 122 66l-5.4-17.2Z" fill={arrow} />
        </>
      )}
      <Circle cx={24} cy={74} fill="#F5A524" r={15} />
      <Circle cx={24} cy={74} fill="#FBBF24" r={11.5} />
      <Path d="M18.8 67.8h10.4M18.8 71.6h10.4M20.6 67.8c6.2 0 6.2 8-.3 8l6.8 6.2" fill="none" stroke="#7A4A06" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

// ---------- Roll call ----------

/** Roll call (user, 2026-11-15): a clipboard of names with green ticks and a moon for the night. */
export const RollCallArt = art("RollCallArt", (
  <>
    <Rect fill={BLUE} height={38} rx={5} width={30} x={5} y={7} />
    <Rect fill={PAPER} height={30} rx={3} width={24} x={8} y={12} />
    <Rect fill="#1F4FBF" height={7} rx={2.5} width={14} x={13} y={4} />
    {[18, 26, 34].map((y) => (
      <G key={y}>
        <Path d={`M11 ${y}l2 2 3.6-3.8`} fill="none" stroke={GREEN} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
        <Rect fill="#9DB6E3" height={2.8} rx={1.4} width={10} x={19} y={y - 0.6} />
      </G>
    ))}
    <Circle cx={38} cy={34} fill="#312E81" r={9.5} />
    <Path d="M41.5 29.5a6 6 0 1 0 0 9 5 5 0 1 1 0-9Z" fill="#FDE68A" />
  </>
));

/** Roll call's Not marked (user, 2026-11-15): the person with an amber "!". */
export const NotMarkedArt = art("NotMarkedArt", <>{person(BLUE)}{badge(AMBER, <Path d="M0-4.8v5.2M0 3.8v.4" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.8} />)}</>);

/** Roll call's Absent (user, 2026-11-15): the person with a red cross. */
export const AbsentArt = art("AbsentArt", <>{person(BLUE)}{badge(RED, cross)}</>);
