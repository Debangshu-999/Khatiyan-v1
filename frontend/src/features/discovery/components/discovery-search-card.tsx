import { useState } from "react";
import { ActivityIndicator, Keyboard, Modal, ScrollView, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { ChevronDown, MapPin, Search, SlidersHorizontal, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import type { LocationArea, LocationCity } from "@/store/services/discovery-api";
import type { GeoSuggestion } from "@/store/services/geo-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { DiscoveryButton } from "./discovery-button";

type DiscoverySearchCardProps = {
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
  const showSuggestions =
    focused && !pickedFromList && searchText.trim().length >= 2 && suggestions.length > 0;
  const selectedCityOption = cityOptions.find((option) => option.city === selectedCity) ?? null;
  const selectedAreaOption = areaOptions.find((option) => option.area === selectedArea) ?? null;

  return (
    <Card>
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

      <DiscoveryButton label="Search" onPress={onSearch} />

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
