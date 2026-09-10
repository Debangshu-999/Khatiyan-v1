import { useState, type ComponentProps, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AirVent } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useToast } from "@/components/toast";
import { openDialer } from "@/lib/dial";
import type { PropertyDiscoveryDetail } from "@/store/services/discovery-api";
import { NOTICE_PERIOD_LABELS } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { formatDepositPaise, formatMoneyPaise, humanizeToken } from "../discovery-format";
import { EnquireAction } from "./enquire-action";
import { PropertyMediaCarousel } from "./property-media-carousel";
import { RoomTypeShowcase } from "./room-type-showcase";

type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function PropertyProfile({ property }: { property: PropertyDiscoveryDetail }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const facilities = [...(property.facilities ?? []), ...(property.customFacilities ?? [])];
  const imageUrls = property.imageUrls?.length
    ? property.imageUrls
    : property.profileImageUrl
      ? [property.profileImageUrl]
      : [];
  const addressLine = [property.address, property.area, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(", ");
  const contacts = property.contacts ?? [];
  const ownerContact = contacts.find((contact) => contact.owner) ?? null;
  const managerContacts = contacts.filter((contact) => !contact.owner);
  const description =
    property.description ||
    property.headline ||
    `Comfortable ${humanizeToken(property.type)} stay in ${property.area || property.city} with essential amenities and easy city access.`;

  const propertyKind = humanizeToken(property.type);
  const pgForHighlight =
    property.pgFor === "MALE"
      ? { icon: "human-male-boy" as MaterialIconName, label: `${propertyKind} for Boys` }
      : property.pgFor === "FEMALE"
        ? { icon: "human-female-girl" as MaterialIconName, label: `${propertyKind} for Girls` }
        : { icon: "account-group-outline" as MaterialIconName, label: "Everyone Welcome" };

  function openDirections() {
    if (property.directionsUrl) {
      void Linking.openURL(property.directionsUrl);
      return;
    }
    const destination = encodeURIComponent(addressLine);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  }

  function showDummyAction(label: string) {
    toast.warning(`${label} is not available yet.`);
  }

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 21,
            borderWidth: 1,
            height: 42,
            justifyContent: "center",
            paddingHorizontal: spacing.md,
            shadowColor: colors.shadow,
            shadowOffset: { height: 2, width: 0 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
          }}
        >
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12 }}>
            {humanizeToken(property.type)}
          </Text>
        </View>
        <RoundIconButton
          icon="bookmark-outline"
          label="Save property"
          onPress={() => showDummyAction("Save")}
        />
        <RoundIconButton
          icon="share-variant-outline"
          label="Share property"
          onPress={() => showDummyAction("Share")}
        />
      </View>

      <PropertyMediaCarousel
        captions={(property.images ?? []).map((image) => image.caption)}
        imageUrls={imageUrls}
        propertyName={property.name}
      />

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 29, letterSpacing: -0.7, lineHeight: 35 }}>
          {property.name}
        </Text>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
          <MaterialCommunityIcons color={colors.inkSoft} name="map-marker-outline" size={21} />
          <Text style={[type.body, { color: colors.muted, flex: 1, lineHeight: 21 }]}>
            {addressLine}
          </Text>
        </View>
        <Text
          style={{
            color: colors.muted,
            fontFamily: fonts.sans,
            fontSize: 13,
            lineHeight: 19,
            marginTop: spacing.xxs,
          }}
        >
          {description}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <QuickHighlight icon={pgForHighlight.icon} label={pgForHighlight.label} />
        <QuickHighlight
          crossed={!property.foodIncluded}
          icon="silverware-fork-knife"
          label={property.foodIncluded ? "Food Included" : "Food Not Included"}
        />
        <QuickHighlight
          crossed={!property.electricityIncluded}
          icon="lightning-bolt-outline"
          label={property.electricityIncluded ? "Electricity Included" : "Electricity Not Included"}
        />
        <QuickHighlight
          icon={property.dailyRentingAvailable ? "calendar-check-outline" : "calendar-month-outline"}
          label={property.dailyRentingAvailable ? "Daily Stay Available" : "Monthly Stay Only"}
        />
      </View>

      <EnquireAction profileCard propertyId={property.propertyId} propertyName={property.name} />

      <ProfileSection
        title="Property details"
        trailing={
          <AnimatedPressable
            accessibilityLabel="View property on map"
            accessibilityRole="button"
            onPress={openDirections}
            style={{
              alignItems: "center",
              borderColor: colors.primary,
              borderCurve: "continuous",
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 6,
              minHeight: 40,
              paddingHorizontal: spacing.sm + 2,
            }}
          >
            <MaterialCommunityIcons color={colors.primary} name="map-marker" size={17} />
            <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12 }}>
              View on map
            </Text>
          </AnimatedPressable>
        }
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            padding: spacing.sm,
          }}
        >
          <DetailCard icon="home-outline" label="Property type" value={humanizeToken(property.type)} />
          <DetailCard icon="currency-inr" label="Rent starts from" value={formatMoneyPaise(property.startingRoomRentPaise)} />
          <DetailCard icon="database-outline" label="Deposit" value={formatDepositPaise(property.standardDepositPaise)} />
          <DetailCard
            icon="calendar-month-outline"
            label="Stay type"
            value={property.dailyRentingAvailable ? "Monthly + Daily" : "Monthly only"}
          />
          <DetailCard icon="clock-outline" label="Notice period" value={NOTICE_PERIOD_LABELS[property.noticePeriod]} />
          <DetailCard
            icon="file-document-outline"
            label="Rent grace"
            value={property.rentGraceDays > 0 ? `${property.rentGraceDays} days` : "None"}
          />
          <DetailCard
            icon="fan"
            label="Daily Non-AC"
            value={property.dailyRentingAvailable ? formatMoneyPaise(property.dailyGuestNonAcRatePaise) : "Not available"}
          />
          <DetailCard
            icon="air-conditioner"
            label="Daily AC"
            value={property.dailyRentingAvailable ? formatMoneyPaise(property.dailyGuestAcRatePaise) : "Not available"}
          />
        </View>
      </ProfileSection>

      <ProfileSection title="Facilities">
        <FacilitiesGrid facilities={facilities} />
      </ProfileSection>

      <ProfileSection title="Stay preferences">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <PreferenceCard icon="account-group-outline" label="PG for" value={humanizeToken(property.pgFor)} />
          <PreferenceCard
            icon="account-outline"
            label="Preferred for"
            value={property.preferredFor === "PROFESSIONAL" ? "Working" : humanizeToken(property.preferredFor)}
          />
          <PreferenceCard icon="shower-head" label="Bathroom" value={humanizeToken(property.bathroomType)} />
          <PreferenceCard
            icon="lightning-bolt-outline"
            label="Electricity"
            value={property.electricityIncluded ? "Included" : "Not included"}
          />
          <PreferenceCard icon="silverware-fork-knife" label="Food" value={foodPreference(property)} />
          <PreferenceCard icon="account-question-outline" label="Visitors" value="Not specified" />
        </View>
      </ProfileSection>

      <ProfileSection title="Room types">
        <RoomTypeShowcase roomTypes={property.roomTypes ?? []} />
      </ProfileSection>

      <ProfileSection title="Contacts">
        <View style={{ gap: spacing.sm }}>
          {ownerContact?.phone ? (
            <ContactCard
              email={ownerContact.email}
              name={ownerContact.name || "Property owner"}
              phone={ownerContact.phone}
              role="Owner"
            />
          ) : (
            <UnavailableContact message="Owner contact is not publicly visible for this listing." />
          )}
          {managerContacts.map((contact) => (
            <ContactCard
              email={contact.email}
              key={contact.userId}
              name={contact.name || "Property manager"}
              phone={contact.phone ?? ""}
              role="Manager"
            />
          ))}
        </View>

      </ProfileSection>
    </View>
  );
}

