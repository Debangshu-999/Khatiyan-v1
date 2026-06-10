import { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft, Images, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PropertyMediaCarouselProps = {
  imageUrls?: Array<string | null | undefined> | null;
  propertyName: string;
  onBack: () => void;
};

export function PropertyMediaCarousel({ imageUrls, onBack, propertyName }: PropertyMediaCarouselProps) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const images = useMemo(() => (imageUrls ?? []).filter((url): url is string => Boolean(url)), [imageUrls]);
  const hasImages = images.length > 0;
  const activeImage = images[activeIndex] ?? images[0];

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
          <Pressable accessibilityLabel="Open property image" onPress={() => setExpanded(true)} style={{ flex: 1 }}>
            <Image source={{ uri: activeImage }} style={{ height: "100%", width: "100%" }} resizeMode="cover" />
          </Pressable>

          {images.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ bottom: spacing.md, left: spacing.md, position: "absolute", right: spacing.md }}
              contentContainerStyle={{ gap: spacing.xs }}
            >
              {images.map((imageUrl, index) => (
                <Pressable
                  accessibilityLabel={`Show property image ${index + 1}`}
                  key={imageUrl}
                  onPress={() => setActiveIndex(index)}
                  style={{
                    borderColor: index === activeIndex ? colors.primary : colors.surface,
                    borderRadius: 12,
                    borderWidth: 2,
                    overflow: "hidden",
                  }}
                >
                  <Image source={{ uri: imageUrl }} style={{ height: 52, width: 68 }} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <Modal animationType="fade" onRequestClose={() => setExpanded(false)} transparent visible={expanded}>
            <View
              style={{
                backgroundColor: "rgba(0,0,0,0.92)",
                flex: 1,
                justifyContent: "center",
                padding: spacing.md,
              }}
            >
              <AnimatedPressable
                accessibilityLabel="Close image"
                onPress={() => setExpanded(false)}
                style={{
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.14)",
                  borderRadius: 999,
                  height: 44,
                  justifyContent: "center",
                  position: "absolute",
                  right: spacing.lg,
                  top: spacing.xl,
                  width: 44,
                  zIndex: 2,
                }}
              >
                <X color="#fff" size={22} strokeWidth={2.5} />
              </AnimatedPressable>
              <Image source={{ uri: activeImage }} style={{ height: "78%", width: "100%" }} resizeMode="contain" />
              <Text style={{ color: "#fff", fontWeight: "800", textAlign: "center" }} selectable>
                {propertyName}
              </Text>
            </View>
          </Modal>
        </>
      ) : (
        <View style={{ alignItems: "center", flex: 1, gap: spacing.sm, justifyContent: "center", padding: spacing.lg }}>
          <Images color={colors.primary} size={42} strokeWidth={1.8} />
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "900", textAlign: "center" }} selectable>
            No images available
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 20, textAlign: "center" }} selectable>
            Property photos will appear here after the owner adds them.
          </Text>
        </View>
      )}
    </View>
  );
}
