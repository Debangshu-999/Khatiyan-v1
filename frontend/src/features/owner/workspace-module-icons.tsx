import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

/**
 * The workspace services as coloured vector drawings (user, 2026-11-14), the same
 * subjects as the old 3D pictures: the agreement and two people, the wallet and
 * receipt, the property clipboard and gear, the meal plan, the megaphone, the
 * person with a concern, and the staff with a briefcase. Flat colours with one
 * shade each, on a 64 grid.
 */
export type ModuleArt = (props: { size: number }) => React.JSX.Element;

const SKIN = "#F6C9A4";
const SKIN_SHADE = "#E9AE85";
const HAIR = "#2B2F45";

function Frame({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      {children}
    </Svg>
  );
}

/** Agreement behind, tenant and owner in front. */
export function TenancyArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <G transform="rotate(-6 40 22)">
        <Rect fill="#E8F0FE" height={34} rx={4} stroke="#9DB6E3" strokeWidth={1.4} width={30} x={25} y={4} />
        <Rect fill="#D2E0F8" height={33} rx={3} width={4.4} x={50} y={4.7} />
        <Rect fill="#3F7BEA" height={3.4} rx={1.7} width={16} x={30} y={10} />
        <Rect fill="#B6C2D4" height={3} rx={1.5} width={6} x={47} y={10} />
        <Rect fill="#3F7BEA" height={3.4} rx={1.7} width={12} x={30} y={16} />
        <Path d="M30 27c3-4 4 2 7-1s3-2 6 0" fill="none" stroke="#2F5FCC" strokeLinecap="round" strokeWidth={2} />
      </G>
      {/* The owner: white shirt, blue tie. */}
      <Path d="M30 64c0-10 6-16 14-16s14 6 14 16Z" fill="#CFDBEE" />
      <Path d="M44 48c4.6 0 8.6 2 11 5.6L54 64H44Z" fill="#B9C9E3" />
      <Path d="M44 49l-2.4 4 2.4 11 2.4-11Z" fill="#2F5FCC" />
      <Circle cx={44} cy={38} fill={SKIN} r={8.5} />
      <Path d="M35.5 37c-.5-7 3.5-10.5 8.5-10.5S53 30 52.6 36.6c-2-3.4-5-4.6-8.6-4.6s-6.6 1.4-8.5 5Z" fill={HAIR} />
      {/* The tenant: blue jumper, in front. */}
      <Path d="M8 64c0-9 5.5-14.5 13-14.5S34 55 34 64Z" fill="#2F7BEF" />
      <Path d="M13 64c0-6 3-10 8-11.6v11.6Z" fill="#2A6BD6" />
      <Circle cx={21} cy={42} fill={SKIN} r={8} />
      <Path d="M13 41c-.4-6.6 3.4-10 8-10s8.6 3.4 8.1 9.4c-1.8-3-4.6-4.2-8.1-4.2S14.8 37.6 13 41Z" fill={HAIR} />
    </Frame>
  );
}

/** A brown wallet with cards, and a receipt with the rupee. */
export function BillingArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#5B8FE8" height={16} rx={2.5} transform="rotate(-10 18 22)" width={26} x={5} y={14} />
      <Rect fill="#2F6CD9" height={16} rx={2.5} transform="rotate(-4 20 26)" width={26} x={7} y={19} />
      <Rect fill="#F2C94C" height={4.5} rx={1} transform="rotate(-4 20 26)" width={5.5} x={10.5} y={24} />
      <Rect fill="#8E5A3A" height={26} rx={5} width={32} x={3} y={30} />
      <Rect fill="#A86C45" height={10} rx={4} width={14} x={21} y={38} />
      <Circle cx={30} cy={43} fill="#F2C94C" r={1.8} />
      <Path d="M36 7h22v48l-3.6-2.6-3.6 2.6-3.6-2.6-3.6 2.6-3.6-2.6L36 55Z" fill="#E8F0FE" stroke="#9DB6E3" strokeLinejoin="round" strokeWidth={1.4} />
      <Rect fill="#D2E0F8" height={46} width={3.4} x={54} y={7.7} />
      <Circle cx={47} cy={19} fill="#2F6CD9" r={7.5} />
      <Path d="M44 15.5h6M44 18h6M45 15.5c3.6 0 3.6 5-.2 5l4 3.6" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
      <Rect fill="#3F7BEA" height={3} rx={1.5} width={12} x={39.5} y={31} />
      <Rect fill="#B6C2D4" height={3} rx={1.5} width={3} x={53} y={31} />
      <Rect fill="#3F7BEA" height={3} rx={1.5} width={10} x={39.5} y={37} />
      <Rect fill="#3F7BEA" height={3} rx={1.5} width={12} x={39.5} y={43} />
    </Frame>
  );
}

