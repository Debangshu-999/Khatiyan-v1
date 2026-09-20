import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Modal,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import {
  ArrowUpRight,
  ChevronDown,
  LocateFixed,
  MapPin,
  Pencil,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { MarqueeText } from "@/components/marquee-text";
import type { LocationArea, LocationCity } from "@/store/services/discovery-api";
import type { GeoSuggestion } from "@/store/services/geo-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { DiscoveryButton } from "./discovery-button";

/** Matches app.ai.smart-search.max-query-chars on the server. */
const AI_QUERY_MAX_CHARS = 300;

const AI_QUERY_PLACEHOLDER = "Describe what you're looking for";

type DiscoverySearchCardProps = {
  /**
   * Whether this deployment offers smart search at all. False hides the whole
   * block — an absent feature should not read as a broken one.
   */
  aiAvailable: boolean;
  aiOn: boolean;
  onAiOnChange: (on: boolean) => void;
  aiQuery: string;
  onAiQueryChange: (value: string) => void;
  aiBusy: boolean;
  /**
   * Example sentences written from real listings nearby, at most three. Shown
   * under the empty box, and tapping one searches it straight away.
   */
  aiSuggestions: string[];
  onAiSuggestionPress: (suggestion: string) => void;
  /**
   * Phrases the sentence asked for that could not become a filter.
   *
   * Shown rather than dropped. A search that quietly ignores half of what
   * somebody typed reads as a place with no stock.
   */
  aiNotUsed: string[];
  /** Why a sentence could not be run, in plain words. Null when it ran. */
  aiNotice: string | null;
  /**
   * True while the sentence is the input method, which blocks every control
   * below it — the place box included, since a sentence writes its resolved
   * place in there.
   */
  aiLocked: boolean;
  areaOptions: LocationArea[];
  cityOptions: LocationCity[];
  loadingSuggestions: boolean;
  activeFilterCount: number;
  onAreaSelect: (area: LocationArea | null) => void;
  onCitySelect: (city: LocationCity | null) => void;
  onClearSearch: () => void;
  onOpenFilters: () => void;
  onSearch: () => void;
  onSearchTextChange: (value: string) => void;
  onSuggestionSelect: (suggestion: GeoSuggestion) => void;
  searchText: string;
  selectedArea: string;
  selectedCity: string;
  suggestions: GeoSuggestion[];
};

export function DiscoverySearchCard({
  aiAvailable,
  aiOn,
  onAiOnChange,
  aiQuery,
  onAiQueryChange,
  aiBusy,
  aiSuggestions,
  onAiSuggestionPress,
  aiNotUsed,
  aiNotice,
  aiLocked,
  areaOptions,
  cityOptions,
  loadingSuggestions,
  activeFilterCount,
  onAreaSelect,
  onCitySelect,
  onClearSearch,
  onOpenFilters,
  onSearch,
  onSearchTextChange,
  onSuggestionSelect,
  searchText,
  selectedArea,
  selectedCity,
  suggestions,
}: DiscoverySearchCardProps) {
  const { colors, fonts, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  // Picking a suggestion writes its label into the box, and that label is
  // itself a valid query — so the debounced lookup ran again, came back with
  // matches, and the dropdown reopened over the results the person had just
  // asked for. Blurring does not help either: the list sets
  // keyboardShouldPersistTaps="handled" precisely so a tap does NOT blur.
  //
  // So a pick is recorded explicitly and holds until the text is edited again.
  const [pickedFromList, setPickedFromList] = useState(false);
  // Never while AI search owns the input: the place it wrote into the box is
  // itself a valid query, so the dropdown opened by itself over results the
  // reader had just asked for.
  const showSuggestions =
    !aiLocked && focused && !pickedFromList && searchText.trim().length >= 2 && suggestions.length > 0;
  const selectedCityOption = cityOptions.find((option) => option.city === selectedCity) ?? null;
  const selectedAreaOption = areaOptions.find((option) => option.area === selectedArea) ?? null;
  const selectedLocationLabel = selectedArea || selectedCity || searchText.trim();

  return (
    <Card>
      {aiAvailable ? (
        <View
          style={{
            // The one place in the app that carries a pale blue fill, and only
            // while it is switched on. This panel is a different KIND of input
            // from the controls under it — a sentence rather than a set of
            // choices — and the tint is what says so at a glance. Switched off
            // it is an outline like anything else, because then it is just a
            // control somebody has not turned on.
            backgroundColor: aiOn ? colors.primarySoft : "transparent",
            borderColor: aiOn ? colors.primarySoft : colors.border,
            borderCurve: "continuous",
            borderRadius: 14,
            borderWidth: 1,
            gap: spacing.sm,
            padding: spacing.md,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Sparkles color={colors.primary} size={20} strokeWidth={2.2} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                Smart search
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  color: colors.muted,
                  fontFamily: fonts.sansMedium,
                  fontSize: 11,
                  lineHeight: 15,
                }}
              >
                Get smarter, more relevant results.
              </Text>
            </View>
            <Switch
              disabled={aiBusy}
              onValueChange={onAiOnChange}
              thumbColor={colors.surface}
              trackColor={{ false: colors.neutralSoft, true: colors.primary }}
              value={aiOn}
            />
          </View>

          {aiOn ? (
            <View style={{ gap: spacing.sm }}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderCurve: "continuous",
                  borderRadius: 12,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.sm,
                  opacity: aiBusy ? 0.6 : 1,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <Pencil color={colors.kicker} size={18} strokeWidth={2.2} style={{ marginTop: 2 }} />
                <AppTextInput
                  accessibilityLabel="Describe what you are looking for"
                  editable={!aiBusy}
                  // The server refuses anything longer, so the field stops
                  // there rather than letting somebody type a paragraph and
                  // then be told no.
                  maxLength={AI_QUERY_MAX_CHARS}
                  multiline
                  onChangeText={onAiQueryChange}
                  placeholder={AI_QUERY_PLACEHOLDER}
                  placeholderTextColor={colors.kicker}
                  style={{
                    color: colors.ink,
                    flex: 1,
                    fontFamily: fonts.sansMedium,
                    fontSize: 12,
                    lineHeight: 17,
                    minHeight: 46,
                    padding: 0,
                    textAlignVertical: "top",
                  }}
                  value={aiQuery}
                />
              </View>
              {aiNotice ? (
                <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 15 }}>
                  {aiNotice}
                </Text>
              ) : null}

              {aiNotUsed.length > 0 ? (
                <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 15 }}>
                  AI could not use: {aiNotUsed.join(", ")}
                </Text>
              ) : null}

              {/* Only while the box is empty. Once somebody starts writing, the
                  examples have done their job and would only push the button
                  further from the sentence. */}
              {aiSuggestions.length > 0 && aiQuery.trim().length === 0 && !aiBusy ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ color: colors.kicker, fontFamily: fonts.sansBold, fontSize: 11 }}>
                    Suggested searches
                  </Text>
                  {aiSuggestions.map((suggestion) => (
                    <AnimatedPressable
                      accessibilityLabel={`Search for ${suggestion}`}
                      accessibilityRole="button"
                      key={suggestion}
                      onPress={() => onAiSuggestionPress(suggestion)}
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderCurve: "continuous",
                        borderRadius: radii.card,
                        borderWidth: 1,
                        flexDirection: "row",
                        gap: spacing.xs,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 9,
                      }}
                    >
                      <Search color={colors.primary} size={14} strokeWidth={2.4} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <MarqueeText style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 12 }}>
                          {suggestion}
                        </MarqueeText>
                      </View>
                      <ArrowUpRight color={colors.kicker} size={14} strokeWidth={2.2} />
                    </AnimatedPressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {aiLocked ? null : (
      <View
        style={{
          alignItems: "center",
          backgroundColor: focused ? colors.surfaceRaised : colors.neutralSoft,
          borderColor: focused ? colors.primary : colors.border,
          borderRadius: 12,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 50,
          paddingHorizontal: spacing.md,
        }}
      >
        <Search color={focused ? colors.primary : colors.muted} size={18} strokeWidth={2.2} />
        <AppTextInput
          accessibilityLabel="Search by area or city"
          autoCapitalize="words"
          autoCorrect={false}
          onBlur={() => {
            setTimeout(() => setFocused(false), 160);
          }}
          onChangeText={(text) => {
            // Typing means they are searching again, so the list may reopen.
            setPickedFromList(false);
            onSearchTextChange(text);
          }}
          onFocus={() => setFocused(true)}
          onSubmitEditing={onSearch}
          placeholder="Search city, area or pincode"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={{
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.sansMedium,
            fontSize: 15,
            minHeight: 48,
            paddingVertical: 0,
          }}
          value={searchText}
        />
        {loadingSuggestions ? <ActivityIndicator color={colors.primary} size="small" /> : null}
        {searchText.length > 0 && !loadingSuggestions ? (
          <AnimatedPressable
            accessibilityLabel="Clear search"
            onPress={() => {
              setPickedFromList(false);
              onClearSearch();
            }}
          >
            <X color={colors.muted} size={18} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
        <View style={{ backgroundColor: colors.border, height: 24, width: 1 }} />
        <AnimatedPressable
          accessibilityLabel="Open property filters"
          accessibilityRole="button"
          onPress={onOpenFilters}
          style={{
            alignItems: "center",
            height: 36,
            justifyContent: "center",
            position: "relative",
            width: 36,
          }}
        >
          <SlidersHorizontal color={activeFilterCount > 0 ? colors.primary : colors.muted} size={20} strokeWidth={2.3} />
          {activeFilterCount > 0 ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 999,
                height: 16,
                justifyContent: "center",
                position: "absolute",
                right: -2,
                top: 0,
                width: 16,
              }}
            >
              <Text style={{ color: colors.onPrimary, fontSize: 10, fontWeight: "900" }}>
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </AnimatedPressable>
      </View>
      )}

      {showSuggestions ? (
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            maxHeight: 280,
            overflow: "hidden",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator>
            {suggestions.map((suggestion, index) => (
              <AnimatedPressable
                accessibilityLabel={`Search ${suggestion.name ?? suggestion.address ?? "location"}`}
                key={`${suggestion.providerPlaceId ?? suggestion.name ?? "geo"}-${index}`}
                onPress={() => {
                  setPickedFromList(true);
                  // Native only — on web the input keeps focus, which is why
                  // the flag above does the actual closing.
                  Keyboard.dismiss();
                  onSuggestionSelect(suggestion);
                }}
                style={{
                  alignItems: "center",
                  borderBottomColor: colors.border,
                  borderBottomWidth: 1,
                  flexDirection: "row",
                  gap: spacing.sm,
                  minHeight: 56,
                  paddingHorizontal: spacing.md,
                }}
              >
                <MapPin color={colors.primary} size={16} strokeWidth={2.3} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.body, { color: colors.ink, fontWeight: "800" }]}>
                    {suggestion.name ?? suggestion.address ?? "Location"}
                  </Text>
                  {suggestion.address && suggestion.address !== suggestion.name ? (
                    <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
                      {suggestion.address}
                    </Text>
                  ) : null}
                </View>
              </AnimatedPressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {aiLocked ? null : (
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <FilterPickerButton
          label="City"
          value={selectedCity || "Select city"}
          onPress={() => setCityModalOpen(true)}
          style={{ flex: 1 }}
        />
        <FilterPickerButton
          disabled={!selectedCity}
          label="Area"
          value={selectedArea || "Select area"}
          onPress={() => setAreaModalOpen(true)}
          style={{ flex: 1 }}
        />
      </View>
      )}

      <DiscoveryButton
        disabled={aiBusy || (aiOn && aiQuery.trim().length === 0)}
        icon={aiOn ? <AiSearchIcon color={colors.onPrimary} searching={aiBusy} /> : undefined}
        label={aiOn ? "Search with AI" : "Search"}
        onPress={onSearch}
        // Not dimmed while it works. The moving glass is the signal, and a
        // faded button reads as unavailable rather than busy.
        style={aiBusy ? { opacity: 1 } : undefined}
      />

      <View
        style={{
          alignItems: "center",
          alignSelf: "center",
          backgroundColor: aiOn ? colors.primarySoft : colors.neutralSoft,
          borderColor: aiOn ? colors.primarySoft : colors.border,
          borderRadius: 9,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.xs,
          maxWidth: "100%",
          paddingHorizontal: spacing.sm,
          paddingVertical: 7,
        }}
      >
        {aiOn ? (
          <Sparkles color={colors.primary} size={16} strokeWidth={2.2} />
        ) : (
          <LocateFixed color={colors.kicker} size={16} strokeWidth={2.2} />
        )}
        <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flexShrink: 1 }]}>
          {aiOn ? (
            <Text style={{ color: colors.primary, fontFamily: fonts.sansBold }}>AI searching</Text>
          ) : (
            <Text>Searching</Text>
          )}
          {" "}around {selectedLocationLabel || "your selected location"}
        </Text>
      </View>

      <LocationFilterModal
        emptyLabel="No cities found"
        items={cityOptions}
        itemKey={(item) => `${item.city}-${item.state}`}
        itemSubtitle={(item) => item.state}
        itemTitle={(item) => item.city}
        onClear={() => {
          onCitySelect(null);
          setCityModalOpen(false);
          setCitySearch("");
        }}
        onClose={() => setCityModalOpen(false)}
        onSelect={(item) => {
          onCitySelect(item);
          setCityModalOpen(false);
          setCitySearch("");
        }}
        query={citySearch}
        selectedKey={selectedCityOption ? `${selectedCityOption.city}-${selectedCityOption.state}` : ""}
        setQuery={setCitySearch}
        title="Select city"
        visible={cityModalOpen}
      />

      <LocationFilterModal
        emptyLabel="No areas found"
        items={areaOptions}
        itemKey={(item) => `${item.city}-${item.area}`}
        itemSubtitle={(item) => item.city}
        itemTitle={(item) => item.area}
        onClear={() => {
          onAreaSelect(null);
          setAreaModalOpen(false);
          setAreaSearch("");
        }}
        onClose={() => setAreaModalOpen(false)}
        onSelect={(item) => {
          onAreaSelect(item);
          setAreaModalOpen(false);
          setAreaSearch("");
        }}
        query={areaSearch}
        selectedKey={selectedAreaOption ? `${selectedAreaOption.city}-${selectedAreaOption.area}` : ""}
        setQuery={setAreaSearch}
        title="Select area"
        visible={areaModalOpen}
      />
    </Card>
  );
}

/** How far the glass travels from rest, in points, while searching. */
// Kept small and slow on purpose: a hint that it is working, not a spinner.
const ORBIT_RADIUS = 1.2;
const ORBIT_MS = 2000;
const ORBIT_STEPS = 16;

/**
 * A magnifying glass with sparkles, circling while AI search works.
 *
 * <p>Composed from two glyphs because the icon set has no single one for it.
 * The circle is sampled at sixteen points rather than four — interpolating
 * between four gives a diamond, and the eye catches the corners.
 *
 * <p>Still for anyone who has asked their phone to reduce motion; the button
 * is disabled while busy, which says the same thing without movement.
 */
function AiSearchIcon({ color, searching }: { color: string; searching: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!searching || reduceMotion) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, { duration: ORBIT_MS, easing: Easing.linear, toValue: 1, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion, searching]);

  const inputRange = Array.from({ length: ORBIT_STEPS + 1 }, (_, index) => index / ORBIT_STEPS);
  const translateX = progress.interpolate({
    inputRange,
    outputRange: inputRange.map((step) => Math.cos(step * Math.PI * 2) * ORBIT_RADIUS - ORBIT_RADIUS),
  });
  const translateY = progress.interpolate({
    inputRange,
    outputRange: inputRange.map((step) => Math.sin(step * Math.PI * 2) * ORBIT_RADIUS),
  });

  return (
    <Animated.View style={{ height: 20, transform: [{ translateX }, { translateY }], width: 22 }}>
      <Search color={color} size={18} strokeWidth={2.5} style={{ left: 0, position: "absolute", top: 2 }} />
      <Sparkles color={color} size={10} strokeWidth={2.4} style={{ position: "absolute", right: 0, top: 0 }} />
    </Animated.View>
  );
}

