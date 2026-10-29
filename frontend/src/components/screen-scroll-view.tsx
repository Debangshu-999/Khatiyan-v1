import { Children, Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

import { AppBackground } from "@/components/app-background";
import { focusedInput } from "@/components/keyboard-intent";
import { contentFitsWithoutScroll, getHeaderScrollMinHeight } from "@/components/header-scroll-layout";
import { ScreenHeader, ScreenHeaderScrollContext } from "@/components/screen-header";
import { API_TAGS, api } from "@/store/api";
import { useAppDispatch } from "@/store/hooks";
import { fetchCurrentLocation } from "@/store/slices/location-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ScreenScrollViewProps = ScrollViewProps & {
  children: ReactNode;
  centerContent?: boolean;
  background?: ReactNode;
  /**
   * Paints the screen as one flat colour instead of the app's gradient wash.
   *
   * <p>For screens that are a surface rather than a page — chat, where bubbles
   * need plain ground behind them. It has to be a prop rather than a background
   * node because the safe-area strips are painted by the outer screen itself: an
   * absolutely positioned child sits inside the padding box and leaves the inset
   * at the top and bottom showing the page colour.
   */
  surface?: string;
  onRefresh?: () => Promise<void> | void;
  // False disables pull-to-refresh entirely (e.g. auth screens, where a
  // refresh spinner makes no sense and the pull gesture feels like scrolling).
  refreshable?: boolean;
  // How far down the pull-to-refresh spinner appears. For a screen that draws
  // something over its own top edge, so the spinner is not hidden beneath it.
  refreshOffset?: number;
  // True locks scrolling while the content fits the viewport, re-enabling it
  // automatically when it overflows (small/zoomed displays, keyboard open).
  scrollOnlyWhenNeeded?: boolean;
  /**
   * On for every screen (user, 2026-10-17: "For all screens that do not have
   * enough data to enable scrolling there should be no scroll ... app wide").
   * First asked for a list with nothing in it (2026-10-11).
   *
   * <p>A page with a collapsing header used to be given room to scroll that
   * header away, so even one that fits moved under the thumb. Now no such room
   * is kept, and scrolling is locked for as long as what is on the page fits
   * the screen. A page too tall for the screen still scrolls, and so does any
   * page while the keyboard is up, so nothing is ever out of reach. False
   * keeps the old room, for a screen that needs it.
   */
  fitWithoutScroll?: boolean;
  /**
   * The bottom padding sits under a pinned footer, so it is not empty room:
   * content reaching into it is hidden, and the page only fits when it fits
   * whole (2026-10-28, the booking wizard's last line was locked under Continue).
   */
  bottomPaddingCovered?: boolean;
  safeAreaEdges?: Edge[];
};

