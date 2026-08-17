import { useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { ChevronDown, MapPinned, Search, SlidersHorizontal, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { SkeletonList } from "@/components/skeleton";
import { useAppSelector } from "@/store/hooks";
import {
  useListLocalPlaceTaxonomyQuery,
  useListMyLocalPlaceTaxonomyQuery,
  useSearchManagedLocalPlacesQuery,
  useSearchMyLocalPlacesQuery,
  type PropertyLocalPlace,
} from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { useDebouncedValue } from "../use-debounced-value";
import { CategoryPickerModal, type CategorySelection } from "./category-picker-modal";
import { DiscoveryEmptyState } from "./discovery-empty-state";
import { NearbyPlaceCard } from "./nearby-place-card";

type NearbyPlacesViewProps = {
  mode: "tenant" | "admin";
  propertyId?: string;
};

// Shared nearby-places browser: a smart search box, an All / Select-a-category
// filter (opening an accordion picker), and Direct / Related result sections.
export function NearbyPlacesView({ mode, propertyId }: NearbyPlacesViewProps) {
  const { colors, fonts, type } = useTheme();
  const isTenant = mode === "tenant";
  const location = useAppSelector((state) => state.location);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategorySelection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);

  const searchArgs = {
    q: debouncedQuery,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
  };
  const tenantSearch = useSearchMyLocalPlacesQuery(searchArgs, { skip: !isTenant });
  const adminSearch = useSearchManagedLocalPlacesQuery(
    { ...searchArgs, propertyId: propertyId ?? "" },
    { skip: isTenant || !propertyId },
  );
  const tenantTaxonomy = useListMyLocalPlaceTaxonomyQuery(undefined, { skip: !isTenant });
  const adminTaxonomy = useListLocalPlaceTaxonomyQuery(propertyId ?? "", { skip: isTenant || !propertyId });

  const search = isTenant ? tenantSearch : adminSearch;
  const taxonomy = (isTenant ? tenantTaxonomy.data : adminTaxonomy.data) ?? [];
  const result = search.data ?? { direct: [], related: [] };
  const hasQuery = debouncedQuery.trim().length > 0;

  const subToCategory = useMemo(() => {
    const map = new Map<string, string>();
    taxonomy.forEach((category) => category.subcategories.forEach((sub) => map.set(sub.id, category.id)));
    return map;
  }, [taxonomy]);

  // Place counts per category / subcategory across the whole (unfiltered) result.
  const { categoryCounts, subcategoryCounts } = useMemo(() => {
    const categories: Record<string, number> = {};
    const subs: Record<string, number> = {};
    [...result.direct, ...result.related].forEach((place) => {
      const seenCats = new Set<string>();
      place.subcategoryIds.forEach((subId) => {
        subs[subId] = (subs[subId] ?? 0) + 1;
        const categoryId = subToCategory.get(subId);
        if (categoryId) {
          seenCats.add(categoryId);
        }
      });
      seenCats.forEach((categoryId) => {
        categories[categoryId] = (categories[categoryId] ?? 0) + 1;
      });
    });
    return { categoryCounts: categories, subcategoryCounts: subs };
  }, [result, subToCategory]);

  const inFilter = (place: PropertyLocalPlace) => {
    if (!filter) {
      return true;
    }
    if (filter.kind === "subcategory") {
      return place.subcategoryIds.includes(filter.id);
    }
    return place.subcategoryIds.some((subId) => subToCategory.get(subId) === filter.id);
  };
  const direct = result.direct.filter(inFilter);
  const related = result.related.filter(inFilter);
  const loading = search.isLoading;

  return (
    <View style={{ gap: spacing.md }}>
      {/* Smart search */}
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 50,
          paddingHorizontal: spacing.md,
        }}
      >
        <Search color={colors.muted} size={18} strokeWidth={2.2} />
        <AppTextInput
          accessibilityLabel="Search nearby places"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search for a pharmacy, hospital, ATM, gym or bus stand nearby"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={{ color: colors.ink, flex: 1, fontFamily: fonts.sans, fontSize: 15, minHeight: 48, paddingVertical: 0 }}
          value={query}
        />
        {query.length > 0 ? (
          <AnimatedPressable accessibilityLabel="Clear search" onPress={() => setQuery("")}>
            <X color={colors.muted} size={18} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
      </View>

      {/* Filter bubbles: All | Select a category */}
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        <FilterBubble active={!filter} label="All" onPress={() => setFilter(null)} />
        <FilterBubble
          active={Boolean(filter)}
          icon={<SlidersHorizontal color={filter ? colors.primary : colors.inkSoft} size={13} strokeWidth={2.3} />}
          label={filter ? filter.label : "Select a category"}
          onPress={() => setPickerOpen(true)}
          trailing={<ChevronDown color={filter ? colors.primary : colors.muted} size={14} strokeWidth={2.4} />}
        />
      </View>

      {loading ? <SkeletonList /> : null}

      {!loading && direct.length === 0 && related.length === 0 ? (
        <DiscoveryEmptyState
          title={hasQuery || filter ? "No matches found" : "No nearby places yet"}
          description={
            hasQuery || filter
              ? "Nothing matched. Try a broader term or a different category."
              : isTenant
                ? "Your property has not added nearby places yet."
                : "Add landmarks, services and conveniences so tenants can find them here."
          }
        />
      ) : null}

      {!loading && (direct.length > 0 || related.length > 0) ? (
        <View style={{ gap: spacing.md }}>
          {hasQuery && direct.length > 0 ? (
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Direct matches ({direct.length})
            </Text>
          ) : null}
          {direct.map((place) => (
            <NearbyPlaceCard key={place.id} place={place} />
          ))}

          {related.length > 0 ? (
            <>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <MapPinned color={colors.muted} size={14} strokeWidth={2.2} />
                <Text style={[type.eyebrow, { color: colors.muted }]}>
                  Related nearby ({related.length})
                </Text>
              </View>
              {related.map((place) => (
                <NearbyPlaceCard key={place.id} place={place} />
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      <CategoryPickerModal
        categories={taxonomy}
        categoryCounts={categoryCounts}
        mode="filter"
        onClose={() => setPickerOpen(false)}
        onSelect={(selection) => setFilter(selection)}
        subcategoryCounts={subcategoryCounts}
        visible={pickerOpen}
      />
    </View>
  );
}

function FilterBubble({
  active,
  icon,
  label,
  onPress,
  trailing,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primarySoft : colors.surface,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
      }}
    >
      {icon}
      <Text style={{ color: active ? colors.primary : colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12, }}>
        {label}
      </Text>
      {trailing}
    </AnimatedPressable>
  );
}
