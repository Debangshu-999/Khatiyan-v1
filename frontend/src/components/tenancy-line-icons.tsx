import { forwardRef, useId } from "react";
import { ArrowLeftRight, type LucideProps } from "lucide-react-native";
import Svg, { ClipPath, Defs, Path } from "react-native-svg";
import vectorData from "./tenancy-vector-data.json";

type VectorArtwork = { viewBox: string; d: string; badge?: string; badgeCutout?: string };
function VectorPaths({ artwork, color, extraStroke = 0 }: { artwork: VectorArtwork; color: string; extraStroke?: number }) {
  const clipId = `tenancy-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return <>
    {artwork.badgeCutout ? <Defs><ClipPath id={clipId}><Path d={artwork.badgeCutout} clipRule="evenodd" /></ClipPath></Defs> : null}
    <Path d={artwork.d} fill={color} fillRule="evenodd" stroke={extraStroke ? color : undefined} strokeWidth={extraStroke} strokeLinejoin="round" clipPath={artwork.badgeCutout ? `url(#${clipId})` : undefined} />
    {artwork.badge ? <Path d={artwork.badge} fill="none" stroke={color} strokeWidth={35 + extraStroke} strokeLinecap="round" strokeLinejoin="round" /> : null}
  </>;
}

/** Individually designed artwork with matching optical size and line weight. */
function enlargedViewBox(viewBox: string, scale: number) {
  const [x, y, width, height] = viewBox.split(" ").map(Number);
  return `${x + (width - width / scale) / 2} ${y + (height - height / scale) / 2} ${width / scale} ${height / scale}`;
}

function tenancyLineIcon(name: keyof typeof vectorData, color: string, scale = 1, extraStroke = 0) {
  const artwork = vectorData[name];
  return forwardRef<SVGSVGElement, LucideProps>(function TenancyLineIcon({ size = 32, ...props }, _ref) {
    const box = typeof size === "number" ? size : Number(size) || 32;
    return (
      <Svg width={box} height={box} viewBox={enlargedViewBox(artwork.viewBox, scale)}>
        <VectorPaths artwork={artwork} color={color} extraStroke={extraStroke} />
      </Svg>
    );
  });
}

export const CreateTenancyIcon = tenancyLineIcon("create-tenancy-line", "#3F6ED8", 1.2);
export const RoomChangeIcon = forwardRef<SVGSVGElement, LucideProps>(function RoomChangeIcon({ size = 32, ...props }, _ref) {
  return <ArrowLeftRight {...props} color="#3F6ED8" size={size} strokeWidth={1.35} />;
});
export const TenancyHistoryIcon = tenancyLineIcon("tenancy-history-line", "#3F6ED8", 1.2);
export const UpcomingExitsIcon = tenancyLineIcon("upcoming-exits-line", "#3F6ED8", 1.2, 12);
export const DigestPaymentsIcon = tenancyLineIcon("digest-payments-line", "#000000");
export const DigestConcernsIcon = tenancyLineIcon("digest-concerns-line", "#000000");
export const DigestMoveInsIcon = tenancyLineIcon("digest-move-ins-line", "#000000");
export const DigestMoveOutsIcon = tenancyLineIcon("digest-move-outs-line", "#000000");
export const ActiveTenancyIcon = tenancyLineIcon("tenancy-active-line", "#000000");
export const OnNoticeTenancyIcon = tenancyLineIcon("tenancy-on-notice-line", "#000000");
export const StartedTenancyIcon = tenancyLineIcon("tenancy-started-line", "#000000");
export const EndedTenancyIcon = tenancyLineIcon("tenancy-ended-line", "#000000");
export const ExitTenancyIcon = forwardRef<SVGSVGElement, LucideProps>(function ExitTenancyIcon({ size = 24, color }, _ref) {
  const artwork = vectorData["exit-request-blue-line"];
  const fill = color === "#000000" || color === "black" || color === "#FFFFFF" || color === "white" ? color : "#3F6ED8";
  return <Svg width={Number(size)} height={Number(size)} viewBox={enlargedViewBox(artwork.viewBox, 1.2)}><VectorPaths artwork={artwork} color={fill} extraStroke={12} /></Svg>;
});
