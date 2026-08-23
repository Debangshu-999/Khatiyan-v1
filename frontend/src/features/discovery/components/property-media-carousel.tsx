import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft, Images } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ImageCarousel } from "@/components/image-carousel";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PropertyMediaCarouselProps = {
  /** One per URL, same order. Absent when the caller has none. */
  captions?: Array<string | null | undefined>;
  imageUrls?: Array<string | null | undefined> | null;
  propertyName: string;
};

export function PropertyMediaCarousel({ captions, imageUrls, propertyName }: PropertyMediaCarouselProps) {
  const { colors } = useTheme();
  const images = useMemo(() => (imageUrls ?? []).filter((url): url is string => Boolean(url)), [imageUrls]);
  const hasImages = images.length > 0;

  return (
    <View style={{ backgroundColor: colors.primarySoft, height: 260, overflow: "hidden" }}>
      {hasImages ? (
        <>
          <ImageCarousel captions={captions} images={images} radius={0} />

        </>
      ) : (
        <View style={{ alignItems: "center", flex: 1, gap: spacing.sm, justifyContent: "center", padding: spacing.lg }}>
          <Images color={colors.primary} size={42} strokeWidth={1.8} />
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "900", textAlign: "center" }}>
            No images available
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 20, textAlign: "center" }}>
            Property photos will appear here after the owner adds them.
          </Text>
        </View>
      )}
    </View>
  );
}