export function ScreenScrollView({
  children,
  background,
  surface,
  centerContent = false,
  contentContainerStyle,
  onRefresh,
  onLayout,
  onContentSizeChange,
  onScroll,
  refreshable = true,
  refreshOffset,
  scrollOnlyWhenNeeded = false,
  fitWithoutScroll = true,
  bottomPaddingCovered = false,
  safeAreaEdges,
  stickyHeaderIndices,
  style,
  ...props
}: ScreenScrollViewProps) {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const [refreshing, setRefreshing] = useState(false);
  const headerScrollY = useRef(new Animated.Value(0)).current;
  const [viewportHeight, setViewportHeight] = useState(0);
  const insets = useSafeAreaInsets();

  /**
   * Bottom padding that lifts content clear of the on-screen keyboard.
   *
   * <p>
   * Replaces {@code KeyboardAvoidingView behavior="padding"}, which is broken on
   * Android under edge-to-edge (mandatory since SDK 53). That component infers
   * keyboard height by comparing screen height to window height, but edge-to-edge
   * makes the window span the whole display, so the number it derives is wrong —
   * and on dismissal its padding does not return to zero, leaving a band of dead
   * space under the content.
   *
   * <p>
   * Measuring the IME directly fixes both halves: the shown height is the real
   * one, and hide sets it to exactly 0 rather than to a computed value that
   * might not be. iOS keeps {@code automaticallyAdjustKeyboardInsets}, which
   * works correctly there.
   */
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  // Where the list currently sits, so the nudge above is relative rather than
  // absolute — scrollTo takes an absolute offset.
  const scrollOffset = useRef(0);
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const onShow = Keyboard.addListener("keyboardDidShow", (event) => {
      // Padding alone only makes ROOM below the content — it does not move the
      // view, so a field the keyboard covers stays covered. iOS handles this via
      // automaticallyAdjustKeyboardInsets; Android has no equivalent, so scroll
      // the focused input above the keyboard by hand.
      if (Platform.OS === "android") {
        // Deferred a frame or two on purpose. setKeyboardInset above grows the
        // content, and scrollTo clamps to the CURRENT content height — firing
        // immediately meant scrolling to an offset that did not exist yet, so
        // nothing moved and the field stayed hidden.
        setTimeout(() => {
          const focused = focusedInput();
          focused?.measureInWindow?.((_x, y, _width, height) => {
            const keyboardTop = Dimensions.get("window").height - event.endCoordinates.height;
            const overlap = y + height - keyboardTop + spacing.xl;
            if (overlap > 0) {
              scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.current + overlap });
            }
          });
        }, 120);
      }

      // The IME is measured from the bottom of a full-height window, so it
      // already covers the navigation-bar inset the safe area padded for.
      // Subtracting it prevents counting that strip twice.
      setKeyboardInset(Math.max(0, event.endCoordinates.height - insets.bottom));
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [insets.bottom]);
  const [contentHeight, setContentHeight] = useState(0);
  /**
   * Where the page's last item ends, from a zero-height marker after it
   * (2026-10-18). Unlike the content height it is not raised by the floor
   * below, so it can say whether the page itself fits.
   */
  const [naturalBottom, setNaturalBottom] = useState(0);
  const resolvedSafeAreaEdges: Edge[] = safeAreaEdges ?? (Platform.OS === "web" ? [] : ["top", "bottom"]);
  // Apply the already-known insets in the initial React layout. A native
  // SafeAreaView can apply its padding a frame after the entering screen or
  // its skeleton, making the title drop out of the status bar on every open.
  const safeAreaPadding = {
    paddingTop: resolvedSafeAreaEdges.includes("top") ? insets.top : 0,
    paddingBottom: resolvedSafeAreaEdges.includes("bottom") ? insets.bottom : 0,
    paddingLeft: resolvedSafeAreaEdges.includes("left") ? insets.left : 0,
    paddingRight: resolvedSafeAreaEdges.includes("right") ? insets.right : 0,
  };
  // Every screen gets the shared ambient gradient unless it supplies its own
  // (e.g. the auth hero). Foreground content scrolls over a transparent layer.
  const resolvedBackground = background ?? (surface ? null : <AppBackground />);
  // Tab screens sit under the floating (absolute) tab bar, so their content
  // needs extra bottom clearance to scroll out from beneath it. Stack screens
  // pushed over the tabs don't show the bar, so they keep the normal padding.
  const segments = useSegments();
  const inTabs = segments[0] === "(tabs)";
  const bottomPadding = inTabs ? 96 : spacing.xxl;
  // Whatever padding actually applies once the caller's style is merged — the
  // keyboard inset is added on top of that rather than replacing it.
  const flattenedContentStyle = StyleSheet.flatten(contentContainerStyle) as ViewStyle | undefined;
  const callerPaddingBottom =
    typeof flattenedContentStyle?.paddingBottom === "number" ? flattenedContentStyle.paddingBottom : bottomPadding;
  const renderedChildren = flattenScreenChildren(children);
  const detectedHeaderIndex = renderedChildren.findIndex(isScreenHeaderElement);
  const resolvedStickyHeaderIndices = stickyHeaderIndices ?? (detectedHeaderIndex >= 0 ? [detectedHeaderIndex] : undefined);
  const stickyScreenHeader = detectedHeaderIndex >= 0 && Boolean(resolvedStickyHeaderIndices?.includes(detectedHeaderIndex));
  const callerMinHeight = flattenedContentStyle?.minHeight;
  // A page that is to sit still keeps no room for its header to scroll away into.
  // Never while the keyboard is up: it covers part of the screen, and the field being typed in must stay reachable.
  const contentFits = contentFitsWithoutScroll(contentHeight, bottomPaddingCovered ? 0 : callerPaddingBottom, viewportHeight);
  const fits = fitWithoutScroll && keyboardInset === 0
    && (stickyScreenHeader
      ? viewportHeight > 0 && naturalBottom > 0 && naturalBottom <= viewportHeight + 1
        // A pinned footer covers the end of the viewport. Collapsing cards
        // must not lock scrolling while their last row is behind that footer.
        && (!bottomPaddingCovered || naturalBottom + callerPaddingBottom <= viewportHeight + 1)
        // On web onLayout fires on a size change only (a ResizeObserver), and the
        // marker is zero high: when content loads and pushes it down, nothing is
        // reported, so it kept its first, short reading and the page stayed
        // locked (user, 2026-10-29). The content's own height has to agree.
        && (Platform.OS !== "web" || contentFits)
      : contentFits);
  const scrollEnabled = fitWithoutScroll
    ? !fits
    : !scrollOnlyWhenNeeded || viewportHeight === 0 || contentHeight > viewportHeight + 1;
  // Locked while scrolled down, the page would stay where the thumb left it. It goes back to its top.
  useEffect(() => {
    if (fits) {
      scrollRef.current?.scrollTo({ animated: false, y: 0 });
      headerScrollY.setValue(0);
    }
  }, [fits, headerScrollY]);
  // Any page that scrolls gets the floor, so its header always collapses the
  // whole way (user, 2026-10-18). Withheld from pages that fit since
  // fitWithoutScroll became the default (2026-10-17), a page only a little
  // taller than the screen ran out of scroll halfway through, and its
  // description stayed on screen half faded.
  const resolvedMinHeight = stickyScreenHeader && !fits
    ? getHeaderScrollMinHeight(viewportHeight, typeof callerMinHeight === "number" ? callerMinHeight :
        typeof callerMinHeight === "string" && callerMinHeight.endsWith("%")
          ? viewportHeight * parseFloat(callerMinHeight) / 100 : 0)
    : undefined;

  async function handleRefresh() {
    setRefreshing(true);

    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        dispatch(fetchCurrentLocation());
        // Every tag, not a hand-picked few (2026-10-03). The list had fallen
        // behind: Enquiry, EnquiryChat and every tag added since were missing,
        // so a pull on those screens reloaded nothing they showed. Only the
        // queries mounted right now refetch; the rest are just marked stale.
        dispatch(api.util.invalidateTags([...API_TAGS]));
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={{ backgroundColor: surface ?? colors.background, flex: 1, ...safeAreaPadding }}>
      {/* Clip at the safe-content boundary, not the full window: a native
          sticky header or overscroll must never paint into the status bar. */}
      <View style={{ flex: 1, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          bottom: 0,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      >
        {resolvedBackground}
      </View>
      <ScreenHeaderScrollContext.Provider
        value={{ scrollY: headerScrollY, sticky: stickyScreenHeader, surface: surface ?? colors.background }}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={resolvedStickyHeaderIndices}
        // Pulled out of the prop spread and called through, rather than left to
        // `{...props}` — which lands LAST, so a caller passing onScroll used to
        // replace this handler outright and silently stop the offset tracking
        // that pull-to-refresh depends on.
          onScroll={(event) => {
            const nextOffset = event.nativeEvent.contentOffset.y;
            scrollOffset.current = nextOffset;
            if (stickyScreenHeader) {
              headerScrollY.setValue(nextOffset);
            }
            onScroll?.(event);
          }}
          scrollEventThrottle={16}
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(width, height) => {
            if (scrollOnlyWhenNeeded || fitWithoutScroll) setContentHeight(height);
            onContentSizeChange?.(width, height);
          }}
          onLayout={(event) => {
            if (stickyScreenHeader || scrollOnlyWhenNeeded || fitWithoutScroll) setViewportHeight(event.nativeEvent.layout.height);
            onLayout?.(event);
          }}
          scrollEnabled={scrollEnabled}
          refreshControl={
            refreshable ? (
              <RefreshControl
                colors={[colors.primary]}
                progressViewOffset={refreshOffset}
                onRefresh={handleRefresh}
                progressBackgroundColor={colors.surface}
                refreshing={refreshing}
                tintColor={colors.primary}
              />
            ) : undefined
          }
          style={[{ backgroundColor: "transparent", flex: 1 }, style]}
          contentContainerStyle={[
            {
              flexGrow: centerContent ? 1 : undefined,
              gap: spacing.lg,
              justifyContent: centerContent ? "center" : undefined,
              paddingBottom: bottomPadding,
              paddingHorizontal: spacing.lg,
            // Titles lead the screen directly below the safe area.
              paddingTop: spacing.sm,
            },
            contentContainerStyle,
          // LAST, so it cannot be overridden. The inset used to live in the
          // default object above, where any caller passing its own
          // paddingBottom silently wiped it — which is why the auth screen kept
          // the keyboard-over-input bug after every other screen was fixed: it
          // is the one screen that sets paddingBottom: 0, because its sheet owns
          // its own padding.
            { paddingBottom: callerPaddingBottom + keyboardInset },
            // The description/title shrink in layout, not just visually. This
            // floor prevents that shrink from clamping scrolling halfway
            // through the transition. Long pages keep their natural height;
            // screens without a sticky header are left unchanged.
            resolvedMinHeight !== undefined ? { minHeight: resolvedMinHeight } : undefined,
          ]}
          {...props}
        >
          {renderedChildren}
          {stickyScreenHeader && fitWithoutScroll ? (
            <View
              key="screen/natural-bottom"
              onLayout={(event) => {
                // Read with the header open only: its description shrinks the
                // page as it collapses, and a fit decided mid-collapse would
                // lock the page and jump it back to the top.
                if (scrollOffset.current <= 0) setNaturalBottom(event.nativeEvent.layout.y);
              }}
              pointerEvents="none"
              // Cancels the gap the content container puts before it, so it
              // adds nothing to the page's height.
              style={{ height: 0, marginTop: -(typeof flattenedContentStyle?.gap === "number" ? flattenedContentStyle.gap : spacing.lg) }}
            />
          ) : null}
        </ScrollView>
      </ScreenHeaderScrollContext.Provider>
      </View>
    </View>
  );
}

function flattenScreenChildren(children: ReactNode, parentKey = "screen"): ReactNode[] {
  const flattened: ReactNode[] = [];
  Children.toArray(children).forEach((child, index) => {
    const childKey = `${parentKey}/${isValidElement(child) ? String(child.key ?? index) : index}`;
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      flattened.push(...flattenScreenChildren(child.props.children, childKey));
      return;
    }
    flattened.push(isValidElement(child) ? cloneElement(child, { key: childKey }) : child);
  });
  return flattened;
}

function isScreenHeaderElement(child: ReactNode) {
  if (!isValidElement(child)) {
    return false;
  }
  if (child.type === ScreenHeader) {
    return true;
  }
  if (typeof child.type === "function") {
    const component = child.type as { displayName?: string; name?: string };
    return (component.displayName ?? component.name ?? "").endsWith("Header");
  }
  return false;
}
