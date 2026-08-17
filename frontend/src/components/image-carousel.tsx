import { useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Dash indicators driven by a scroll offset.
 *
 * <p>Driven by the offset rather than an index set on momentum end: that event
 * fires late — and on web often not at all — which left the first dash lit
 * while the second image was already on screen.
 *
 * <p>The dark pill is not decoration. A white dash over a white photo is
 * invisible and no opacity on the dash itself can fix it; the contrast has to
 * come from behind. Its fill is literal, not a theme token, because the ground
 * is dark in both modes.
 */
function Dashes({ count, scrollX, width }: { count: number; scrollX: Animated.Value; width: number }) {
  if (count < 2 || width <= 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: "center",
        bottom: spacing.md,
        flexDirection: "row",
        justifyContent: "center",
        left: 0,
        position: "absolute",
        right: 0,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.45)",
          borderRadius: 999,
          flexDirection: "row",
          gap: 5,
          paddingHorizontal: spacing.sm,
          paddingVertical: 6,
        }}
      >
        {Array.from({ length: count }).map((_, dotIndex) => {
          const range = [(dotIndex - 1) * width, dotIndex * width, (dotIndex + 1) * width];
          return (
            <Animated.View
              key={`dash-${dotIndex}`}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 999,
                height: 3,
                opacity: scrollX.interpolate({ extrapolate: "clamp", inputRange: range, outputRange: [0.45, 1, 0.45] }),
                width: scrollX.interpolate({ extrapolate: "clamp", inputRange: range, outputRange: [8, 18, 8] }),
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/**
 * Full-screen viewer: the same swipe and the same dashes, on black.
 *
 * <p>Lives here rather than in each screen so the two carousels cannot drift.
 * Both previously carried their own Modal, and one showed a static image while
 * the strip below it swiped.
 *
 * <p>Exported for callers that have a single image and no carousel to wrap it
 * in — the profile avatar, for one. Pass a one-item array: the dashes hide
 * themselves below two images, so it degrades to a plain full-screen view
 * without a separate component to maintain.
 *
 * <p>Opens on the image that was tapped via {@code contentOffset}, not a
 * scrollTo effect, so it is already in place on first paint instead of jumping
 * there afterwards. Images are {@code contain}, not {@code cover}: this is the
 * view someone opens precisely to see the whole thing.
 */
export function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: "#000000", flex: 1 }}>
        <SafeAreaView edges={["top"]} style={{ zIndex: 2 }}>
          <Pressable
            accessibilityLabel="Close image"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            style={{
              alignItems: "center",
              alignSelf: "flex-end",
              backgroundColor: "rgba(255,255,255,0.14)",
              borderRadius: 999,
              height: 40,
              justifyContent: "center",
              margin: spacing.md,
              width: 40,
            }}
          >
            <X color="#FFFFFF" size={20} strokeWidth={2.4} />
          </Pressable>
        </SafeAreaView>

        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flex: 1 }}>
          {width > 0 ? (
            <Animated.ScrollView
              contentOffset={{ x: initialIndex * width, y: 0 }}
              horizontal
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                useNativeDriver: false,
              })}
              pagingEnabled
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
            >
              {images.map((imageUrl, imageIndex) => (
                <View key={`full-${imageUrl}-${imageIndex}`} style={{ height: "100%", width }}>
                  <Image resizeMode="contain" source={{ uri: imageUrl }} style={{ height: "100%", width: "100%" }} />
                </View>
              ))}
            </Animated.ScrollView>
          ) : null}
          <Dashes count={images.length} scrollX={scrollX} width={width} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * A swipeable image window with dash indicators, and a full-screen view on tap.
 *
 * <p>Replaces the static-image-plus-thumbnail-strip pattern. Swiping is how
 * people expect to move through photos on a phone; a row of thumbnails asks
 * them to aim at a 68px target instead, and it ate the bottom of the image it
 * was overlaying.
 *
 * <p>Width comes from {@code onLayout} rather than {@code Dimensions}, so it
 * pages correctly inside a padded card as well as edge to edge — the screen
 * width is not the page width wherever there is a margin.
 */
export function ImageCarousel({
  height = 260,
  images,
  radius = 16,
}: {
  height?: number;
  images: string[];
  radius?: number;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  if (images.length === 0) {
    return null;
  }

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ backgroundColor: colors.primarySoft, borderRadius: radius, height, overflow: "hidden" }}
    >
      <Animated.ScrollView
        horizontal
        // Width cannot be animated on the native thread, so this stays on JS.
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        pagingEnabled
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
      >
        {images.map((imageUrl, imageIndex) => (
          <Pressable
            accessibilityLabel={`Image ${imageIndex + 1} of ${images.length}. Opens full screen.`}
            accessibilityRole="button"
            key={`${imageUrl}-${imageIndex}`}
            onPress={() => setExpandedIndex(imageIndex)}
            style={{ height, width: width || undefined }}
          >
            <Image resizeMode="cover" source={{ uri: imageUrl }} style={{ height: "100%", width: "100%" }} />
          </Pressable>
        ))}
      </Animated.ScrollView>

      <Dashes count={images.length} scrollX={scrollX} width={width} />

      {expandedIndex != null ? (
        <Lightbox images={images} initialIndex={expandedIndex} onClose={() => setExpandedIndex(null)} />
      ) : null}
    </View>
  );
}
