import { useMemo, useState, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { PropertyDiscoveryDetail } from "@/store/services/discovery-api";
import { FacilityOverviewGrid } from "@/features/property/facility-overview-grid";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { NOTICE_PERIOD_LABELS } from "@/store/services/property-api";
import { formatDepositPaise, formatMoneyPaise, humanizeToken } from "../discovery-format";
import { EnquireAction } from "./enquire-action";
import { PropertyMediaCarousel } from "./property-media-carousel";

type PropertyProfileProps = {
  property: PropertyDiscoveryDetail;
  onBack: () => void;
};


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
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: "900", lineHeight: 31 }}>
            {property.name}
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 21 }}>
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
            backgroundColor: colors.primary,
            borderRadius: 16,
            height: 46,
            justifyContent: "center",
            width: 46,
          }}
        >
          <MaterialCommunityIcons color={colors.onPrimary} name="directions" size={25} />
        </Pressable>
      </View>

      {/* Property image slider */}
      <View style={{ borderRadius: 16, overflow: "hidden" }}>
        <PropertyMediaCarousel imageUrls={imageUrls} propertyName={property.name} onBack={onBack} />
      </View>

      {/* Directly under the name and photos, above the detail. The profile is
          long, and the one action it offers should not be at the bottom of it. */}
      <EnquireAction propertyId={property.propertyId} propertyName={property.name} />

      {/* Remaining information */}
      <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            {property.headline || `${humanizeToken(property.type)} property in ${property.city}`}
          </Text>

          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>
            {property.description || "This property profile has not added a detailed description yet."}
          </Text>

          <ProfileSection title="Property details">
            <DetailGrid
              rows={[
                [
                  { label: "Property type", value: humanizeToken(property.type) },
                  { label: "Rent starts from", value: formatMoneyPaise(property.startingRoomRentPaise) },
                ],
                [
                  { label: "Deposit", value: formatDepositPaise(property.standardDepositPaise) },
                  { label: "Stay type", value: property.dailyRentingAvailable ? "Monthly + daily" : "Monthly only" },
                ],
                // How hard a place is to leave is part of choosing it. Buried
                // until after move-in, it cannot inform the one decision it
                // should.
                [
                  { label: "Notice period", value: NOTICE_PERIOD_LABELS[property.noticePeriod] },
                  {
                    label: "Rent grace",
                    value: property.rentGraceDays > 0 ? `${property.rentGraceDays} days` : "None",
                  },
                ],
                ...(property.dailyRentingAvailable
                  ? [
                      [
                        { label: "Daily non AC", value: formatMoneyPaise(property.dailyGuestNonAcRatePaise) },
                        { label: "Daily AC", value: formatMoneyPaise(property.dailyGuestAcRatePaise) },
                      ],
                    ]
                  : []),
              ]}
            />
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
              {property.dailyRentingAvailable
                ? "Daily renting is available for short stays."
                : "Daily renting is not available for this property."}
            </Text>
          </ProfileSection>

          <ProfileSection title="Facilities">
            {facilities.length > 0 ? (
              <FacilityOverviewGrid facilities={facilities} />
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }}>
                Facilities have not been listed yet.
              </Text>
            )}
          </ProfileSection>

          <ProfileSection title="Stay preferences">
            <DetailGrid
              rows={[
                [
                  { label: "PG for", value: humanizeToken(property.pgFor) },
                  { label: "Preferred for", value: humanizeToken(property.preferredFor) },
                ],
                [
                  { label: "Bathroom", value: humanizeToken(property.bathroomType) },
                  { label: "Electricity", value: property.electricityIncluded ? "Included" : "Extra" },
                ],
                [
                  {
                    label: "Food",
                    value: property.foodIncluded
                      ? property.includedMeals.length > 0
                        ? property.includedMeals.map((meal) => humanizeToken(meal)).join(", ")
                        : "Included"
                      : "Not included",
                  },
                ],
                [
                  {
                    label: "Sharing options",
                    value:
                      property.availableSharingTypes.length > 0
                        ? property.availableSharingTypes.map((sharingType) => humanizeToken(sharingType)).join(", ")
                        : "Not listed",
                  },
                ],
              ]}
            />
          </ProfileSection>

          <ProfileSection title="Contacts">
            {property.showOwnerContact && property.ownerPhone ? (
              <ContactCard name={property.ownerName || "Property owner"} phone={property.ownerPhone} />
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }}>
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
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>
          {name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>
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
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

type DetailItem = { label: string; value: string };

function DetailGrid({ rows }: { rows: DetailItem[][] }) {
  const { colors } = useTheme();

  return (
    <View style={{ borderColor: colors.border, borderRadius: 14, borderWidth: 1, overflow: "hidden" }}>
      {rows.map((row, rowIndex) => (
        <View
          key={row.map((item) => item.label).join("-")}
          style={{
            borderBottomColor: colors.border,
            borderBottomWidth: rowIndex === rows.length - 1 ? 0 : 1,
            flexDirection: "row",
          }}
        >
          {row.map((item, columnIndex) => (
            <DetailCell item={item} key={item.label} showDivider={columnIndex === 0 && row.length > 1} />
          ))}
        </View>
      ))}
    </View>
  );
}

function DetailCell({ item, showDivider }: { item: DetailItem; showDivider: boolean }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        borderRightColor: colors.border,
        borderRightWidth: showDivider ? 1 : 0,
        flex: 1,
        gap: 4,
        minWidth: 0,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      <Text
        style={{ color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.9, textTransform: "uppercase" }}
      >
        {item.label}
      </Text>
      <Text
        style={{ color: colors.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "800", lineHeight: 20 }}
      >
        {item.value}
      </Text>
    </View>
  );
}
