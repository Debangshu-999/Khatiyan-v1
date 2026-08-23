import { useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MoreVertical, X } from "lucide-react-native";

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
  actions,
  images,
  initialIndex,
  onClose,
}: {
  /**
   * Offered behind an overflow button, against whichever image is on screen.
   *
   * <p>Optional, and absent by default: a viewer with nothing to offer should
   * not grow a menu button that opens an empty sheet. The callback is handed
   * the image it was opened against rather than reading an index later, because
   * the person can keep swiping while the sheet is open.
   */
  actions?: { label: string; onPress: (imageUrl: string, index: number) => void }[];
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(0);
  // Which image the overflow menu would act on. Tracked separately from the
  // scroll offset the dashes use: those interpolate continuously, and an action
  // needs one settled answer rather than a value mid-swipe.
  const [index, setIndex] = useState(initialIndex);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: "#000000", flex: 1 }}>
        <SafeAreaView edges={["top"]} style={{ zIndex: 2 }}>
          <View
            style={{
              alignSelf: "flex-end",
              flexDirection: "row",
              gap: spacing.sm,
              margin: spacing.md,
            }}
          >
            {actions?.length ? (
              <Pressable
                accessibilityLabel="Image options"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setMenuOpen(true)}
                style={roundButton}
              >
                <MoreVertical color="#FFFFFF" size={20} strokeWidth={2.4} />
              </Pressable>
            ) : null}

            <Pressable
              accessibilityLabel="Close image"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={roundButton}
            >
              <X color="#FFFFFF" size={20} strokeWidth={2.4} />
            </Pressable>
          </View>
        </SafeAreaView>

        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flex: 1 }}>
          {width > 0 ? (
            <Animated.ScrollView
              contentOffset={{ x: initialIndex * width, y: 0 }}
              horizontal
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                useNativeDriver: false,
              })}
              onMomentumScrollEnd={(event) =>
                setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
              }
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

        {menuOpen && actions?.length ? (
          <Pressable
            accessibilityLabel="Close options"
            onPress={() => setMenuOpen(false)}
            style={{
              backgroundColor: "rgba(0,0,0,0.55)",
              bottom: 0,
              justifyContent: "flex-end",
              left: 0,
              position: "absolute",
              right: 0,
              top: 0,
            }}
          >
            <SafeAreaView edges={["bottom"]} style={{ backgroundColor: "#1A1A1A" }}>
              {actions.map((action) => (
                <Pressable
                  accessibilityRole="button"
                  key={action.label}
                  onPress={() => {
                    setMenuOpen(false);
                    action.onPress(images[index], index);
                  }}
                  style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </SafeAreaView>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * The two controls in the viewer's top bar.
 *
 * <p>A translucent white disc rather than a bare glyph: these sit over a photo
 * whose colour is unknown, and a white icon on a white sky is invisible.
 */
const roundButton = {
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.14)",
  borderRadius: 999,
  height: 40,
  justifyContent: "center",
  width: 40,
} as const;

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
/**
 * The current photo's caption, top-left.
 *
 * <p>Cross-faded on the same scroll offset the dashes use, rather than swapped
 * on an index: momentum-end fires late, and on web often not at all, which would
 * leave the previous photo's words over the next photo.
 *
 * <p>Same dark pill as the dashes, for the same reason — white text over a white
 * photo is invisible, and the contrast has to come from behind it.
 */
function Captions({
  captions,
  scrollX,
  width,
}: {
  captions?: Array<string | null | undefined>;
  scrollX: Animated.Value;
  width: number;
}) {
  if (!captions || width <= 0 || !captions.some((caption) => caption && caption.trim())) {
    return null;
  }

  return (
    <View pointerEvents="none" style={{ left: spacing.md, position: "absolute", right: spacing.xxl, top: spacing.md }}>
      {captions.map((caption, at) => {
        if (!caption || !caption.trim()) {
          return null;
        }
        const range = [(at - 1) * width, at * width, (at + 1) * width];
        return (
          <Animated.View
            key={`caption-${at}`}
            style={{
              alignSelf: "flex-start",
              backgroundColor: "rgba(0,0,0,0.45)",
              borderRadius: 999,
              // Stacked, not laid out: each sits in the same spot and only the
              // one on screen is opaque.
              position: at === 0 ? "relative" : "absolute",
              opacity: scrollX.interpolate({ extrapolate: "clamp", inputRange: range, outputRange: [0, 1, 0] }),
              paddingHorizontal: spacing.sm,
              paddingVertical: 5,
              top: 0,
            }}
          >
            <Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>
              {caption.trim()}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function ImageCarousel({
  captions,
  height = 260,
  images,
  radius = 16,
}: {
  /**
   * One per image, same order. Optional throughout — a caller with nothing to
   * say passes nothing and the overlay never renders.
   */
  captions?: Array<string | null | undefined>;
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

      <Captions captions={captions} scrollX={scrollX} width={width} />
      <Dashes count={images.length} scrollX={scrollX} width={width} />

      {expandedIndex != null ? (
        <Lightbox images={images} initialIndex={expandedIndex} onClose={() => setExpandedIndex(null)} />
      ) : null}
    </View>
  );
}
