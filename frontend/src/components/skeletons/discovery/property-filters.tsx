import { View } from "react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";

/**
 * The property filters sheet, while it opens.
 *
 * <p>Shaped like its sections: a 48pt glyph disc beside a title and a line of
 * description, then a two-column grid of choice chips. Three sections fill the
 * first screen of the sheet, which is all anyone sees before the real controls
 * land, so the sheet does not change height under the reader.
 */
export function PropertyFiltersSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <View style={{ gap: spacing.lg }}>
      {Array.from({ length: sections }, (_, index) => (
        <View key={index} style={{ gap: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <Skeleton height={48} radius={999} width={48} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton height={16} width="46%" />
              <Skeleton height={12} width="72%" />
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {Array.from({ length: 4 }, (__, chip) => (
              <View key={chip} style={{ flexBasis: "47%", flexGrow: 1 }}>
                <Skeleton height={44} radius={12} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