function ProfileSection({ children, title, trailing }: { children: ReactNode; title: string; trailing?: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <Text style={{ color: colors.text, flexShrink: 1, fontFamily: fonts.display, fontSize: 23, letterSpacing: -0.45 }}>
          {title}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function RoundIconButton({ icon, label, onPress }: { icon: MaterialIconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 21,
        borderWidth: 1,
        height: 42,
        justifyContent: "center",
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        width: 42,
      }}
    >
      <MaterialCommunityIcons color={colors.inkSoft} name={icon} size={21} />
    </AnimatedPressable>
  );
}

function QuickHighlight({ crossed, icon, label }: { crossed?: boolean; icon: MaterialIconName; label: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 78,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        width: "48%",
      }}
    >
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons color={colors.inkSoft} name={icon} size={27} />
        {crossed ? (
          <View
            style={{
              backgroundColor: colors.inkSoft,
              height: 2,
              position: "absolute",
              transform: [{ rotate: "-45deg" }],
              width: 31,
            }}
          />
        ) : null}
      </View>
      <Text style={{ color: colors.text, flex: 1, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 }}>
        {label}
      </Text>
    </View>
  );
}

function DetailCard({ icon, label, value }: { icon: MaterialIconName; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 92,
        padding: spacing.sm,
        width: "48%",
      }}
    >
      <PropertyDetailIcon color={colors.inkSoft} icon={icon} size={25} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 20 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function PropertyDetailIcon({ color, icon, size }: { color: string; icon: MaterialIconName; size: number }) {
  if (icon === "air-conditioner") {
    return <AirVent color={color} size={size} strokeWidth={1.9} />;
  }

  return <MaterialCommunityIcons color={color} name={icon} size={size} />;
}

