import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

/**
 * The owner Home's tools and digest cards as coloured vector drawings (user,
 * 2026-11-14), the same subjects as the old 3D pictures, in the style of the
 * workspace module drawings: flat colours, one shade, no plain white parts so
 * they stand on a white card. Each takes a size and draws on a 64 grid.
 */

const SKIN = "#F6C9A4";
const HAIR = "#2B2F45";
const PAPER = "#E8F0FE";
const PAPER_EDGE = "#9DB6E3";

function Frame({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      {children}
    </Svg>
  );
}

/** A receipt with the rupee: the shared base of payment claims and expenses. */
function Receipt({ accent }: { accent: string }) {
  return (
    <>
      <Path d="M12 5h30l9 9v44l-4.6-3.2-4.6 3.2-4.6-3.2-4.6 3.2-4.6-3.2-4.6 3.2-4.6-3.2L12 58Z" fill={PAPER} stroke={PAPER_EDGE} strokeLinejoin="round" strokeWidth={1.4} />
      <Path d="M42 5v9h9Z" fill="#C9D8F2" />
      <Circle cx={30} cy={23} fill={accent} r={9} />
      <Path d="M26.4 18.8h7.2M26.4 21.6h7.2M27.6 18.8c4.4 0 4.4 5.8-.2 5.8l4.8 4.4" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} />
      <Rect fill={accent} height={3.2} opacity={0.8} rx={1.6} width={18} x={18} y={37} />
      <Rect fill={accent} height={3.2} opacity={0.55} rx={1.6} width={13} x={18} y={43} />
    </>
  );
}

/** Payment claims: the receipt with a blue tick. */
export function PaymentClaimsArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Receipt accent="#2F6CD9" />
      <Circle cx={48} cy={48} fill="#FFFFFF" r={12} />
      <Circle cx={48} cy={48} fill="#2F6CD9" r={10} />
      <Path d="M43.6 48.2l3 3 5.8-6.2" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
    </Frame>
  );
}

/** Expense tracker: the receipt in green with money going out. */
export function ExpenseTrackerArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Receipt accent="#1F9D63" />
      <Circle cx={48} cy={48} fill="#FFFFFF" r={12} />
      <Circle cx={48} cy={48} fill="#DDF5E8" r={10} />
      <Path d="M42.6 43.4l4.4 4.4 2.4-2.4 4.2 4.2M53.6 45v4.6H49" fill="none" stroke="#1F9D63" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Frame>
  );
}

/** Service balance: a purple wallet. */
export function ServiceBalanceArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#7C4DDB" height={36} rx={10} width={52} x={6} y={16} />
      <Path d="M16 16l26-9a4 4 0 0 1 5 2.6L49 16Z" fill="#9B6CF0" />
      <Rect fill="#6A3CC8" height={14} rx={6} width={22} x={38} y={27} />
      <Circle cx={47} cy={34} fill="#F5C64A" r={3.4} />
      <Path d="M12 23c6-2 14-2 20 0" stroke="#A985F2" strokeLinecap="round" strokeWidth={2} />
    </Frame>
  );
}

/** Leads: an ID card on a clipboard under a magnifier. */
export function LeadsArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#D08C4E" height={50} rx={5} width={38} x={6} y={8} />
      <Rect fill="#FFF3DE" height={40} rx={3} width={30} x={10} y={14} />
      <Rect fill="#6B7487" height={8} rx={3} width={16} x={17} y={4} />
      <Circle cx={20} cy={25} fill={SKIN} r={5} />
      <Path d="M14.6 24c0-4 2.4-6 5.4-6s5.4 2 5.2 5.6c-1.2-1.8-3-2.6-5.2-2.6s-4.2.8-5.4 3Z" fill={HAIR} />
      <Path d="M13 37c0-4 3-6.4 7-6.4s7 2.4 7 6.4Z" fill="#2F6CD9" />
      <Rect fill="#E2C9A6" height={3} rx={1.5} width={10} x={14} y={42} />
      <Rect fill="#E2C9A6" height={3} rx={1.5} width={14} x={14} y={47} />
      <Path d="M51 50l9 9" stroke="#5E6678" strokeLinecap="round" strokeWidth={6} />
      <Circle cx={43} cy={42} fill="#C9DEFB" r={12} stroke="#2F6CD9" strokeWidth={4} />
      <Path d="M37.6 40a6 6 0 0 1 5.4-4" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.2} />
    </Frame>
  );
}

