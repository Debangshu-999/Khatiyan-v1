import { useMemo, useState } from "react";
import { Image, Linking, Text, View } from "react-native";
import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { LoadFailedCard, loadFailure } from "@/components/load-failed";
import { SelectField } from "@/components/select-field";
import { GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useGetMetroSystemsQuery, type MetroLine, type MetroStation } from "@/store/services/metro-api";
import { radii, spacing } from "@/theme/spacing";
import { softShadow } from "@/theme/shadows";
import { useTheme } from "@/theme/use-theme";

import {
  chipRowsHeight,
  defaultMetroCity,
  METRO_CITIES,
  stationCountLabel,
  systemForCity,
  tickedStations,
  ticksOnLine,
  type DevicePoint,
} from "./metro-system";

// Fluent Emoji "Building construction" 3D, Microsoft, MIT licence.
const UNDER_CONSTRUCTION_ARTWORK = require("../../../../assets/empty-states/under-construction.png");

const MAX_CHIP_ROWS = 4;

const SAMPLE_LINES: MetroLine[] = [1, 2, 3, 4, 5].map((index) => ({
  code: `sample-${index}`,
  colour: "#D5D9E0",
  fromStation: "A station name",
  name: "A line name",
  stations: [],
  toStation: "Another station",
}));

/** The first page: pick a city, starting on the current one, then a line in it (user, 2026-10-31). */
export function MetroTab({
  deviceLocation,
  onChange,
  onOpenLine,
  onPickCity,
  pickedCityCode,
  selected,
}: {
  deviceLocation: DevicePoint;
  onChange: (codes: string[]) => void;
  onOpenLine: (code: string) => void;
  onPickCity: (code: string) => void;
  pickedCityCode: string | null;
  selected: string[];
}) {
  const { colors, fonts } = useTheme();
  const systemsQuery = useGetMetroSystemsQuery();
  const failure = loadFailure(systemsQuery);
  const systems = systemsQuery.data;
  const city = METRO_CITIES.find((option) => option.code === pickedCityCode) ?? defaultMetroCity(deviceLocation);
  const chips = useMemo(() => tickedStations(systems ?? [], selected), [selected, systems]);

  if (failure) {
    return <LoadFailedCard error={failure.error} onReload={failure.reload} />;
  }

  const picker = (
    <SelectField
      label="City"
      labelOnBorder
      onChange={onPickCity}
      options={METRO_CITIES.map((option) => ({ label: option.name, value: option.code }))}
      placeholder="Select a city"
      value={city?.code ?? null}
    />
  );

  if (!systems) {
    return (
      <View style={{ gap: spacing.md }}>
        {picker}
        <SkeletonBoundary>
          <View style={{ gap: spacing.md }}>
            {SAMPLE_LINES.map((line) => (
              <LineRow key={line.code} line={line} onPress={() => undefined} ticked={0} />
            ))}
          </View>
        </SkeletonBoundary>
      </View>
    );
  }

  const system = city ? systemForCity(systems, city.code) : null;

  return (
    <View style={{ flexGrow: 1, gap: spacing.md }}>
      {picker}

      {chips.length > 0 ? <TickedStations onChange={onChange} selected={selected} stations={chips} /> : null}

      {system ? (
        <>
          {system.lines.map((line) => (
            <LineRow key={line.code} line={line} onPress={() => onOpenLine(line.code)} ticked={ticksOnLine(selected, line)} />
          ))}

          <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16, marginTop: "auto", paddingTop: spacing.lg }}>
            Station locations © OpenStreetMap contributors. Powered by Geoapify.{" "}
            <Text
              accessibilityRole="link"
              onPress={() => void Linking.openURL("https://www.openstreetmap.org/copyright")}
              style={{ color: colors.primary }}
            >
              Licence
            </Text>
            {"  "}
            <Text
              accessibilityRole="link"
              onPress={() => void Linking.openURL("https://www.geoapify.com/")}
              style={{ color: colors.primary }}
            >
              Geoapify
            </Text>
          </Text>
        </>
      ) : (
        <MetroUnderConstruction />
      )}
    </View>
  );
}

/**
 * The ticked stations as removable chips, under a count and Clear all. A long
 * selection stops at four rows with See more under them (user, 2026-11-01), so
 * the lines stay on the screen.
 */
function TickedStations({
  onChange,
  selected,
  stations,
}: {
  onChange: (codes: string[]) => void;
  selected: string[];
  stations: MetroStation[];
}) {
  const { colors, fonts } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [rowHeight, setRowHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const cap = chipRowsHeight(rowHeight, spacing.sm, MAX_CHIP_ROWS);
  const overflows = rowHeight > 0 && fullHeight > cap + 1;

  return (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs }}>
        <View style={{ backgroundColor: colors.neutralSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>{stationCountLabel(stations.length)}</Text>
        </View>
        <AnimatedPressable accessibilityRole="button" hitSlop={8} onPress={() => onChange([])}>
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>Clear all</Text>
        </AnimatedPressable>
      </View>

      <View style={{ maxHeight: overflows && !expanded ? cap : undefined, overflow: "hidden" }}>
        <View
          onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          {stations.map((station, index) => (
            <AnimatedPressable
              accessibilityLabel={`Remove ${station.name}`}
              accessibilityRole="button"
              key={station.code}
              onLayout={index === 0 ? (event) => setRowHeight(event.nativeEvent.layout.height) : undefined}
              onPress={() => onChange(selected.filter((code) => code !== station.code))}
              style={{
                alignItems: "center",
                borderColor: colors.primary,
                borderRadius: 999,
                borderWidth: 1,
                flexDirection: "row",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.sansMedium, fontSize: 13 }}>{station.name}</Text>
              <X color={colors.primary} size={14} strokeWidth={2.5} />
            </AnimatedPressable>
          ))}
        </View>
      </View>

      {overflows ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={8}
          onPress={() => setExpanded((shown) => !shown)}
          style={{ alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 4 }}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>{expanded ? "See less" : "See more"}</Text>
          {expanded ? <ChevronUp color={colors.primary} size={16} /> : <ChevronDown color={colors.primary} size={16} />}
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function LineRow({ line, onPress, ticked }: { line: MetroLine; onPress: () => void; ticked: number }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={`${line.name}, ${line.fromStation} to ${line.toStation}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
        ...softShadow(colors.shadow, 4, 12),
      }}
    >
      <View style={{ backgroundColor: line.colour, borderRadius: 999, height: 40, width: 6 }} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <GhostText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
          {line.name}
        </GhostText>
        <GhostText numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12 }}>
          {`${line.fromStation} to ${line.toStation}`}
        </GhostText>
      </View>
      {ticked > 0 ? (
        <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12 }}>{`${ticked} selected`}</Text>
      ) : null}
      <ChevronRight color={colors.muted} size={20} />
    </AnimatedPressable>
  );
}

/** This city's lines are not in yet, so nothing here can be ticked (user, 2026-10-31). */
function MetroUnderConstruction() {
  const { colors, fonts } = useTheme();
  return (
    // Grows into the page under the dropdown, so it sits in the middle of that space.
    <View style={{ alignItems: "center", flexGrow: 1, gap: spacing.sm, justifyContent: "center", paddingHorizontal: spacing.lg }}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={UNDER_CONSTRUCTION_ARTWORK}
        style={{ height: 144, width: 144 }}
      />
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, textAlign: "center" }}>Work in Progress</Text>
    </View>
  );
}
