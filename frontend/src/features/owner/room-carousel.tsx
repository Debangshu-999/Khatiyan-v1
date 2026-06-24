import { useEffect, useRef, useState, type ReactNode } from "react";
import { FlatList, Text, View, useWindowDimensions } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type RoomCarouselItem = {
  id: string;
};

type RoomCarouselProps<T extends RoomCarouselItem> = {
  rooms: T[];
  renderRoom: (room: T) => ReactNode;
};

/**
 * One-room-at-a-time pager for the property workspace. Native horizontal
 * paging keeps room actions usable while avoiding a long vertical card list.
 */
export function RoomCarousel<T extends RoomCarouselItem>({ rooms, renderRoom }: RoomCarouselProps<T>) {
  const { width } = useWindowDimensions();
  const { colors, type } = useTheme();
  const listRef = useRef<FlatList<T>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const roomKey = rooms.map((room) => room.id).join(":");
  const pageWidth = Math.max(width - spacing.lg * 2, 1);
  const displayedIndex = Math.min(activeIndex, Math.max(rooms.length - 1, 0));

  useEffect(() => {
    setActiveIndex(0);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ animated: false, offset: 0 }));
  }, [roomKey]);

  function goToRoom(index: number) {
    const targetIndex = Math.max(0, Math.min(index, rooms.length - 1));
    listRef.current?.scrollToIndex({ animated: true, index: targetIndex });
    setActiveIndex(targetIndex);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
          Room {displayedIndex + 1} of {rooms.length}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <CarouselControl
            accessibilityLabel="Previous room"
            disabled={displayedIndex === 0}
            icon={ChevronLeft}
            onPress={() => goToRoom(displayedIndex - 1)}
          />
          <CarouselControl
            accessibilityLabel="Next room"
            disabled={displayedIndex === rooms.length - 1}
            icon={ChevronRight}
            onPress={() => goToRoom(displayedIndex + 1)}
          />
        </View>
      </View>

      <FlatList
        data={rooms}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ index, length: pageWidth, offset: pageWidth * index })}
        horizontal
        keyExtractor={(room) => room.id}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
          setActiveIndex(Math.max(0, Math.min(nextIndex, rooms.length - 1)));
        }}
        pagingEnabled
        ref={listRef}
        renderItem={({ item }) => <View style={{ width: pageWidth }}>{renderRoom(item)}</View>}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={{ width: pageWidth }}
      />

      <View
        accessibilityRole="adjustable"
        accessibilityValue={{ max: rooms.length, min: 1, now: displayedIndex + 1 }}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center" }}
      >
        {rooms.map((room, index) => (
          <View
            key={room.id}
            style={{
              backgroundColor: index === displayedIndex ? colors.primary : colors.border,
              borderRadius: 999,
              height: 6,
              width: index === displayedIndex ? 18 : 6,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function CarouselControl({
  accessibilityLabel,
  disabled,
  icon: Icon,
  onPress,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: typeof ChevronLeft;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        height: 36,
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
        width: 36,
      }}
    >
      <Icon color={colors.ink} size={17} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}