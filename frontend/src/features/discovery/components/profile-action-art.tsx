import Svg, { Circle, Path, Rect } from "react-native-svg";

import { BookingsArt } from "@/features/owner/home-tool-art";

/**
 * The property profile's Next steps as coloured vector drawings (user,
 * 2026-11-14), replacing the 3D pictures, in the style of the Home tools: flat
 * colours, one shade, no plain white parts. Each draws on a 64 grid.
 */

function Frame({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      {children}
    </Svg>
  );
}

/** Enquire: a blue question bubble in front of an amber one with three dots. */
export function EnquireArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Path d="M30 12h24a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-2v7l-8-7H30a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6Z" fill="#F5A524" />
      {[37, 43, 49].map((x) => <Circle cx={x} cy={25} fill="#9A5B07" key={x} r={2.2} />)}
      <Path d="M10 22h26a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H22l-9 8v-8h-3a7 7 0 0 1-7-7V29a7 7 0 0 1 7-7Z" fill="#2F6CD9" />
      <Path d="M17.8 32.6a5.2 5.2 0 1 1 7.2 4.8c-1.3.6-2 1.6-2 3v.6" fill="none" stroke="#DCE8FF" strokeLinecap="round" strokeWidth={3.2} />
      <Circle cx={23} cy={46} fill="#DCE8FF" r={2.1} />
    </Frame>
  );
}

/** Book a visit: a house with its door, a red map pin over it and a clock for the slot. */
export function VisitArt({ size }: { size: number }) {
  return (
    <Frame size={size}>
      <Path d="M8 32 28 14l20 18v24a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3Z" fill="#DCE8FF" />
      <Path d="M4 33.5 28 12l24 21.5-3.4 3.6L28 18.6 7.4 37.1Z" fill="#2F6CD9" />
      <Rect fill="#1F4FBF" height={17} rx={2} width={11} x={22.5} y={42} />
      <Circle cx={31} cy={51} fill="#F5A524" r={1.3} />
      <Rect fill="#9DB6E3" height={8} rx={1.5} width={8} x={12} y={38} />
      {/* The pin. */}
      <Path d="M48 4a10 10 0 0 1 10 10c0 7.4-10 17-10 17S38 21.4 38 14A10 10 0 0 1 48 4Z" fill="#E5484D" />
      <Circle cx={48} cy={14} fill="#FFE1E2" r={4} />
      {/* The clock. */}
      <Circle cx={52} cy={50} fill="#1F9D63" r={10} />
      <Circle cx={52} cy={50} fill="#DDF5E9" r={7.2} />
      <Path d="M52 45.6V50l3 2" fill="none" stroke="#1F9D63" strokeLinecap="round" strokeWidth={2.2} />
    </Frame>
  );
}

/** Book a stay: the Home Bookings drawing, a calendar with a bed, a key and a tick. */
export function StayArt({ size }: { size: number }) {
  return <BookingsArt size={size} />;
}