function FacilitiesGrid({ facilities }: { facilities: string[] }) {
  const { colors, fonts, type } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const canExpand = facilities.length > 6;
  const visible = expanded ? facilities : facilities.slice(0, 6);

  if (facilities.length === 0) {
    return <UnavailableContact message="Facilities have not been listed yet." />;
  }

  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {visible.map((facility, index) => (
          <View
            key={`${facility}-${index}`}
            style={{
              alignItems: "center",
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              gap: spacing.xs,
              justifyContent: "center",
              minHeight: 112,
              paddingHorizontal: spacing.xs,
              paddingVertical: spacing.sm,
              width: "31%",
            }}
          >
            <PropertyDetailIcon color={colors.inkSoft} icon={iconForFacility(facility)} size={28} />
            <Text
              numberOfLines={2}
              style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 16, textAlign: "center" }}
            >
              {humanizeToken(facility)}
            </Text>
            <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>Available</Text>
          </View>
        ))}
      </View>
      {canExpand ? (
        <AnimatedPressable
          accessibilityLabel={expanded ? "Show fewer facilities" : `See all ${facilities.length} facilities`}
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            flexDirection: "row",
            justifyContent: "space-between",
            minHeight: 50,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 14 }}>
            {expanded ? "See less" : `See all ${facilities.length} facilities`}
          </Text>
          <MaterialCommunityIcons color={colors.muted} name={expanded ? "chevron-up" : "chevron-right"} size={22} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function PreferenceCard({ icon, label, value }: { icon: MaterialIconName; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        minHeight: 136,
        padding: spacing.sm,
        width: "31%",
      }}
    >
      <MaterialCommunityIcons color={colors.inkSoft} name={icon} size={27} />
      <View style={{ gap: 4 }}>
        <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 13.5, lineHeight: 18 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ContactCard({
  email,
  name,
  phone,
  role,
}: {
  email: string | null;
  name: string;
  phone: string;
  role: "Owner" | "Manager";
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();

  function emailContact() {
    if (!email) {
      toast.warning(`${name} has no verified email.`);
      return;
    }
    void Linking.openURL(`mailto:${email}`);
  }

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        minHeight: 112,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      }}
    >
      <MaterialCommunityIcons color={colors.kicker} name="account-circle-outline" size={48} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={[type.caption, { color: colors.muted }]}>{role}</Text>
        <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 17 }}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.muted }]}>
          {phone}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        <ContactAction icon="phone-outline" label={`Call ${name}`} onPress={() => openDialer(phone)} />
        <ContactAction
          disabled={!email}
          icon="email-outline"
          label={email ? `Email ${name}` : `${name} has no verified email`}
          onPress={emailContact}
        />
      </View>
    </View>
  );
}

function ContactAction({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: MaterialIconName;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 22,
        borderWidth: 1,
        height: 44,
        justifyContent: "center",
        opacity: disabled ? 0.55 : 1,
        width: 44,
      }}
    >
      <MaterialCommunityIcons color={disabled ? colors.kicker : colors.inkSoft} name={icon} size={21} />
    </AnimatedPressable>
  );
}

function UnavailableContact({ message }: { message: string }) {
  const { colors, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        padding: spacing.md,
      }}
    >
      <Text style={[type.bodyStrong, { color: colors.muted }]}>{message}</Text>
    </View>
  );
}

function foodPreference(property: PropertyDiscoveryDetail) {
  if (!property.foodIncluded) {
    return "Not included";
  }
  if (property.includedMeals.length === 0) {
    return "Included";
  }
  const includedMeals = new Set(property.includedMeals);
  if (
    includedMeals.has("BREAKFAST") &&
    includedMeals.has("LUNCH") &&
    includedMeals.has("DINNER")
  ) {
    return "All meals";
  }
  return property.includedMeals.map((meal) => humanizeToken(meal)).join(", ");
}

function iconForFacility(facility: string): MaterialIconName {
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
