import { useMemo, useState, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Send } from "lucide-react-native";

import type { PropertyDiscoveryDetail } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { formatMoneyPaise, humanizeToken } from "../discovery-format";
import { PropertyMediaCarousel } from "./property-media-carousel";

type PropertyProfileProps = {
  property: PropertyDiscoveryDetail;
  onBack: () => void;
};

const COLLAPSED_FACILITY_ROWS = 3;
const FACILITIES_PER_ROW = 2;

export function PropertyProfile({ property, onBack }: PropertyProfileProps) {
  const { colors } = useTheme();
  const facilities = [...(property.facilities ?? []), ...(property.customFacilities ?? [])];

  function openDirections() {
    if (property.directionsUrl) {
      void Linking.openURL(property.directionsUrl);
      return;
    }

    const query = encodeURIComponent(
      [property.name, property.address, property.area, property.city, property.state, property.pincode].filter(Boolean).join(", "),
    );
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  const imageUrls = property.imageUrls?.length ? property.imageUrls : property.profileImageUrl ? [property.profileImageUrl] : [];

  const addressLine = [property.address, property.area, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={{ gap: spacing.md }}>
      {/* Header: name + address + open-in-map */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: "900", lineHeight: 31 }} selectable>
            {property.name}
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
            {addressLine}
            {property.pincode ? ` - ${property.pincode}` : ""}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Open directions"
          accessibilityRole="button"
          onPress={openDirections}
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 16,
            borderWidth: 1,
            height: 46,
            justifyContent: "center",
            width: 46,
          }}
        >
          <Send color={colors.primary} size={20} strokeWidth={2.3} />
        </Pressable>
      </View>

      {/* Property image slider */}
      <View style={{ borderRadius: 16, overflow: "hidden" }}>
        <PropertyMediaCarousel imageUrls={imageUrls} propertyName={property.name} onBack={onBack} />
      </View>

      {/* Remaining information */}
      <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.muted, lineHeight: 22 }} selectable>
            {property.headline || `${humanizeToken(property.type)} property in ${property.city}`}
          </Text>

          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }} selectable>
            {property.description || "This property profile has not added a detailed description yet."}
          </Text>

          <View
            style={{
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              gap: spacing.sm,
              padding: spacing.md,
            }}
          >
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <InfoBlock label="Property type" value={humanizeToken(property.type)} />
              <InfoBlock label="Rent starts from" value={formatMoneyPaise(property.startingRoomRentPaise)} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <InfoBlock label="Deposit" value={formatMoneyPaise(property.standardDepositPaise)} />
              <InfoBlock
                label="Stay type"
                value={property.dailyRentingAvailable ? "Monthly + daily" : "Monthly only"}
              />
            </View>
            <Text style={{ color: colors.muted, lineHeight: 20 }} selectable>
              {property.dailyRentingAvailable
                ? "Daily renting is available for short stays."
                : "Daily renting is not available for this property."}
            </Text>
            {property.dailyRentingAvailable ? (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <InfoBlock label="Daily non AC" value={formatMoneyPaise(property.dailyGuestNonAcRatePaise)} />
                <InfoBlock label="Daily AC" value={formatMoneyPaise(property.dailyGuestAcRatePaise)} />
              </View>
            ) : null}
          </View>

          <ProfileSection title="Facilities">
            {facilities.length > 0 ? (
              <FacilityOverviewGrid facilities={facilities} />
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
                Facilities have not been listed yet.
              </Text>
            )}
          </ProfileSection>

          <ProfileSection title="Stay preferences">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <InfoBlock label="PG for" value={humanizeToken(property.pgFor)} />
                <InfoBlock label="Preferred for" value={humanizeToken(property.preferredFor)} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <InfoBlock label="Bathroom" value={humanizeToken(property.bathroomType)} />
                <InfoBlock label="Electricity" value={property.electricityIncluded ? "Included" : "Extra"} />
              </View>
              <InfoBlock
                label="Food"
                value={
                  property.foodIncluded
                    ? property.includedMeals.length > 0
                      ? property.includedMeals.map((meal) => humanizeToken(meal)).join(", ")
                      : "Included"
                    : "Not included"
                }
              />
              <InfoBlock
                label="Sharing options"
                value={
                  property.availableSharingTypes.length > 0
                    ? property.availableSharingTypes.map((sharingType) => humanizeToken(sharingType)).join(", ")
                    : "Not listed"
                }
              />
            </View>
          </ProfileSection>

          <ProfileSection title="Contacts">
            {property.showOwnerContact && property.ownerPhone ? (
              <ContactCard name={property.ownerName || "Property owner"} phone={property.ownerPhone} />
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
                Owner contact is not publicly visible for this listing.
              </Text>
            )}
          </ProfileSection>
        </View>
    </View>
  );
}

