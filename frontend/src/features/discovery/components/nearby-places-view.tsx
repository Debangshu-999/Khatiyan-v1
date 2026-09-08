import { useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import { MapPinned, Search, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { CountTabPills } from "@/components/filter-bubbles";
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
import { NearbyPlaceCard } from "./nearby-place-card";

const NO_LOCATION_ILLUSTRATION = require("../../../../assets/workspace/No-Location_512x512.png");

type NearbyPlacesViewProps = {
  mode: "tenant" | "admin";
  propertyId?: string;
};

/** Which pill is lit. Category carries whatever the picker last returned. */
type PlacesTab = "all" | "recommended" | "category";

// Shared nearby-places browser: a smart search box, an All / Recommended /
// Category filter strip (the last opening an accordion picker), and Direct /
// Related result sections.
export function NearbyPlacesView({ mode, propertyId }: NearbyPlacesViewProps) {
  const { colors, fonts, type } = useTheme();
  const isTenant = mode === "tenant";
  const location = useAppSelector((state) => state.location);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategorySelection | null>(null);
  // Its own flag rather than a third `CategorySelection` kind: recommended is
  // the owner's opinion of a place, not a branch of the taxonomy, and folding
  // it in would put it inside the category picker where nobody would find it.
  const [recommendedOnly, setRecommendedOnly] = useState(false);
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
    if (recommendedOnly) {
      return place.ownerRecommended;
    }
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

  // Counts come off the WHOLE result, not the filtered one — a tab has to say
  // what tapping it would find, and a count that only ever describes the
  // selected tab tells the reader what they are already looking at.
  const everything = [...result.direct, ...result.related];
  const recommendedCount = everything.filter((place) => place.ownerRecommended).length;
  const activeTab: PlacesTab = filter ? "category" : recommendedOnly ? "recommended" : "all";
  // Anything narrowing the list. Drives the empty-state copy and whether there
  // is a reset worth offering.
  const narrowed = Boolean(filter) || recommendedOnly;

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

      {/* The app's shared count-tab strip, as on the notice board and the
          request queues. Category is a tab that opens the picker instead of
          selecting a value — tapping it always reopens, so a chosen category
          can be swapped without going back through All first. */}
      <CountTabPills<PlacesTab>
        onChange={(next) => {
          if (next === "category") {
            setPickerOpen(true);
            return;
          }
          setFilter(null);
          setRecommendedOnly(next === "recommended");
        }}
        options={[
          { count: everything.length, label: "All", value: "all" },
          { count: recommendedCount, label: "Recommended", value: "recommended" },
          // Once chosen the tab wears the category's own name, so the strip
          // says what the list is showing without a second line under it.
          { chevron: true, count: filter ? direct.length + related.length : undefined, label: filter ? filter.label : "Category", value: "category" },
        ]}
        value={activeTab}
      />

      {loading ? <SkeletonList /> : null}

      {/* The property search's own empty layout, not the sunken Discovery card:
          a centred illustration, a centred heading, and a way out. The two
          searches sit one tab apart and coming up empty is the same moment in
          both, so it should look the same in both. */}
      {!loading && direct.length === 0 && related.length === 0 ? (
        <View
          style={{
            alignItems: "center",
            gap: spacing.sm,
            paddingBottom: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
          }}
        >
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={NO_LOCATION_ILLUSTRATION}
            style={{ height: 144, width: 144 }}
          />
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 21,
              letterSpacing: -0.25,
              textAlign: "center",
            }}
          >
            {hasQuery || narrowed ? "No matches found" : "No nearby places yet"}
          </Text>
          <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }]}>
            {hasQuery || narrowed
              ? "Nothing matched. Try a broader term or a different category."
              : isTenant
                ? "Your property has not added nearby places yet."
                : "Add landmarks, services and conveniences so tenants can find them here."}
          </Text>

          {/* Only when something is actually narrowing the list. With no search
              and no category there is nothing to undo, and a button that clears
              an empty search is a dead control. */}
          {hasQuery || narrowed ? (
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => {
                setQuery("");
                setFilter(null);
                setRecommendedOnly(false);
              }}
              style={{
                alignItems: "center",
                borderColor: colors.primary,
                borderRadius: 12,
                borderWidth: 1.5,
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "center",
                marginTop: spacing.sm,
                minHeight: 48,
                paddingHorizontal: spacing.lg,
              }}
            >
              <MapPinned color={colors.primary} size={19} strokeWidth={2.3} />
              <Text style={{ color: colors.primary, fontFamily: fonts.displaySoft, fontSize: 15 }}>
                Show all places
              </Text>
            </AnimatedPressable>
          ) : null}
        </View>
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
        onSelect={(selection) => {
          // The two are mutually exclusive: the strip lights one pill, so a
          // category left on top of Recommended would show a list neither tab
          // describes.
          setRecommendedOnly(false);
          setFilter(selection);
        }}
        subcategoryCounts={subcategoryCounts}
        visible={pickerOpen}
      />
    </View>
  );
}