/** Vacancy finder: a bed under a magnifier. */
export function VacancyFinderArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#B9825A" height={30} rx={4} width={8} x={4} y={18} />
      <Rect fill="#C9936A" height={8} width={48} x={4} y={42} />
      <Rect fill="#F1E9DD" height={9} rx={3} width={44} x={8} y={34} />
      <Path d="M24 33h28v9H22Z" fill="#7FA6E8" />
      <Ellipse cx={17} cy={33} fill="#E6DCCB" rx={7} ry={4} />
      <Rect fill="#8A5A3C" height={8} width={4} x={6} y={50} />
      <Rect fill="#8A5A3C" height={8} width={4} x={46} y={50} />
      <Path d="M52 30l9 9" stroke="#5E6678" strokeLinecap="round" strokeWidth={6} />
      <Circle cx={43} cy={21} fill="#C9DEFB" opacity={0.95} r={12} stroke="#2F6CD9" strokeWidth={4} />
      <Path d="M37.6 19a6 6 0 0 1 5.4-4" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.2} />
    </Frame>
  );
}

/** Expenses: a brown wallet with a bill tucked in. */
export function ExpensesArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <G transform="rotate(8 34 16)">
        <Rect fill={PAPER} height={26} rx={2} stroke={PAPER_EDGE} strokeWidth={1.4} width={22} x={24} y={4} />
        <Rect fill="#2F6CD9" height={3} rx={1.5} width={12} x={28} y={10} />
        <Rect fill="#9DB6E3" height={3} rx={1.5} width={9} x={28} y={16} />
      </G>
      <Rect fill="#8E5A3A" height={34} rx={8} width={52} x={6} y={22} />
      <Path d="M6 32c0-6 4-10 10-10h34c4 0 8 4 8 8Z" fill="#A86C45" />
      <Rect fill="#7A4A2E" height={14} rx={6} width={20} x={40} y={33} />
      <Circle cx={48} cy={40} fill="#F5C64A" r={3} />
    </Frame>
  );
}

/** Deposit manager: a grey safe with its dial. */
export function DepositSafeArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#5E6678" height={48} rx={7} width={50} x={7} y={7} />
      <Rect fill="#8B93A5" height={40} rx={5} width={42} x={11} y={11} />
      <Circle cx={30} cy={31} fill="#5E6678" r={11} />
      <Circle cx={30} cy={31} fill="#C3C9D6" r={7.5} />
      {Array.from({ length: 8 }, (_, k) => (
        <Rect fill="#5E6678" height={4} key={k} rx={1} transform={`rotate(${k * 45} 30 31)`} width={2} x={29} y={22} />
      ))}
      <Circle cx={30} cy={31} fill="#3B4252" r={2.4} />
      <Rect fill="#3B4252" height={12} rx={2} width={4} x={45} y={25} />
      <Rect fill="#3B4252" height={5} rx={1.5} width={8} x={12} y={55} />
      <Rect fill="#3B4252" height={5} rx={1.5} width={8} x={44} y={55} />
    </Frame>
  );
}

