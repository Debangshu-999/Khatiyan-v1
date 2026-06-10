import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { Send } from "lucide-react-native";

import { IconButton } from "@/components/icon-button";
import type { PropertyDiscoveryDetail } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { formatDistance, formatMoneyPaise, humanizeToken } from "../discovery-format";
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

    const query = encodeURIComponent(`${property.name}, ${property.address}, ${property.city}, ${property.pincode}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  const imageUrls = property.imageUrls?.length ? property.imageUrls : property.profileImageUrl ? [property.profileImageUrl] : [];

  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 18,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        <PropertyMediaCarousel imageUrls={imageUrls} propertyName={property.name} onBack={onBack} />

        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: "900" }} selectable>
              {property.name}
            </Text>
            <Text style={{ color: colors.primary, fontWeight: "900" }} selectable>
              {formatDistance(property.distanceKm)}
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 22 }} selectable>
              {property.headline || `${humanizeToken(property.type)} property in ${property.city}`}
            </Text>
          </View>

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

          <ProfileSection title="Address">
            <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
              {property.address}, {property.city} - {property.pincode}
            </Text>
          </ProfileSection>

          <ProfileSection title="Facilities">
            {facilities.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                {facilities.map((facility) => (
                  <FeatureTag key={facility} label={humanizeToken(facility)} />
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
                Facilities have not been listed yet.
              </Text>
            )}
          </ProfileSection>

          <ProfileSection title="Contacts">
            {property.showOwnerContact && property.ownerPhone ? (
              <>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }} selectable>
                  {property.ownerName || "Property owner"}
                </Text>
                <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
                  {property.ownerPhone}
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }} selectable>
                Owner contact is not publicly visible for this listing.
              </Text>
            )}
          </ProfileSection>

          <IconButton icon={Send} label="Get directions" onPress={openDirections} />
        </View>
      </View>
    </View>
  );
}

function FeatureTag({ label }: { label: string }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: colors.inkSoft, fontSize: 13, fontWeight: "800" }} selectable>
        {label}
      </Text>
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
