import { useMemo, useState } from "react";
import { Dimensions, Text, View } from "react-native";
import { Mail, MessageSquare, Phone, User } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FilterBubbles } from "@/components/filter-bubbles";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { paginateAlerts } from "@/features/notifications/alert-filters";
import { ActionButton } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  useListPropertyEnquiriesQuery,
  useRespondToEnquiryMutation,
  type EnquiryDetail,
  type EnquiryResponseChannel,
} from "@/store/services/enquiry-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type EnquiryFilter = "new" | "all";

const PAGE_SIZE = 6;

export default function OwnerEnquiriesScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const selectedProperty = resolveSelectedProperty(propertiesQuery.data ?? [], selectedPropertyId);

  // No per-resource gate. The backend guards this module with the standing
  // `ensureCanManageProperty` chokepoint, so any manager of the property may
  // answer — and a screen that hid the button would be claiming a restriction
  // the server does not enforce. A ManagerResource lands here when the module
  // is converted, alongside the backend check.

  const [filter, setFilter] = useState<EnquiryFilter>("new");
  const [page, setPage] = useState(0);
  const [responding, setResponding] = useState<EnquiryDetail | null>(null);

  const enquiriesQuery = useListPropertyEnquiriesQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty,
  });

  const enquiries = useMemo(() => enquiriesQuery.data ?? [], [enquiriesQuery.data]);
  const openCount = enquiries.filter((enquiry) => enquiry.status === "NEW").length;

  // Unanswered first by default, and "All" when there is nothing waiting —
  // opening onto an empty filter reads as "no enquiries" when there are plenty.
  const effectiveFilter: EnquiryFilter = filter === "new" && openCount === 0 ? "all" : filter;
  const visible = effectiveFilter === "new" ? enquiries.filter((enquiry) => enquiry.status === "NEW") : enquiries;
  const paged = paginateAlerts(visible, page, PAGE_SIZE);

  function changeFilter(next: EnquiryFilter) {
    setFilter(next);
    setPage(0);
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        eyebrow="Owner tool"
        italicTail="received."
        onBack={() => router.back()}
        subtitle={
          selectedProperty
            ? `People asking about ${selectedProperty.name} from its public profile.`
            : "Select a property from Home first."
        }
        title="Enquiries"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Enquiries are scoped to the active owner property."
          eyebrow="Property required"
          icon={MessageSquare}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        <Section
          title={`${visible.length} ${visible.length === 1 ? "enquiry" : "enquiries"}`}
          trailing={
            <FilterBubbles
              onChange={changeFilter}
              options={[
                { count: openCount, label: "New", value: "new" as const },
                { label: "All", value: "all" as const },
              ]}
              value={effectiveFilter}
            />
          }
        >
          {enquiriesQuery.isFetching && enquiries.length === 0 ? (
            <SkeletonCard />
          ) : visible.length === 0 ? (
            <NothingAsked answeredEverything={enquiries.length > 0} />
          ) : (
            <>
              {paged.pageItems.map((enquiry) => (
                <EnquiryCard
                  enquiry={enquiry}
                  key={enquiry.id}
                  onRespond={() => setResponding(enquiry)}
                />
              ))}
              <PaginationBar
                hasNext={paged.hasNext}
                hasPrevious={paged.hasPrevious}
                onNext={() => setPage(paged.page + 1)}
                onPrevious={() => setPage(Math.max(0, paged.page - 1))}
                page={paged.page}
                totalElements={paged.totalElements}
                totalPages={paged.totalPages}
              />
            </>
          )}
        </Section>
      ) : null}

      {responding ? (
        <RespondSheet
          enquiry={responding}
          onClose={() => setResponding(null)}
          onResponded={(channel) => {
            setResponding(null);
            toast.show(
              channel === "EMAIL" ? "They have been told to expect an email." : "They have been told to expect a call.",
              "success",
            );
          }}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function EnquiryCard({
  enquiry,
  onRespond,
}: {
  enquiry: EnquiryDetail;
  onRespond: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const answered = enquiry.response !== null;

  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: spacing.xs }}>
            <User color={colors.ink} fill={colors.ink} size={14} />
            <Text style={[type.display, { color: colors.ink, fontSize: 17, lineHeight: 22 }]} numberOfLines={1}>
              {enquiry.enquirerName ?? "Someone"}
            </Text>
          </View>
          {!answered ? (
            <View
              style={{
                borderColor: colors.primary,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: spacing.sm,
                paddingVertical: 1,
              }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 10 }}>
                NEW
              </Text>
            </View>
          ) : null}
        </View>

        {enquiry.enquirerPhone ? (
          <Text style={[type.caption, { color: colors.kicker }]}>
            {enquiry.enquirerPhone}
          </Text>
        ) : null}

        <Text style={[type.body, { color: colors.ink, marginTop: 2 }]}>
          {enquiry.message}
        </Text>

        {answered && enquiry.response ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs }}>
            {enquiry.response.channel === "EMAIL" ? (
              <Mail color={colors.jade} size={12} strokeWidth={2.4} />
            ) : (
              <Phone color={colors.jade} size={12} strokeWidth={2.4} />
            )}
            <Text style={[type.caption, { color: colors.jade, flex: 1 }]} numberOfLines={1}>
              {enquiry.response.channel === "EMAIL" ? "Email promised" : "Call-back promised"}
              {enquiry.response.respondedByName ? ` · ${enquiry.response.respondedByName}` : ""}
            </Text>
            <Text style={[type.caption, { color: colors.kicker }]}>
              {formatWhen(enquiry.response.respondedAt)}
            </Text>
          </View>
        ) : (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.sm,
              justifyContent: "space-between",
              marginTop: spacing.xs,
            }}
          >
            <ActionButton compact label="Respond" onPress={onRespond} variant="outline" />
            <Text style={[type.caption, { color: colors.kicker }]}>
              {formatWhen(enquiry.createdAt)}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