/** A wooden clipboard: the house, a list, and a gear for its settings. */
export function PropertyArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#D08C4E" height={56} rx={6} width={42} x={8} y={6} />
      <Rect fill="#EEF3FB" height={46} rx={3} width={34} x={12} y={12} />
      <Rect fill="#6B7487" height={9} rx={3} width={18} x={20} y={2} />
      <Circle cx={29} cy={6.5} fill="#E6ECF5" r={2.2} />
      <Path d="M29 16l10 8.5V34H19v-9.5Z" fill="#2F6CD9" />
      <Rect fill="#FFFFFF" height={7} rx={1} width={7} x={25.5} y={25} />
      <Path d="M29 25v7M25.5 28.5h7" stroke="#2F6CD9" strokeWidth={1.2} />
      {[39, 45, 51].map((y) => (
        <G key={y}>
          <Circle cx={18} cy={y} fill="#2F6CD9" r={2} />
          <Rect fill="#C8D3E3" height={3} rx={1.5} width={16} x={22} y={y - 1.5} />
        </G>
      ))}
      <G transform="translate(48 49)">
        {Array.from({ length: 8 }, (_, k) => (
          <Rect fill="#5E6678" height={6} key={k} rx={1.4} transform={`rotate(${k * 45})`} width={5.2} x={-2.6} y={-12} />
        ))}
        <Circle fill="#5E6678" r={10} />
        <Circle fill="#8B93A5" r={6.5} />
        <Circle fill="#E6ECF5" r={3.4} />
      </G>
    </Frame>
  );
}

/** The meal plan on a clipboard, with a chilli, an egg and broccoli around it. */
export function MealsArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Rect fill="#B9825A" height={50} rx={5} width={34} x={15} y={8} />
      <Rect fill="#EEF3FB" height={42} rx={3} width={28} x={18} y={13} />
      <Rect fill="#8A5A3C" height={7} rx={2.5} width={14} x={25} y={5} />
      <Circle cx={32} cy={22} fill="#C8D3E3" r={5.5} />
      <Path d="M26 32c1-3.6 3.4-5 6-5s5 1.4 6 5Z" fill="#C8D3E3" />
      {[37, 43, 49].map((y) => (
        <G key={y}>
          <Rect fill="#E6ECF5" height={3.6} rx={1} width={3.6} x={21} y={y - 1.8} />
          <Rect fill="#C8D3E3" height={2.6} rx={1.3} width={15} x={27} y={y - 1.3} />
        </G>
      ))}
      {/* The chilli. */}
      <Circle cx={9} cy={14} fill="#FFE1E1" r={8} />
      <Path d="M5 18c1-6 5-9 9-8-1 5-5 8-9 8Z" fill="#E5484D" />
      <Path d="M13 10l2-3" stroke="#3E9C5C" strokeLinecap="round" strokeWidth={2} />
      {/* The egg. */}
      <Circle cx={55} cy={22} fill="#FFEDC2" r={8} />
      <Ellipse cx={55} cy={22} fill="#FFFFFF" rx={6} ry={4.6} />
      <Circle cx={55.6} cy={22} fill="#F5A524" r={2.6} />
      {/* The broccoli. */}
      <Circle cx={9} cy={44} fill="#D8F2DD" r={8} />
      <Rect fill="#7BC47F" height={6} rx={1.5} width={3.4} x={7.3} y={44} />
      <Circle cx={6.5} cy={42} fill="#3E9C5C" r={3} />
      <Circle cx={11.5} cy={42} fill="#3E9C5C" r={3} />
      <Circle cx={9} cy={39.5} fill="#4FAE6A" r={3} />
    </Frame>
  );
}

