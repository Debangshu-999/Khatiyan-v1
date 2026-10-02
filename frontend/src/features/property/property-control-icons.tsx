import type { ReactNode } from "react";
import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { useTheme } from "@/theme/use-theme";

/**
 * Filled vector property-control marks, exposed with the same props as a Lucide
 * icon so they can be dropped into ActionCard without a second card API.
 */
function Mark({ children, size = 24 }: LucideProps & { children: ReactNode }) {
  const { colors } = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 64 64" fill={colors.primary} color={colors.primary} accessible={false}>{children}</Svg>;
}

// Blue-filled vector redraws based on the original PNG subjects.
export function ManageListingIcon(props: LucideProps) {
  return <Mark {...props}>
    <Circle cx={28} cy={28} r={25} />
    <G fill="none" stroke="#FFFFFF" strokeWidth={2.5}>
      <Ellipse cx={28} cy={28} rx={13} ry={23} />
      <Path d="M28 5v46M5 28h46M9 14c10 7 28 7 38 0M9 42c10-7 28-7 38 0" />
    </G>
    <Path d="m44 42 17 17a3 3 0 0 1-4 4L40 46Z" />
    <Circle cx={43} cy={43} r={14} fill="#FFFFFF" />
    <Circle cx={43} cy={43} r={11} />
    <Circle cx={43} cy={43} r={7.5} fill="#FFFFFF" />
  </Mark>;
}

export function EnquiriesIcon(props: LucideProps) {
  return <Mark {...props}>
    <Path d="M35 25h15a10 10 0 0 1 10 10v14a8 8 0 0 1-6 8v6l-10-7H33a10 10 0 0 1-10-10V35a10 10 0 0 1 12-10Z" />
    <Path d="M12 9h30a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H23L10 59V49a10 10 0 0 1-8-10V19A10 10 0 0 1 12 9Z" stroke="#FFFFFF" strokeWidth={3} />
    <Path d="M21 24c0-10 16-10 16 0 0 7-9 6-9 12" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
    <Circle cx={28} cy={42} r={2.5} fill="#FFFFFF" />
  </Mark>;
}

export function RoomsAndBedsIcon(props: LucideProps) {
  return <Mark {...props}>
    <Rect x={9} y={8} width={46} height={30} rx={8} />
    <Rect x={13} y={17} width={17} height={12} rx={3} fill="#FFFFFF" />
    <Rect x={34} y={17} width={17} height={12} rx={3} fill="#FFFFFF" />
    <Path d="M9 30h46l7 16v8H2v-8Z" />
    <Path d="M8 34h48M4 44h56" stroke="#FFFFFF" strokeWidth={2.5} />
    <Rect x={6} y={53} width={6} height={7} rx={2} />
    <Rect x={52} y={53} width={6} height={7} rx={2} />
  </Mark>;
}

export function PropertyBoardIcon(props: LucideProps) {
  return <Mark {...props}>
    <Path d="m12 16 20-12 20 12" fill="none" stroke="currentColor" strokeWidth={3} />
    <Circle cx={32} cy={4} r={3} />
    <Rect x={2} y={15} width={60} height={46} rx={4} />
    <Rect x={6} y={19} width={52} height={38} rx={2} fill="none" stroke="#FFFFFF" strokeWidth={2} />
    <Rect x={10} y={25} width={23} height={28} rx={2} fill="#FFFFFF" transform="rotate(-6 21 39)" />
    <Rect x={38} y={33} width={15} height={21} rx={2} fill="#FFFFFF" transform="rotate(8 46 43)" />
    <Circle cx={21} cy={25} r={2} />
    <Circle cx={46} cy={33} r={2} />
  </Mark>;
}

export function NearbyLocationsIcon(props: LucideProps) {
  return <Mark {...props}>
    <Path d="m4 31 15-5 14 6 13-5 14 5 3 28-17-6-13 6-15-6-17 6Z" />
    <Path d="m19 33-1 21m15-15v21m12-22 1 16" stroke="#FFFFFF" strokeWidth={2.5} />
    <Path d="M19 3A12 12 0 0 0 7 15c0 10 12 23 12 23s12-13 12-23A12 12 0 0 0 19 3Z" stroke="#FFFFFF" strokeWidth={2} />
    <Circle cx={19} cy={15} r={4} fill="#FFFFFF" />
    <Path d="M38 21h18l6 10H32Z" stroke="#FFFFFF" strokeWidth={2} />
    <Rect x={36} y={32} width={22} height={17} rx={2} stroke="#FFFFFF" strokeWidth={2} />
    <Rect x={44} y={37} width={7} height={12} rx={1} fill="#FFFFFF" />
  </Mark>;
}

export function PropertyVisitsIcon(props: LucideProps) {
  return <Mark {...props}>
    <Rect x={5} y={9} width={45} height={46} rx={6} />
    <Path d="M9 22h37M17 5v10M37 5v10" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
    <G fill="#FFFFFF">
      <Rect x={13} y={29} width={6} height={6} rx={1} />
      <Rect x={24} y={29} width={6} height={6} rx={1} />
      <Rect x={13} y={40} width={6} height={6} rx={1} />
      <Rect x={24} y={40} width={6} height={6} rx={1} />
    </G>
    <Circle cx={46} cy={46} r={15} stroke="#FFFFFF" strokeWidth={3} />
    <Path d="M46 37v9l7 4" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
  </Mark>;
}