/** Profit and loss: a chart with a green rise and a red fall. */
export function ProfitLossArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#EEF3FB" height={50} rx={7} stroke="#C8D3E3" strokeWidth={1.4} width={50} x={7} y={9} />
      <Path d="M14 22h36M14 32h36M14 42h36" stroke="#D7E0EC" strokeWidth={1.2} />
      <Path d="M14 30l10 10 8-6 12 12" fill="none" stroke="#E5484D" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
      <Path d="M44 39v7h-7" fill="none" stroke="#E5484D" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
      <Path d="M14 46l12-12 8 6 14-16" fill="none" stroke="#1F9D63" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
      <Path d="M41 24h7v7" fill="none" stroke="#1F9D63" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
    </Frame>
  );
}

/** VMS: a visitor with a backpack at the front desk, and a visitor badge. */
export function VisitorDeskArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      {/* The receptionist behind the desk. */}
      <Path d="M30 44c0-8 4-12 10-12s10 4 10 12Z" fill="#3B4252" />
      <Path d="M40 33l-2 3 2 7 2-7Z" fill="#DCE6F5" />
      <Circle cx={40} cy={24} fill={SKIN} r={7} />
      <Path d="M33 23c-.4-5.6 3-8.6 7-8.6s7.6 3 7 8c-1.4-2.6-4-3.6-7-3.6s-5.4 1.2-7 4.2Z" fill={HAIR} />
      <Rect fill="#C9844F" height={18} rx={2} width={34} x={24} y={42} />
      <Rect fill="#D99A62" height={4} rx={1} width={36} x={23} y={40} />
      {/* The visitor, from behind, with a backpack. */}
      <Path d="M2 64c0-12 6-18 14-18s14 6 14 18Z" fill="#E3D5C2" />
      <Rect fill="#3B4252" height={18} rx={5} width={18} x={7} y={46} />
      <Circle cx={16} cy={36} fill={HAIR} r={9} />
      <Path d="M8 36a8 8 0 0 1 16 0c-2-2-5-3-8-3s-6 1-8 3Z" fill="#40455D" />
      {/* The visitor badge. */}
      <Rect fill="#2F6CD9" height={22} rx={3} width={17} x={44} y={38} />
      <Rect fill="#DCE8FF" height={16} rx={2} width={13} x={46} y={42} />
      <Rect fill="#1F4FBF" height={4} rx={1} width={6} x={49.5} y={35.5} />
      <Circle cx={52.5} cy={47} fill="#2F6CD9" r={2.6} />
      <Path d="M48.6 53.6c.6-2.2 2.2-3.4 3.9-3.4s3.3 1.2 3.9 3.4Z" fill="#2F6CD9" />
    </Frame>
  );
}

/** Bookings: a blue calendar with a bed, a gold key and a green tick. */
export function BookingsArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#2F6CD9" height={46} rx={7} width={46} x={12} y={8} />
      <Rect fill="#DCE8FF" height={32} rx={4} width={38} x={16} y={19} />
      {[22, 34, 46].map((x) => (
        <Rect fill="#9AA6B8" height={10} key={x} rx={2} width={4} x={x} y={4} />
      ))}
      <Path d="M24 40v-9h4v5h8v-3h7a3 3 0 0 1 3 3v7h-3v-3H27v3h-3Z" fill="#1F4FBF" />
      <Circle cx={31} cy={33} fill="#1F4FBF" r={2.4} />
      {/* The key. */}
      <G transform="rotate(30 12 30)">
        <Circle cx={12} cy={26} fill="#F5A524" r={7} />
        <Circle cx={12} cy={26} fill="#DCE8FF" r={2.6} />
        <Rect fill="#F5A524" height={22} rx={2} width={4.4} x={9.8} y={31} />
        <Rect fill="#F5A524" height={3} width={5} x={14} y={44} />
        <Rect fill="#F5A524" height={3} width={4} x={14} y={49} />
      </G>
      <Circle cx={51} cy={51} fill="#FFFFFF" r={10} />
      <Circle cx={51} cy={51} fill="#1F9D63" r={8.4} />
      <Path d="M47 51.2l2.8 2.8 5.2-5.6" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Frame>
  );
}
