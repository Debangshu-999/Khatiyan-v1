import { forwardRef, type ReactNode } from "react";
import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Tenancy control's icons as clean outlines, no fill (user, 2026-11-14): black on the
 * count cards, blue on Tenancy tools. Each takes the colour and stroke the card gives,
 * like a Lucide icon, so the card decides the ink.
 */
function outlineIcon(name: string, draw: (stroke: { color: string; width: number }) => ReactNode) {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function OutlineIcon({ color = "#000000", size = 32, strokeWidth = 1.75 }, _ref) {
    const box = typeof size === "number" ? size : Number(size) || 32;
    // Drawn on a 24 grid: the card's stroke is thinned a touch so 36-40px icons stay light.
    const width = Number(strokeWidth) * 0.85;
    return (
      <Svg fill="none" height={box} stroke={String(color)} strokeLinecap="round" strokeLinejoin="round" strokeWidth={width} viewBox="0 0 24 24" width={box}>
        {draw({ color: String(color), width })}
      </Svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

/** A person: head and shoulders, left of a badge. */
const person = (
  <>
    <Circle cx="9" cy="8" r="3.2" />
    <Path d="M3.5 19.5c0-3.1 2.5-5.5 5.5-5.5 1.3 0 2.5.4 3.4 1.2" />
  </>
);

/** A door in its frame, the opening on the right. */
const door = (
  <>
    <Path d="M4 20.5h16" />
    <Path d="M6 20.5V4.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
    <Circle cx="12.3" cy="12.5" fill="none" r="0.6" />
  </>
);

export const ActiveTenancyOutline = outlineIcon("ActiveTenancyOutline", () => (
  <>
    {person}
    <Circle cx="17" cy="16.5" r="4" />
    <Path d="M15.3 16.6l1.2 1.2 2.2-2.4" />
  </>
));

export const OnNoticeTenancyOutline = outlineIcon("OnNoticeTenancyOutline", () => (
  <>
    {person}
    <Circle cx="17" cy="16.5" r="4" />
    <Path d="M17 14.6v2l1.3.9" />
  </>
));

export const StartedTenancyOutline = outlineIcon("StartedTenancyOutline", () => (
  <>
    {door}
    <Path d="M1.8 12.5h7.4M7 10.3l2.2 2.2L7 14.7" />
  </>
));

export const EndedTenancyOutline = outlineIcon("EndedTenancyOutline", () => (
  <>
    {door}
    <Path d="M15 12.5h7.2M20 10.3l2.2 2.2-2.2 2.2" />
  </>
));

export const CreateTenancyOutline = outlineIcon("CreateTenancyOutline", () => (
  <>
    {person}
    <Path d="M17 13.5v6M14 16.5h6" />
  </>
));

export const ExitRequestOutline = outlineIcon("ExitRequestOutline", () => (
  <>
    {door}
    <Path d="M15 12.5h7.2M20 10.3l2.2 2.2-2.2 2.2" />
  </>
));

export const RoomChangeOutline = outlineIcon("RoomChangeOutline", () => (
  <>
    {/* A bed, and the swap above it. */}
    <Path d="M3 19.5v-6.5h18v6.5M3 17h18" />
    <Path d="M5.5 13v-1.6a1.4 1.4 0 0 1 1.4-1.4h3.2a1.4 1.4 0 0 1 1.4 1.4V13" />
    <Path d="M6 6.5h11.5M15 4l2.5 2.5L15 9" />
  </>
));

export const TenancyHistoryOutline = outlineIcon("TenancyHistoryOutline", () => (
  <>
    <Path d="M13 20.5H6.5a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 6.5 3h7.5l4 4v3" />
    <Path d="M8.5 8.5h4M8.5 12h3" />
    <Circle cx="17" cy="16.5" r="4.2" />
    <Path d="M17 14.4v2.1l1.4 1" />
  </>
));

export const UpcomingExitsOutline = outlineIcon("UpcomingExitsOutline", () => (
  <>
    <Rect height="15.5" rx="2" width="15" x="3" y="5" />
    <Path d="M3 9.5h15M7 3.2v3.6M14 3.2v3.6" />
    <Path d="M14.5 15.5h7.2M19.5 13.3l2.2 2.2-2.2 2.2" />
  </>
));
