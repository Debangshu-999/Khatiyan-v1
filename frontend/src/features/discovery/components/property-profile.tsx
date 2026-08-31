import { useMemo, useState, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { PropertyDiscoveryDetail } from "@/store/services/discovery-api";
import { Section } from "@/components/section";
import { openDialer } from "@/lib/dial";
import { useToast } from "@/components/toast";
import { BackButton } from "@/features/owner/owner-ui";
import { FacilityOverviewGrid } from "@/features/property/facility-overview-grid";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { NOTICE_PERIOD_LABELS } from "@/store/services/property-api";
import { formatDepositPaise, formatMoneyPaise, humanizeToken } from "../discovery-format";
import { EnquireAction } from "./enquire-action";
import { PropertyMediaCarousel } from "./property-media-carousel";
import { RoomTypeShowcase } from "./room-type-showcase";

type PropertyProfileProps = {
  property: PropertyDiscoveryDetail;
  onBack: () => void;
};


export function PropertyProfile({ property, onBack }: PropertyProfileProps) {
  const { colors, fonts, type } = useTheme();
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

  // No manager contacts on the wire yet — the listing has nowhere to add them.
  // Declared here so the section below is written once and lights up the moment
  // the API carries them, rather than being retrofitted around a heading.
  // The listing decides who is reachable: the owner comes through only when the
  // listing shows them, and a manager comes through because somebody chose to
  // list them on the Property contacts card.
  const contacts = property.contacts ?? [];
  const ownerContact = contacts.find((contact) => contact.owner) ?? null;
  const managerContacts = contacts.filter((contact) => !contact.owner);

  return (
    <View style={{ gap: spacing.md }}>
      {/* Above the name, not floating over the photo. A control sitting on an
          unknown image is only as legible as that image allows, and it was the
          one way out of the screen. */}
      <BackButton onPress={onBack} />

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
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <MaterialCommunityIcons color={colors.primary} name="directions" size={24} />
        </Pressable>
      </View>

      {/* Property image slider */}
      {/* Inside the screen's gutter, not bleeding past it. Edge to edge the
          photo ran into the two cards above and below it, which both stop at
          the gutter — the picture read as a band across the page rather than
          as the property's own image. */}
      <View style={{ borderCurve: "continuous", borderRadius: 16, overflow: "hidden" }}>
        <PropertyMediaCarousel
          captions={(property.images ?? []).map((image) => image.caption)}
          imageUrls={imageUrls}
          propertyName={property.name}
        />
      </View>

      {/* Directly under the name and photos, above the detail. The profile is
          long, and the one action it offers should not be at the bottom of it. */}
      <EnquireAction propertyId={property.propertyId} propertyName={property.name} />

      {/* Remaining information */}
      <View style={{ gap: spacing.md }}>
          {/* The headline is the listing's own claim about itself and was set
              smaller and greyer than the description under it, so the paragraph
              read as the headline and the headline as a caption. */}
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.2, lineHeight: 25 }}>
            {property.headline || `${humanizeToken(property.type)} property in ${property.city}`}
          </Text>

          {/* The serif the app uses for words somebody wrote — the same one a
              nudge and an enquiry message are set in. This is prose, not data. */}
          <Text style={[type.quote, { color: colors.inkSoft }]}>
            {property.description || "This property profile has not added a detailed description yet."}
          </Text>

          <Section title="Property details">
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
          </Section>

          <Section title="Facilities">
            {facilities.length > 0 ? (
              <FacilityOverviewGrid facilities={facilities} />
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }}>
                Facilities have not been listed yet.
              </Text>
            )}
          </Section>

          <Section title="Stay preferences">
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
              ]}
              // A list, not a comma-joined sentence in a cell: six sharing types
              // wrap to two lines there and read as one long word. It sits in the
              // grid's own footer so it stays inside the table's boundary with
              // the rest of stay preferences.
              // No sharing-options footer. It listed the shapes on offer as
              // words; the Room types section above says the same thing with a
              // price, a bed count and a photograph attached to each.
            />
          </Section>

          {/* Directly under stay preferences, which is where the old "Sharing
              options" list lived. Same place in the reading order, except each
              type now carries what a bed costs, how many there are, what comes
              with it and what it looks like. */}
          {/* Always shown, even with nothing published. The section carries its
              own empty state, and one that disappears leaves a reader unable to
              tell "no rooms listed" from "this page is missing a bit". */}
          <Section title="Room types">
            <RoomTypeShowcase roomTypes={property.roomTypes ?? []} />
          </Section>

          <Section title="Contacts">
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Owner
            </Text>
            {ownerContact?.phone ? (
              <ContactRow
                email={ownerContact.email}
                name={ownerContact.name || "Property owner"}
                phone={ownerContact.phone}
              />
            ) : (
              <Text style={{ color: colors.muted, lineHeight: 21 }}>
                Owner contact is not publicly visible for this listing.
              </Text>
            )}

            {/* Only when the owner has listed somebody. A manager may not exist,
                and a heading over nothing is worse than no heading. */}
            {managerContacts.length > 0 ? (
              <>
                <View style={{ backgroundColor: colors.border, height: 1, marginVertical: spacing.sm }} />
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  Manager
                </Text>
                {managerContacts.map((contact) => (
                  <ContactRow
                    email={contact.email}
                    key={contact.userId}
                    name={contact.name || "Manager"}
                    phone={contact.phone ?? ""}
                  />
                ))}
              </>
            ) : null}
          </Section>
        </View>
    </View>
  );
}

