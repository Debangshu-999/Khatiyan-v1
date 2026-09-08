import { useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { ImageOff, Images } from "lucide-react-native";

import { Lightbox } from "@/components/image-carousel";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PropertyMediaCarouselProps = {
  captions?: Array<string | null | undefined>;
  imageUrls?: Array<string | null | undefined> | null;
  propertyName: string;
};

const THUMBNAIL_SLOTS = 5;

/**
 * A mobile-first property gallery with one selected hero and exactly five
 * stable thumbnail slots. The fixed strip keeps the gallery from changing
 * shape as listings gain photos, while the fifth slot becomes the full-gallery
 * entry point only when there are more than five images.
 */
export function PropertyMediaCarousel({ imageUrls, propertyName }: PropertyMediaCarouselProps) {
  const { colors, fonts } = useTheme();
  const images = useMemo(() => (imageUrls ?? []).filter((url): url is string => Boolean(url)), [imageUrls]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const activeIndex = selectedIndex < images.length ? selectedIndex : 0;
  const overflowCount = Math.max(0, images.length - THUMBNAIL_SLOTS);

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 18,
          borderWidth: 1,
          height: 224,
          overflow: "hidden",
        }}
      >
        {images.length > 0 ? (
          <Pressable
            accessibilityLabel={`Image ${activeIndex + 1} of ${images.length} for ${propertyName}. Opens full screen.`}
            accessibilityRole="button"
            onPress={() => setExpandedIndex(activeIndex)}
            style={{ flex: 1 }}
          >
            <Image resizeMode="cover" source={{ uri: images[activeIndex] }} style={{ height: "100%", width: "100%" }} />
            <View
              pointerEvents="none"
              style={{
                backgroundColor: "rgba(15,23,42,0.72)",
                borderRadius: 999,
                bottom: spacing.sm,
                paddingHorizontal: spacing.sm,
                paddingVertical: 5,
                position: "absolute",
                right: spacing.sm,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 12 }}>
                {activeIndex + 1} / {images.length}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={{ alignItems: "center", flex: 1, gap: spacing.sm, justifyContent: "center", padding: spacing.lg }}>
            <Images color={colors.kicker} size={36} strokeWidth={1.7} />
            <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 15 }}>
              No property photos yet
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12, textAlign: "center" }}>
              Photos will appear here after the property adds them.
            </Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 7 }}>
        {Array.from({ length: THUMBNAIL_SLOTS }, (_, slotIndex) => {
          const imageUrl = images[slotIndex];
          const isSelected = Boolean(imageUrl) && activeIndex === slotIndex;
          const isOverflow = slotIndex === THUMBNAIL_SLOTS - 1 && overflowCount > 0;

          return (
            <Pressable
              accessibilityLabel={
                imageUrl
                  ? isOverflow
                    ? `Open all ${images.length} property images`
                    : `Show property image ${slotIndex + 1}`
                  : `No image in slot ${slotIndex + 1}`
              }
              accessibilityRole={imageUrl ? "button" : undefined}
              disabled={!imageUrl}
              key={`property-thumbnail-${slotIndex}`}
              onPress={() => {
                if (!imageUrl) return;
                if (isOverflow) {
                  setExpandedIndex(slotIndex);
                  return;
                }
                setSelectedIndex(slotIndex);
              }}
              style={{
                alignItems: "center",
                aspectRatio: 1.08,
                backgroundColor: colors.surfaceSunken,
                borderColor: isSelected ? colors.primary : colors.border,
                borderCurve: "continuous",
                borderRadius: radii.sm,
                borderWidth: isSelected ? 2 : 1,
                flex: 1,
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {imageUrl ? (
                <>
                  <Image resizeMode="cover" source={{ uri: imageUrl }} style={{ height: "100%", width: "100%" }} />
                  {isOverflow ? (
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: "rgba(15,23,42,0.62)",
                        bottom: 0,
                        justifyContent: "center",
                        left: 0,
                        position: "absolute",
                        right: 0,
                        top: 0,
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 20 }}>
                        +{overflowCount}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <ImageOff color={colors.borderStrong} size={18} strokeWidth={1.7} />
              )}
            </Pressable>
          );
        })}
      </View>

      {expandedIndex != null && images.length > 0 ? (
        <Lightbox images={images} initialIndex={expandedIndex} onClose={() => setExpandedIndex(null)} />
      ) : null}
    </View>
  );
}
