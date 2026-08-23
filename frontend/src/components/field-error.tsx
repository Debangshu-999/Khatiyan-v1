import { Text } from "react-native";

import { useTheme } from "@/theme/use-theme";

/**
 * Validation text under a field: what YOU typed is wrong, fix it here.
 *
 * <p>Not a toast and not a modal. A toast for "Enter a title" floats away from
 * the box it is talking about, and a modal makes the reader dismiss something
 * before they can act on it. Refusals from the SERVER go to `ErrorModal`
 * instead — those are not about the shape of the input, and there is nothing on
 * screen to look at.
 *
 * <p>Renders nothing when there is no message, so it can sit in the tree
 * unconditionally without reserving space.
 */
export function FieldError({ message }: { message?: string }) {
  const { colors, fonts } = useTheme();

  if (!message) {
    return null;
  }

  return (
    <Text
      accessibilityLiveRegion="polite"
      style={{ color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 17 }}
    >
      {message}
    </Text>
  );
}