/**
 * One contact, unboxed.
 *
 * <p>It used to sit in its own raised card inside the Contacts card — a card in
 * a card, which read as a separate object rather than a row of the section it
 * belongs to. The section already draws the boundary.
 */
function ContactRow({ email, name, phone }: { email: string | null; name: string; phone: string }) {
  const { colors } = useTheme();
  const toast = useToast();

  function callContact() {
    openDialer(phone);
  }

  function openMail() {
    // Still pressable without an address. A dead control that swallows the tap
    // teaches nothing; this says why nothing happened, which is the one thing
    // the grey glyph on its own cannot.
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
        flexDirection: "row",
        gap: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <View style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}>
        <MaterialCommunityIcons color={colors.ink} name="account-tie-outline" size={22} />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>
          {name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>
          {phone}
        </Text>
      </View>
      {/* The two actions are one cluster, so they sit closer to each other than
          to the name they belong to — the row gap would otherwise read as three
          separate things rather than a contact and its two ways in. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 2 }}>
      <Pressable
        accessibilityLabel={`Call ${name}`}
        accessibilityRole="button"
        onPress={callContact}
        style={{
          alignItems: "center",
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <MaterialCommunityIcons color={colors.primary} name="phone-outline" size={19} />
      </Pressable>
      {/* Always rendered, greyed when there is nothing to write to: an icon that
          appears and disappears between listings reads as a layout bug, and its
          absence never explains itself. Grey says "this person has not verified
          an address", which is the actual state. */}
      <Pressable
        accessibilityLabel={email ? `Email ${name}` : `${name} has no verified email`}
        accessibilityRole="button"
        onPress={openMail}
        style={{
          alignItems: "center",
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <MaterialCommunityIcons
          color={email ? colors.primary : colors.kicker}
          name="email-outline"
          size={19}
        />
      </Pressable>
      </View>
    </View>
  );
}



type DetailItem = { label: string; value: string };

/**
 * @param footer a full-width block rendered INSIDE the border, under the rows.
 *     For a value that will not fit a cell — a list rather than a figure — but
 *     still belongs to the same table. Outside the border it read as a separate
 *     section of the screen.
 */
function DetailGrid({ footer, rows }: { footer?: ReactNode; rows: DetailItem[][] }) {
  const { colors } = useTheme();

  // borderStrong, not border. These grids are the only outlined boxes on a page
  // of filled cards, and at the lightest hairline the table read as a set of
  // loose rows rather than one bounded thing.
  return (
    <View style={{ borderColor: colors.borderStrong, borderRadius: 14, borderWidth: 1, overflow: "hidden" }}>
      {rows.map((row, rowIndex) => (
        <View
          key={row.map((item) => item.label).join("-")}
          style={{
            borderBottomColor: colors.border,
            // The footer is another row, so the last cell row keeps its rule
            // when one follows it.
            borderBottomWidth: rowIndex === rows.length - 1 && !footer ? 0 : 1,
            flexDirection: "row",
          }}
        >
          {row.map((item, columnIndex) => (
            <DetailCell item={item} key={item.label} showDivider={columnIndex === 0 && row.length > 1} />
          ))}
        </View>
      ))}
      {footer ? (
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

function DetailCell({ item, showDivider }: { item: DetailItem; showDivider: boolean }) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        borderRightColor: colors.borderStrong,
        borderRightWidth: showDivider ? 1 : 0,
        flex: 1,
        gap: 4,
        minWidth: 0,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      <Text
        style={[type.eyebrow, { color: colors.muted }]}
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
