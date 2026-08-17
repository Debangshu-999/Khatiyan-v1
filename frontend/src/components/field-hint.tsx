import { Text } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A one-line caption under a form field, for the bounds a value must respect.
 *
 * <p>Limits belong on screen, not in an error message. Discovering that grace
 * days cap at 10 by entering 15 and being rejected is a worse experience than
 * simply being told first, and a placeholder cannot carry it — the placeholder
 * disappears the moment someone starts typing.
 */
export function FieldHint({ text }: { text: string }) {
  const { colors, type } = useTheme();

  return (
    <Text
      style={[
        type.caption,
        {
          color: colors.muted,
          marginTop: -spacing.xs,
        },
      ]}
    >
      {text}
    </Text>
  );
}
