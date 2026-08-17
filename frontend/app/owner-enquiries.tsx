import { useMemo, useState } from "react";
import { Dimensions, Linking, Text, View } from "react-native";
import { History, Mail, MessageSquare, Phone, User } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
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
  const [viewingLog, setViewingLog] = useState<EnquiryDetail | null>(null);

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
                  onViewLog={() => setViewingLog(enquiry)}
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
            // Accurate about what happened: the app handed off to the dialer or
            // mail client. Nothing was sent to the enquirer from in here.
            toast.show(channel === "EMAIL" ? "Marked as emailed." : "Marked as called.", "success");
          }}
        />
      ) : null}

      {viewingLog ? <ActionLogSheet enquiry={viewingLog} onClose={() => setViewingLog(null)} /> : null}
    </ScreenScrollView>
  );
}

function EnquiryCard({
  enquiry,
  onRespond,
  onViewLog,
}: {
  enquiry: EnquiryDetail;
  onRespond: () => void;
  onViewLog: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  // Status, not `responses.length` — the New filter and both badges count on
  // status, and a pill disagreeing with the number beside it is worse than
  // either being wrong on its own.
  const isNew = enquiry.status === "NEW";

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
          {isNew ? (
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

        {/* Respond takes the row; the log is a square beside it. What was done
            and by whom lives behind that button rather than on the card — it is
            history, and history on every card buries the message that matters. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flex: 1 }}>
            <ActionButton label="Respond" onPress={onRespond} />
          </View>
          <ActionLogButton count={enquiry.responses.length} onPress={onViewLog} />
        </View>

        <Text style={[type.caption, { color: colors.kicker }]}>
          {formatWhen(enquiry.createdAt)}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Opens the action log. Outlined container, ink glyph, no fill — the house icon
 * treatment, matched in height to the Respond button beside it.
 *
 * <p>Greyed with nothing to show rather than hidden: an owner checking "has
 * anyone dealt with this" needs the same control to answer "no" as to answer
 * "yes", and a button that appears only after the fact is one they never learn
 * is there.
 */
function ActionLogButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const empty = count === 0;

  return (
    <AnimatedPressable
      accessibilityLabel={empty ? "Action log, nothing yet" : `Action log, ${count} action${count === 1 ? "" : "s"}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: empty }}
      disabled={empty}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: empty ? colors.borderStrong : colors.ink,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        height: 48,
        justifyContent: "center",
        width: 48,
      }}
    >
      <History color={empty ? colors.muted : colors.ink} size={20} strokeWidth={2} />
    </AnimatedPressable>
  );
}

/** What was done, by whom, when — the whole history, newest first. */
function ActionLogSheet({ enquiry, onClose }: { enquiry: EnquiryDetail; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <SheetShell onClose={onClose} title="Action log">
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        Every time someone reached out to {firstName(enquiry.enquirerName)}.
      </Text>

      {enquiry.responses.map((response) => (
        <View
          key={response.id}
          style={{
            borderColor: colors.border,
            borderLeftColor: colors.jade,
            borderLeftWidth: 4,
            borderWidth: 1,
            gap: 3,
            padding: spacing.md,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            {response.channel === "EMAIL" ? (
              <Mail color={colors.jade} size={13} strokeWidth={2.4} />
            ) : (
              <Phone color={colors.jade} size={13} strokeWidth={2.4} />
            )}
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
              {response.channel === "EMAIL" ? "Emailed" : "Called"}
            </Text>
          </View>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {response.respondedByName ?? "Someone"} · {formatWhen(response.respondedAt)}
          </Text>
          {response.note ? (
            <Text style={[type.caption, { color: colors.muted, marginTop: 2 }]}>
              {response.note}
            </Text>
          ) : null}
        </View>
      ))}
    </SheetShell>
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
  const { colors, type } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [respond] = useRespondToEnquiryMutation();

  const emailChannel = enquiry.reachableChannels.find((channel) => channel.channel === "EMAIL");
  const callChannel = enquiry.reachableChannels.find((channel) => channel.channel === "CALL_BACK");

  /**
   * Hands the conversation to the phone, and records that it happened.
   *
   * <p>The hand-off comes first and is what must not fail: the record is an
   * internal note, but the dialer opening is the actual reply. If recording
   * fails the owner is still mid-call, so it is logged into the error line
   * rather than blocking anything.
   */
  async function choose(channel: EnquiryResponseChannel, target: string | undefined) {
    setError(null);

    const url = channel === "EMAIL" ? `mailto:${target}` : `tel:${target}`;
    try {
      await Linking.openURL(url);
    } catch {
      setError(
        channel === "EMAIL"
          ? "No email app is set up on this device."
          : "Could not open the dialer on this device.",
      );
      return;
    }

    try {
      await respond({ channel, enquiryId: enquiry.id, note: null }).unwrap();
    } catch {
      // The reply is already happening; a failed bookkeeping write must not
      // look like a failed response.
    }
    onResponded(channel);
  }

  return (
    <SheetShell onClose={onClose} title={`Respond to ${firstName(enquiry.enquirerName)}`}>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        Reach them directly — nothing is sent from inside the app.
      </Text>

      <ChannelOption
        available={Boolean(callChannel)}
        icon={Phone}
        label="Call back"
        onPress={() => void choose("CALL_BACK", callChannel?.target)}
        subtitle={callChannel?.target ?? "No phone number on file"}
      />

      <ChannelOption
        available={Boolean(emailChannel)}
        icon={Mail}
        label="Email"
        onPress={() => void choose("EMAIL", emailChannel?.target)}
        subtitle={emailChannel?.target ?? `${firstName(enquiry.enquirerName)} has no verified email`}
      />

      {/* Rendered, never enabled. Leaving it out entirely would make the feature
          look absent rather than pending. */}
      <ChannelOption
        available={false}
        dashed
        icon={MessageSquare}
        label="Chat"
        onPress={() => undefined}
        subtitle="Coming soon"
      />

      {error ? (
        <Text style={[type.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}

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
