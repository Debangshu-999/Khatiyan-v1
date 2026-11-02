import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ArrowLeft } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { pinnedFooterEdge } from "@/components/pinned-footer";
import type { MetroLine, MetroStation } from "@/store/services/metro-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { isWholeLineTicked, textOnLineColour, toggleLine, toggleStation } from "./metro-system";

const RAIL_COLUMN = 28;

/** One line's stations in order, on a rail in the line's colour. A view inside the filters page. */
export function MetroLineScreen({
  line,
  onBack,
  onChange,
  onDone,
  selected,
}: {
  line: MetroLine;
  onBack: () => void;
  onChange: (codes: string[]) => void;
  /** Runs the search with the ticks: the metro tab has no Search button (user, 2026-10-31). */
  onDone: () => void;
  selected: string[];
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const onColour = textOnLineColour(line.colour);
  const wholeLine = isWholeLineTicked(selected, line);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: line.colour,
          flexDirection: "row",
          gap: 14,
          paddingHorizontal: 18,
          paddingVertical: 14,
        }}
      >
        <AnimatedPressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={onBack}
          style={{ alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 999, height: 36, justifyContent: "center", width: 36 }}
        >
          <ArrowLeft color="#111111" size={21} strokeWidth={2.75} />
        </AnimatedPressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: onColour, fontFamily: fonts.sansBold, fontSize: 18 }}>{line.name}</Text>
          <Text numberOfLines={1} style={{ color: onColour, fontFamily: fonts.sans, fontSize: 12 }}>
            {`${line.fromStation} to ${line.toStation}`}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 116 + insets.bottom, paddingHorizontal: spacing.md, paddingTop: spacing.sm }}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedPressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: wholeLine }}
          onPress={() => onChange(toggleLine(selected, line))}
          style={{ alignItems: "center", flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>Select all</Text>
          <TickBox ticked={wholeLine} />
        </AnimatedPressable>

        {line.stations.map((station, index) => (
          <StationRow
            colour={line.colour}
            first={index === 0}
            key={station.code}
            last={index === line.stations.length - 1}
            onPress={() => onChange(toggleStation(selected, station.code))}
            station={station}
            ticked={selected.includes(station.code)}
          />
        ))}
      </ScrollView>

      <View
        style={{
          ...pinnedFooterEdge(colors),
          backgroundColor: colors.surface,
          bottom: 0,
          left: 0,
          paddingBottom: insets.bottom + spacing.md,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          position: "absolute",
          right: 0,
        }}
      >
        <AnimatedPressable
          accessibilityRole="button"
          onPress={onDone}
          style={{
            alignItems: "center",
            backgroundColor: colors.primary,
            borderRadius: 14,
            justifyContent: "center",
            minHeight: 52,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.displaySoft, fontSize: 15 }}>Select stations</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function StationRow({
  colour,
  first,
  last,
  onPress,
  station,
  ticked,
}: {
  colour: string;
  first: boolean;
  last: boolean;
  onPress: () => void;
  station: MetroStation;
  ticked: boolean;
}) {
  const { colors, fonts } = useTheme();
  const interchange = station.otherLineColours.length > 0;
  return (
    <AnimatedPressable
      accessibilityLabel={interchange ? `${station.name}, interchange` : station.name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked }}
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 52 }}
    >
      <View style={{ alignItems: "center", alignSelf: "stretch", justifyContent: "center", width: RAIL_COLUMN }}>
        <View
          style={{
            backgroundColor: colour,
            bottom: last ? "50%" : 0,
            position: "absolute",
            top: first ? "50%" : 0,
            width: 4,
          }}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colour,
            borderRadius: 999,
            borderWidth: 3,
            height: 14,
            width: 14,
          }}
        />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 15 }}>{station.name}</Text>
        {interchange ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            <View style={{ borderRadius: 999, flexDirection: "row", height: 8, overflow: "hidden", width: 28 }}>
              {[colour, ...station.otherLineColours].map((part) => (
                <View key={part} style={{ backgroundColor: part, flex: 1 }} />
              ))}
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11 }}>Interchange</Text>
          </View>
        ) : null}
      </View>
      <TickBox ticked={ticked} />
    </AnimatedPressable>
  );
}

function TickBox({ ticked }: { ticked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: ticked ? colors.primary : "transparent",
        borderColor: ticked ? colors.primary : colors.borderStrong,
        borderRadius: 6,
        borderWidth: 1.5,
        height: 24,
        justifyContent: "center",
        width: 24,
      }}
    >
      {ticked ? <Check color={colors.onPrimary} size={16} strokeWidth={3} /> : null}
    </View>
  );
}
