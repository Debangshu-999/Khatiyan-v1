import { CircleAlert, CircleCheck, Info } from "lucide-react-native";

import { useTheme } from "@/theme/use-theme";

export type StatusTone = "error" | "warning" | "success" | "info";

/**
 * The app's status mark: a solid tone-coloured disc with a white glyph inside.
 *
 * <p>This is the ONE shape that says "something happened" — a refusal, a
 * success, a warning. It is deliberately the opposite of the icon rule used
 * everywhere else (outlined container, ink glyph, no fill): navigation and
 * tiles should recede, while a status mark has to be read before the sentence
 * beside it. Filled and coloured is what makes that difference instant.
 *
 * <p>The disc is the glyph's own circle, not a wrapper View. Lucide's
 * circle-alert / circle-check / info already draw one, so filling it gives a
 * solid disc with the mark knocked out in white — one element instead of two
 * nested ones, and the mark stays optically centred at any size.
 *
 * <p>The circle's stroke is white too, so on a white surface the disc reads
 * very slightly inset. That is intended; on a dark surface it becomes a thin
 * white ring, which is what keeps the mark legible there.
 */
/**
 * The glyph and fill for each tone.
 *
 * <p>Exported so anything drawing a tone ALONGSIDE the mark — a toast's bottom
 * rule, a banner edge — reads the same colour from the same place. Duplicating
 * the mapping is how a red disc ends up over an amber border.
 */
export function statusTonePalette(tone: StatusTone, colors: ReturnType<typeof useTheme>["colors"]) {
  return {
    error: { Icon: CircleAlert, fill: colors.danger },
    info: { Icon: Info, fill: colors.primary },
    success: { Icon: CircleCheck, fill: colors.jade },
    warning: { Icon: CircleAlert, fill: colors.warning },
  }[tone];
}

export function StatusIcon({ size = 44, tone }: { size?: number; tone: StatusTone }) {
  const { colors } = useTheme();
  const { Icon, fill } = statusTonePalette(tone, colors);

  // Literal white, never colors.onPrimary: that token is #050505 in the dark
  // theme and would render a near-black mark on the disc.
  return <Icon color="#FFFFFF" fill={fill} size={size} strokeWidth={2} />;
}