function ContactCard({ name, phone }: { name: string; phone: string }) {
  const { colors } = useTheme();

  function openDialer() {
    const normalizedPhone = phone.replace(/[^\d+]/g, "");
    void Linking.openURL(`tel:${normalizedPhone}`);
  }

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 15,
          borderWidth: 1,
          height: 48,
          justifyContent: "center",
          width: 48,
        }}
      >
        <MaterialCommunityIcons color={colors.primary} name="account-tie-outline" size={24} />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "900" }} selectable>
          {name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }} selectable>
          {phone}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`Call ${name}`}
        accessibilityRole="button"
        onPress={openDialer}
        style={{
          alignItems: "center",
          backgroundColor: colors.primary,
          borderRadius: 16,
          height: 46,
          justifyContent: "center",
          width: 46,
        }}
      >
        <MaterialCommunityIcons color={colors.onPrimary} name="phone-outline" size={21} />
      </Pressable>
    </View>
  );
}

function FacilityOverviewGrid({ facilities }: { facilities: string[] }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const collapsedLimit = COLLAPSED_FACILITY_ROWS * FACILITIES_PER_ROW;
  const canCollapse = facilities.length > collapsedLimit;
  const visibleFacilities = expanded || !canCollapse ? facilities : facilities.slice(0, collapsedLimit);
  const rows = useMemo(() => chunkPairs(visibleFacilities), [visibleFacilities]);

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {rows.map((row, rowIndex) => (
          <View
            key={row.map((item) => item).join("-")}
            style={{
              borderBottomColor: colors.border,
              borderBottomWidth: rowIndex === rows.length - 1 ? 0 : 1,
              flexDirection: "row",
              minHeight: 86,
            }}
          >
            {row.map((facility, columnIndex) => (
              <FacilityOverviewCell
                facility={facility}
                key={facility}
                showDivider={columnIndex === 0 && row.length > 1}
              />
            ))}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}

        {canCollapse && !expanded ? (
          <Pressable
            accessibilityLabel="Expand facilities"
            accessibilityRole="button"
            onPress={() => setExpanded(true)}
            style={{
              bottom: 0,
              left: 0,
              position: "absolute",
              right: 0,
            }}
          >
            <BlurView
              intensity={70}
              tint="default"
              style={{
                alignItems: "center",
                borderTopColor: colors.border,
                borderTopWidth: 1,
                justifyContent: "center",
                minHeight: 58,
                overflow: "hidden",
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  backgroundColor: colors.surface,
                  bottom: 0,
                  left: 0,
                  opacity: 0.9,
                  position: "absolute",
                  right: 0,
                  top: 0,
                }}
              />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>
                {facilities.length - visibleFacilities.length} more facilities. Tap to expand
              </Text>
            </BlurView>
          </Pressable>
        ) : null}
      </View>

      {canCollapse && expanded ? (
        <Pressable accessibilityLabel="Collapse facilities" accessibilityRole="button" onPress={() => setExpanded(false)}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900", textAlign: "center" }} selectable>
            Show fewer facilities
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FacilityOverviewCell({ facility, showDivider }: { facility: string; showDivider: boolean }) {
  const { colors } = useTheme();
  const iconName = iconForFacility(facility);

  return (
    <View
      style={{
        alignItems: "center",
        borderRightColor: colors.border,
        borderRightWidth: showDivider ? 1 : 0,
        flex: 1,
        flexDirection: "row",
        gap: spacing.sm,
        minWidth: 0,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <MaterialCommunityIcons color={colors.muted} name={iconName} size={25} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{ color: colors.text, fontSize: 15, fontWeight: "800", lineHeight: 19 }}
          selectable
        >
          {humanizeToken(facility)}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 }} selectable>
          Available
        </Text>
      </View>
    </View>
  );
}

function chunkPairs(items: string[]) {
  const rows: string[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

function iconForFacility(facility: string): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (facility) {
    case "WIFI":
      return "wifi";
    case "MESS":
    case "COMMON_KITCHEN":
      return "silverware-fork-knife";
    case "PARKING":
      return "parking";
    case "GYM":
      return "dumbbell";
    case "CCTV":
      return "cctv";
    case "SECURITY":
      return "shield-check-outline";
    case "DRINKING_WATER":
      return "cup-water";
    case "HOT_WATER":
      return "shower-head";
    case "REFRIGERATOR":
      return "fridge-outline";
    case "WASHING_MACHINE":
    case "LAUNDRY_SERVICE":
      return "washing-machine";
    case "HOUSEKEEPING":
    case "ROOM_CLEANING":
      return "broom";
    case "POWER_BACKUP":
      return "power-plug-battery-outline";
    case "LIFT":
      return "elevator";
    case "AIR_CONDITIONING":
      return "air-conditioner";
    case "STUDY_AREA":
      return "book-open-page-variant-outline";
    default:
      return "check-circle-outline";
  }
}

function ProfileSection({ children, title }: { children: ReactNode; title: string }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }} selectable>
        {title}
      </Text>
      {children}
    </View>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        gap: spacing.xs,
        minWidth: 0,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }} selectable>
        {label}
      </Text>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }} selectable>
        {value}
      </Text>
    </View>
  );
}