function RespondSheet({
  enquiry,
  onClose,
  onResponded,
}: {
  enquiry: EnquiryDetail;
  onClose: () => void;
  onResponded: (channel: EnquiryResponseChannel) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [respond, respondState] = useRespondToEnquiryMutation();

  const emailChannel = enquiry.reachableChannels.find((channel) => channel.channel === "EMAIL");
  const callChannel = enquiry.reachableChannels.find((channel) => channel.channel === "CALL_BACK");

  async function choose(channel: EnquiryResponseChannel) {
    setError(null);
    try {
      await respond({ channel, enquiryId: enquiry.id, note: note.trim() || null }).unwrap();
      onResponded(channel);
    } catch (caught) {
      setError(readErrorMessage(caught) ?? "Could not record the response. Try again.");
    }
  }

  return (
    <SheetShell onClose={onClose} title={`Respond to ${firstName(enquiry.enquirerName)}`}>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        They are told how you will reach them. Choosing a channel closes the enquiry.
      </Text>

      <ChannelOption
        available={Boolean(callChannel)}
        disabled={respondState.isLoading}
        icon={Phone}
        label="Call back"
        onPress={() => void choose("CALL_BACK")}
        subtitle={callChannel?.target ?? "No phone number on file"}
      />

      <ChannelOption
        available={Boolean(emailChannel)}
        disabled={respondState.isLoading}
        icon={Mail}
        label="Email"
        onPress={() => void choose("EMAIL")}
        subtitle={emailChannel?.target ?? `${firstName(enquiry.enquirerName)} has no verified email`}
      />

      {/* Rendered, never enabled. Leaving it out entirely would make the feature
          look absent rather than pending. */}
      <ChannelOption
        available={false}
        dashed
        disabled
        icon={MessageSquare}
        label="Chat"
        onPress={() => undefined}
        subtitle="Coming soon"
      />

      <View style={{ gap: spacing.xs }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>
          Note (optional, only you see this)
        </Text>
        <AppTextInput
          maxLength={500}
          multiline
          onChangeText={setNote}
          placeholder="Quoted 12k for the single AC room."
          placeholderTextColor={colors.kicker}
          style={{
            borderColor: colors.borderStrong,
            borderRadius: 14,
            borderWidth: 1.5,
            color: colors.ink,
            fontFamily: fonts.sansMedium,
            fontSize: 15,
            minHeight: 72,
            padding: spacing.md,
            textAlignVertical: "top",
          }}
          value={note}
        />
        {error ? (
          <Text style={[type.caption, { color: colors.danger }]}>
            {error}
          </Text>
        ) : null}
      </View>
    </SheetShell>
  );
}

function ChannelOption({
  available,
  dashed,
  disabled,
  icon: Icon,
  label,
  onPress,
  subtitle,
}: {
  available: boolean;
  dashed?: boolean;
  disabled?: boolean;
  icon: typeof Phone;
  label: string;
  onPress: () => void;
  subtitle: string;
}) {
  const { colors, fonts, type } = useTheme();
  const usable = available && !disabled;
  const tint = usable ? colors.primary : colors.muted;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !usable }}
      disabled={!usable}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: usable ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 14,
        borderStyle: dashed ? "dashed" : "solid",
        borderWidth: 1.5,
        flexDirection: "row",
        gap: spacing.md,
        opacity: usable ? 1 : 0.6,
        padding: spacing.md,
      }}
    >
      <Icon color={tint} size={18} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: usable ? colors.ink : colors.muted, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {label}
        </Text>
        <Text style={[type.caption, { color: colors.kicker }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

/**
 * Centred rather than boxed, matching the upcoming-notices and nudges screens:
 * an empty inbox is the ordinary state, not a gap worth boxing.
 */
function NothingAsked({ answeredEverything }: { answeredEverything: boolean }) {
  const { colors, fonts, type } = useTheme();
  const minHeight = Math.round(Dimensions.get("window").height * 0.46);

  return (
    <View
      style={{
        alignItems: "center",
        gap: spacing.md,
        justifyContent: "center",
        minHeight,
        paddingHorizontal: spacing.lg,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderCurve: "continuous",
          borderRadius: 18,
          borderWidth: 1,
          height: 58,
          justifyContent: "center",
          width: 58,
        }}
      >
        <MessageSquare color={colors.ink} size={26} strokeWidth={2} />
      </View>
      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21 }}>
          {answeredEverything ? "All answered" : "No enquiries yet"}
        </Text>
        <Text style={[type.body, { color: colors.muted, maxWidth: 320, textAlign: "center" }]}>
          {answeredEverything
            ? "Nothing is waiting on you."
            : "People who find this property in discovery can ask a question from its profile."}
        </Text>
      </View>
    </View>
  );
}

function firstName(fullName: string | null) {
  if (!fullName) {
    return "them";
  }
  return fullName.trim().split(/\s+/)[0];
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  return selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;
}