/** A blue and white megaphone. */
export function NoticeArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <G transform="rotate(-14 32 32)">
        <Rect fill="#2F6CD9" height={14} rx={5} width={12} x={6} y={24} />
        <Rect fill="#2F6CD9" height={14} rx={4} transform="rotate(14 15 46)" width={8} x={11} y={38} />
        <Path d="M16 24l26-12v38L16 38Z" fill="#DCE8FF" />
        <Path d="M16 34l26 6v10L16 38Z" fill="#BFD3FA" />
        <Ellipse cx={44} cy={31} fill="#2F6CD9" rx={8} ry={20} />
        <Ellipse cx={44} cy={31} fill="#BFD3FA" rx={4.6} ry={15} />
        <Ellipse cx={42.5} cy={31} fill="#2F6CD9" rx={3} ry={5} />
      </G>
    </Frame>
  );
}

/** Someone thinking, hand to chin, with an orange "!" bubble. */
export function ConcernArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Path d="M4 64c0-12 8-19 18-19s18 7 18 19Z" fill="#2E8B57" />
      <Circle cx={22} cy={30} fill={SKIN} r={11} />
      <Path d="M11 29c-.6-9 4.6-14 11-14 7 0 12 5 11 12-2.4-4.4-6.4-6-11-6s-8.4 2.6-11 8Z" fill="#4A3426" />
      <Path d="M30 22c2-3 5-4 7-3-2 0-4 1.6-5 4Z" fill="#4A3426" />
      {/* The hand at the chin, the sleeve under it. */}
      <Path d="M24 64l4-14c1-3 4-4 6-2l-2 16Z" fill="#2B7E50" />
      <Rect fill={SKIN_SHADE} height={11} rx={4} transform="rotate(-20 29 40)" width={8} x={25} y={36} />
      <Path d="M36 4h20a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-9l-6 5v-5h-5a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6Z" fill="#F5A524" />
      <Rect fill="#FFFFFF" height={11} rx={1.8} width={3.6} x={44.2} y={8} />
      <Circle cx={46} cy={23} fill="#FFFFFF" r={2.2} />
    </Frame>
  );
}

/** Two staff in suits and a briefcase. */
export function StaffArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      {/* The one behind. */}
      <Path d="M32 54c0-9 5-14 12-14s12 5 12 14Z" fill="#3B4252" />
      <Path d="M44 41l-2 3 2 8 2-8Z" fill="#1F2430" />
      <Circle cx={44} cy={31} fill={SKIN_SHADE} r={7.5} />
      <Path d="M36.6 30c-.4-6 3-9 7.4-9s7.8 3 7.4 8.6c-1.6-3-4.4-4-7.4-4s-5.8 1.2-7.4 4.4Z" fill={HAIR} />
      {/* The one in front, in a blue suit. */}
      <Path d="M14 64c0-11 7-17 16-17s16 6 16 17Z" fill="#2F5FCC" />
      <Path d="M30 47l-5 4 5 13 5-13Z" fill="#FFFFFF" />
      <Path d="M30 50l-2 3 2 9 2-9Z" fill="#1F4FBF" />
      <Circle cx={30} cy={35} fill={SKIN} r={9.5} />
      <Path d="M20.5 34c-.5-7.5 4-12 9.5-12s10 4.4 9.5 11.4c-2.2-3.8-5.6-5-9.5-5s-7.4 1.6-9.5 5.6Z" fill={HAIR} />
      {/* The briefcase. */}
      <Rect fill="#8E5A3A" height={20} rx={4} width={26} x={2} y={42} />
      <Path d="M10 42v-3.4a2.6 2.6 0 0 1 2.6-2.6h4.8a2.6 2.6 0 0 1 2.6 2.6V42" fill="none" stroke="#6E4329" strokeWidth={2.4} />
      <Rect fill="#A86C45" height={3} width={26} x={2} y={50} />
      <Rect fill="#F2C94C" height={5} rx={1} width={5} x={12.5} y={49} />
    </Frame>
  );
}