function FilterPickerButton({
  disabled = false,
  label,
  onPress,
  style,
  value,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  style?: object;
  value: string;
}) {
  const { colors, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: disabled ? colors.neutralSoft : colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        gap: spacing.xs,
        minHeight: 58,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...style,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {label}
      </Text>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text numberOfLines={1} style={[type.body, { color: colors.ink, flex: 1, fontWeight: "800" }]}>
          {value}
        </Text>
        <ChevronDown color={colors.muted} size={16} strokeWidth={2.4} />
      </View>
    </AnimatedPressable>
  );
}

function LocationFilterModal<T>({
  emptyLabel,
  items,
  itemKey,
  itemSubtitle,
  itemTitle,
  onClear,
  onClose,
  onSelect,
  query,
  selectedKey,
  setQuery,
  title,
  visible,
}: {
  emptyLabel: string;
  items: T[];
  itemKey: (item: T) => string;
  itemSubtitle: (item: T) => string;
  itemTitle: (item: T) => string;
  onClear: () => void;
  onClose: () => void;
  onSelect: (item: T) => void;
  query: string;
  selectedKey: string;
  setQuery: (value: string) => void;
  title: string;
  visible: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? items.filter((item) => {
        const titleText = itemTitle(item).toLowerCase();
        const subtitleText = itemSubtitle(item).toLowerCase();
        return titleText.includes(normalizedQuery) || subtitleText.includes(normalizedQuery);
      })
    : items;

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.35)",
          flex: 1,
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            gap: spacing.md,
            maxHeight: "82%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 20,
              }}
            >
              {title}
            </Text>
            <AnimatedPressable accessibilityLabel="Close" onPress={onClose}>
              <X color={colors.muted} size={22} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.neutralSoft,
              borderColor: colors.border,
              borderRadius: 12,
              borderWidth: 1,
              flexDirection: "row",
              gap: spacing.sm,
              minHeight: 48,
              paddingHorizontal: spacing.md,
            }}
          >
            <Search color={colors.muted} size={17} strokeWidth={2.2} />
            <AppTextInput
              accessibilityLabel={title}
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.muted}
              style={{
                color: colors.ink,
                flex: 1,
                fontFamily: fonts.sansMedium,
                fontSize: 15,
                minHeight: 46,
                paddingVertical: 0,
              }}
              value={query}
            />
            {query ? (
              <AnimatedPressable accessibilityLabel="Clear search" onPress={() => setQuery("")}>
                <X color={colors.muted} size={17} strokeWidth={2.2} />
              </AnimatedPressable>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onClear}
              style={{
                borderBottomColor: colors.border,
                borderBottomWidth: 1,
                minHeight: 48,
                justifyContent: "center",
              }}
            >
              <Text style={[type.body, { color: colors.primary, fontWeight: "900" }]}>
                Clear selection
              </Text>
            </AnimatedPressable>

            {filteredItems.map((item) => {
              const key = itemKey(item);
              const selected = key === selectedKey;

              return (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={key}
                  onPress={() => onSelect(item)}
                  style={{
                    backgroundColor: selected ? colors.primarySoft : colors.background,
                    borderBottomColor: colors.border,
                    borderBottomWidth: 1,
                    gap: 2,
                    minHeight: 58,
                    justifyContent: "center",
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  <Text style={[type.body, { color: colors.ink, fontWeight: selected ? "900" : "700" }]}>
                    {itemTitle(item)}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    {itemSubtitle(item)}
                  </Text>
                </AnimatedPressable>
              );
            })}

            {filteredItems.length === 0 ? (
              <View style={{ alignItems: "center", minHeight: 120, justifyContent: "center" }}>
                <Text style={[type.body, { color: colors.muted, fontWeight: "800" }]}>
                  {emptyLabel}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
