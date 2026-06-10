import { useEffect } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { ArrowLeft, Building2, CalendarDays, DoorOpen, IndianRupee, UsersRound } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery } from "@/store/services/property-api";
import { useListPropertyTenanciesQuery, type TenancySummary } from "@/store/services/tenancy-api";
import { setSelectedOwnerPropertyId } from "@/store/slices/owner-workspace-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerActiveTenanciesScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty =
    selectedPropertyId
      ? properties.find((property) => property.id === selectedPropertyId) ?? null
      : properties.length === 1
        ? properties[0]
        : null;
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: false, propertyId: selectedProperty?.id ?? "" },
    { skip: !selectedProperty },
  );

  useEffect(() => {
    if (properties.length === 1 && selectedPropertyId !== properties[0].id) {
      dispatch(setSelectedOwnerPropertyId(properties[0].id));
    }
  }, [dispatch, properties, selectedPropertyId]);

  const rooms = roomsQuery.data ?? [];
  const tenancies = tenanciesQuery.data ?? [];

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScreenHeader
        eyebrow="Tenancy"
        title="Active"
        italicTail="stays."
        subtitle={selectedProperty ? `Current tenancies for ${selectedProperty.name}.` : "Select a property first."}
      />

      {(propertiesQuery.isFetching || tenanciesQuery.isFetching) && tenancies.length === 0 ? (
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : null}

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={Building2}
          eyebrow="No property"
          title="No property selected"
          description="Create or select a property before viewing tenancies."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Property
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]} selectable>
              {selectedProperty.name}
            </Text>
            <Text style={[type.body, { color: colors.muted }]} selectable>
              {[selectedProperty.address, selectedProperty.city, selectedProperty.state, selectedProperty.pincode]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </Card>

          <Section eyebrow="Current" title={`${tenancies.length} active tenancy${tenancies.length === 1 ? "" : "ies"}`}>
            {tenancies.length === 0 && !tenanciesQuery.isFetching ? (
              <EmptyState
                icon={UsersRound}
                eyebrow="No active stay"
                title="No active tenancies"
                description="Newly onboarded tenants for this property will appear here."
              />
            ) : null}

            {tenancies.map((tenancy) => (
              <TenancyCard
                key={tenancy.id}
                tenancy={tenancy}
                roomLabel={rooms.find((room) => room.id === tenancy.roomId)?.roomNumber ?? shortId(tenancy.roomId)}
              />
            ))}
          </Section>
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function TenancyCard({ roomLabel, tenancy }: { roomLabel: string; tenancy: TenancySummary }) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primarySoft,
            borderRadius: 12,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <DoorOpen color={colors.primary} size={20} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              {tenancy.referenceCode}
            </Text>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 20,
                fontWeight: "500",
                lineHeight: 25,
              }}
              selectable
            >
              Room {roomLabel}
            </Text>
          </View>
          <InfoLine icon={UsersRound} label="Tenant" value={shortId(tenancy.userId)} />
          <InfoLine icon={IndianRupee} label="Rent" value={formatMoneyPaise(tenancy.rentAmountPaise ?? tenancy.dailyRatePaise ?? 0)} />
          <InfoLine icon={CalendarDays} label="Started" value={formatDate(tenancy.startDate)} />
          <InfoLine icon={Building2} label="Status" value={humanizeToken(tenancy.status)} />
        </View>
      </View>
    </Card>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: string }) {
  const { colors, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={14} strokeWidth={2.1} />
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "800" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        paddingHorizontal: spacing.sm,
      }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.4,
        }}
        selectable
      >
        Back
      </Text>
    </AnimatedPressable>
  );
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoneyPaise(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}
