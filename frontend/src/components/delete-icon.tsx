import type { LucideProps } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

import { useTheme } from "@/theme/use-theme";

/** Solid red bin, deliberately without interior stripes or a contrasting stroke. */
export function DeleteIcon({ size = 24, color: _color, strokeWidth: _strokeWidth, ...props }: LucideProps) {
  const { colors } = useTheme();
  return (
    <Svg {...props} width={size} height={size} viewBox="0 0 24 24" fill={colors.danger} stroke="none">
      <Path d="M9 2a1 1 0 0 0-1 1v1H5a1.5 1.5 0 0 0 0 3h14a1.5 1.5 0 0 0 0-3h-3V3a1 1 0 0 0-1-1H9Zm-3 6 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12H6Z" />
    </Svg>
  );
}
