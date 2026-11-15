import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ChevronDown } from "lucide-react-native";

import { InPageDropdown, useInPageDropdown } from "@/components/anchored-dropdown";
import { AnimatedPressable } from "@/components/animated-pressable";
import { PILL_CHOICE_MAX_WIDTH, pillChoice } from "@/components/filtered-queue";
import { LoadFailed, loadFailure } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { DAMAGE_LEVEL_OPTIONS, TenantDamageRecords, type DamageLevelFilter } from "@/features/damage/tenant-damage-records";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The damage records naming this tenant (user, 2026-11-10), on the owner's cards.
 * A search by damage code or item name, sticky at the top, with a dropdown for
 * the damage level beside it (user, 2026-11-14).
 */
export default function TenancyDamagesScreen() {
  const { colors, fonts } = useTheme();
  const params = useLocalSearchParams<{ tenancyId?: string }>();
  const activeQuery = useGetMyActiveTenancyQuery();
  const activeId = activeQuery.data?.tenancy.id;
  const failed = params.tenancyId ? null : loadFailure(activeQuery);
  const tenancyId = params.tenancyId ?? activeId ?? null;
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<DamageLevelFilter>("ALL");
  // Drawn in the screen, not a modal window: on a phone the modal's list landed over the pill,
  // and failed to open once scrolled (user, 2026-11-14).
  const dropdown = useInPageDropdown();
  const chosen = DAMAGE_LEVEL_OPTIONS.find((option) => option.value === level) ?? DAMAGE_LEVEL_OPTIONS[0];
  // Where the search row rests, and whether a scroll has pinned it: pinned, the level is a
  // plain pill with nothing to open (user, 2026-11-14).
  const searchRestY = useRef(0);
  const [pinned, setPinned] = useState(false);

  return (
    <View collapsable={false} ref={dropdown.host} style={{ backgroundColor: colors.background, flex: 1 }}>
    <ScreenScrollView
      onScroll={({ nativeEvent }) => {
        const now = searchRestY.current > 0 && nativeEvent.contentOffset.y >= searchRestY.current;
        if (now !== pinned) {
          setPinned(now);
          if (now) dropdown.close();
        }
      }}
      safeAreaEdges={["top", "bottom"]}
      scrollEventThrottle={16}
      stickyHeaderIndices={[1]}
      surface={colors.background}
    >
      <ScreenHeader italicTail="records." subtitle="Damage recorded in your name, your share and its bill." title="Damage" />

      <View
        onLayout={(event) => { searchRestY.current = event.nativeEvent.layout.y; }}
        style={{ backgroundColor: colors.background, marginHorizontal: -spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}
      >
        {/* On a phone a sticky child's style moves to a wrapper: the row needs its own View. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField onChangeText={setSearch} placeholder="Search by damage ID or item" value={search} />
          </View>
          <View collapsable={false} ref={dropdown.ref}>
            <AnimatedPressable
              accessibilityLabel={`Damage level: ${chosen.label}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: Boolean(dropdown.trigger) }}
              disabled={pinned}
              onPress={pinned ? undefined : dropdown.open}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: `${colors.ink}40`,
                borderRadius: 999,
                borderWidth: 1,
                flexDirection: "row",
                gap: 4,
                height: 36,
                paddingLeft: spacing.md,
                paddingRight: spacing.sm,
              }}
            >
              <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 12.5, maxWidth: PILL_CHOICE_MAX_WIDTH }}>
                {pillChoice(chosen.short)}
              </Text>
              {pinned ? null : <ChevronDown color={colors.ink} size={15} strokeWidth={2.4} />}
            </AnimatedPressable>
          </View>
        </View>
      </View>

      {failed ? (
        <LoadFailed error={failed.error} onReload={failed.reload} />
      ) : tenancyId ? (
        <TenantDamageRecords level={level} search={search} tenancyId={tenancyId} />
      ) : null}

    </ScreenScrollView>
      {dropdown.trigger && !pinned ? (
        <InPageDropdown onClose={dropdown.close} trigger={dropdown.trigger} width={180}>
          {DAMAGE_LEVEL_OPTIONS.map((option) => (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === level }}
              key={option.value}
              onPress={() => {
                setLevel(option.value);
                dropdown.close();
              }}
              style={{ backgroundColor: option.value === level ? colors.surfaceSunken : colors.surface, padding: spacing.md }}
            >
              <Text style={{ color: colors.ink, fontFamily: option.value === level ? fonts.sansBold : fonts.sansMedium, fontSize: 14 }}>
                {option.label}
              </Text>
            </AnimatedPressable>
          ))}
        </InPageDropdown>
      ) : null}
    </View>
  );
}
