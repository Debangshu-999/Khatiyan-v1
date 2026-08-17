import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft, Images } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ImageCarousel } from "@/components/image-carousel";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PropertyMediaCarouselProps = {
  imageUrls?: Array<string | null | undefined> | null;
  propertyName: string;
  onBack: () => void;
};

export function PropertyMediaCarousel({ imageUrls, onBack, propertyName }: PropertyMediaCarouselProps) {
  const { colors } = useTheme();
  const images = useMemo(() => (imageUrls ?? []).filter((url): url is string => Boolean(url)), [imageUrls]);
  const hasImages = images.length > 0;

  return (
    <View style={{ backgroundColor: colors.primarySoft, height: 260, overflow: "hidden" }}>
      <AnimatedPressable
        accessibilityLabel="Back to listings"
        onPress={onBack}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 999,
          borderWidth: 1,
          height: 44,
          justifyContent: "center",
          left: spacing.md,
          position: "absolute",
          top: spacing.md,
          width: 44,
          zIndex: 5,
        }}
      >
        <ArrowLeft color={colors.text} size={21} strokeWidth={2.5} />
      </AnimatedPressable>

      {hasImages ? (
        <>
          <ImageCarousel images={images} radius={0} />

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
