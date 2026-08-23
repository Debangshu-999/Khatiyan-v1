import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { BellRing, Clock, Send, User } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { AppTextInput } from "@/components/app-text-input";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard } from "@/components/skeleton";
import { TabSwitcher } from "@/components/tab-switcher";
import { useToast } from "@/components/toast";
import { ActionButton } from "@/features/owner/owner-ui";
// Generic client-side slicer, first written for the alerts queue. The candidate
// list arrives whole — the cooldown ordering needs every row — so paging it here
// costs nothing and avoids a second endpoint shape.
import { paginateAlerts } from "@/features/notifications/alert-filters";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  describeCooldownRemaining,
  NUDGE_MESSAGE_MAX_LENGTH,
  NUDGE_REFETCH_OPTIONS,
  useListNudgeCandidatesQuery,
  useListSentNudgesQuery,
  useSendNudgeMutation,
  type Nudge,
  type NudgeCandidate,
} from "@/store/services/nudge-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type NudgeTab = "send" | "sent";

const PAGE_SIZE = 6;
// The cooldown label counts down without asking the server. Half a minute is
// fine for a three-hour timer and keeps the screen from re-rendering constantly.
const COUNTDOWN_TICK_MS = 30_000;

export default function OwnerNudgesScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const selectedProperty = resolveSelectedProperty(propertiesQuery.data ?? [], selectedPropertyId);

  const [tab, setTab] = useState<NudgeTab>("send");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [composeFor, setComposeFor] = useState<NudgeCandidate | null>(null);

  const candidatesQuery = useListNudgeCandidatesQuery(selectedProperty?.id ?? "", {
    ...NUDGE_REFETCH_OPTIONS,
    skip: !selectedProperty,
  });
  const sentQuery = useListSentNudgesQuery(selectedProperty?.id ?? "", {
    ...NUDGE_REFETCH_OPTIONS,
    skip: !selectedProperty,
  });

  // Re-rendered on a timer so "again in 2h 04m" stays true while the screen sits
  // open, rather than freezing at whatever it said when the data landed.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(handle);
  }, []);

  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);
  const matches = useMemo(() => filterCandidates(candidates, search), [candidates, search]);
  const paged = paginateAlerts(matches, page, PAGE_SIZE);

  // A narrowed search can leave the current page past the end of the results.
  useEffect(() => {
    setPage(0);
  }, [search, selectedProperty?.id]);

  const sent = sentQuery.data ?? [];

  return (
    <ScreenScrollView
      // The nested-screen top position, shared with every other back-button screen.
      contentContainerStyle={{ paddingTop: 0 }}
      safeAreaEdges={["top", "bottom"]}
    >
      <ScreenHeader
        eyebrow="Notifications"
        italicTail="tenant."
        onBack={() => router.back()}
        subtitle={
          selectedProperty
            ? "One-way — tenants cannot reply. Each tenant can be nudged once every 3 hours."
            : "Select a property from Home first."
        }
        title="Nudge a"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Nudges are scoped to the active owner property."
          icon={BellRing}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        <>
          <TabSwitcher
            active={tab}
            onChange={setTab}
            options={[
              { label: "Nudge", value: "send" as const },
              { label: "Sent", value: "sent" as const },
            ]}
          />

          {tab === "send" ? (
            <Section title={`${matches.length} ${matches.length === 1 ? "tenant" : "tenants"}`}>
              {/* Under the count, not above it: the heading names what is being
                  searched, so the box belongs inside what it narrows. */}
              <SearchField
                onChangeText={setSearch}
                placeholder="Search by tenant name or room"
                value={search}
              />

              {candidatesQuery.isFetching && candidates.length === 0 ? (
                <SkeletonCard />
              ) : matches.length === 0 ? (
                <EmptyState
                  description={
                    search.trim()
                      ? "No active tenant matches that name or room."
                      : "Nudges go to tenants who are currently staying. Onboard one first."
                  }
                  icon={BellRing}
                  title={search.trim() ? "Nothing found" : "No active tenants"}
                />
              ) : (
                <>
                  {paged.pageItems.map((candidate) => (
                    <CandidateCard
                      candidate={candidate}
                      key={candidate.tenancyId}
                      now={now}
                      onNudge={() => setComposeFor(candidate)}
                    />
                  ))}
                  {/* Shown for a single page too. The list is a roster people
                      scan for one name, and a pager that appears only past six
                      tenants leaves them unsure whether the list ended. */}
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
          ) : (
            <Section title={`${sent.length} ${sent.length === 1 ? "nudge" : "nudges"}`}>
              {sentQuery.isFetching && sent.length === 0 ? (
                <SkeletonCard />
              ) : sent.length === 0 ? (
                <EmptyState
                  description="Nudges you and your managers send appear here for seven days."
                  icon={Send}
                  title="Nothing sent"
                />
              ) : (
                <>
                  {sent.map((nudge) => (
                    <SentNudgeCard key={nudge.id} nudge={nudge} />
                  ))}
                  <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
                    Showing the last 7 days.
                  </Text>
                </>
              )}
            </Section>
          )}
        </>
      ) : null}

      {composeFor ? (
        <ComposeSheet
          candidate={composeFor}
          onClose={() => setComposeFor(null)}
          onSent={(name) => {
            setComposeFor(null);
            toast.show(`Nudge sent to ${name ?? "the tenant"}.`, "success");
          }}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function CandidateCard({
  candidate,
  now,
  onNudge,
}: {
  candidate: NudgeCandidate;
  now: number;
  onNudge: () => void;
}) {
  const { colors, type } = useTheme();
  // The server's `canNudge` was true when the list was fetched. The countdown is
  // what is true now, so a row that cooled down while the screen sat open opens
  // up on its own rather than waiting for a refetch.
  const remaining = candidate.cooldownEndsAt
    ? describeCooldownRemaining(candidate.cooldownEndsAt, now, candidate.lastNudgedAt)
    : null;
  const cooling = remaining !== null;

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {/* The icon is its own column so everything under the name starts at the
            name, rather than the room hanging back under the glyph. */}
        <View style={{ flex: 1, flexDirection: "row", gap: spacing.xs }}>
          <User color={colors.ink} fill={colors.ink} size={14} style={{ marginTop: 4 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.display, { color: colors.ink, fontSize: 17, lineHeight: 22 }]} numberOfLines={1}>
              {candidate.tenantName ?? "Unnamed tenant"}
            </Text>
            {/* The name is who the owner is looking for; the room is how they
                confirm it. Under, not above. */}
            <Text style={[type.caption, { color: colors.kicker }]}>
              {candidate.roomNumber ? `Room ${candidate.roomNumber}` : "Room not set"}
            </Text>
            {cooling ? (
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, marginTop: 2 }}>
                <Clock color={colors.kicker} size={11} strokeWidth={2.4} />
                <Text style={[type.caption, { color: colors.kicker }]}>
                  Nudge again in {remaining}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <NudgeButton disabled={cooling} onPress={onNudge} />
      </View>
    </Card>
  );
}

/**
 * A small outlined pill rather than the shared ActionButton.
 *
 * <p>This one sits once per row down a roster, so it has to stay quiet — a
 * filled button repeated ten times reads as ten calls to action. `outline` on
 * ActionButton is ink-bordered; the send action wants the primary colour, which
 * is the one combination that variant does not offer.
 */
function NudgeButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        // Cooling down goes grey: a soft fill with the border and label a
        // distinctly darker shade, so the button still has a defined edge on a
        // card of nearly the same value.
        backgroundColor: disabled ? colors.surfaceSunken : "transparent",
        borderColor: disabled ? colors.muted : colors.primary,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1.5,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: disabled ? colors.muted : colors.primary, fontFamily: fonts.sansBold, fontSize: 12 }}>
        Nudge
      </Text>
    </AnimatedPressable>
  );
}

function SentNudgeCard({ nudge }: { nudge: Nudge }) {
  const { colors, type } = useTheme();

  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          To {nudge.recipientName ?? "tenant"}
          {nudge.roomNumber ? ` · Room ${nudge.roomNumber}` : ""}
        </Text>
        <Text style={[type.quote, { color: colors.ink }]}>
          {nudge.message}
        </Text>
        {/* Who and when share the footer row, pushed to opposite edges — the
            two facts you scan a sent list for, and neither belongs buried in
            the eyebrow with the addressee. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={[type.caption, { color: colors.kicker, flex: 1 }]} numberOfLines={1}>
            {nudge.sentByViewer ? "Sent by you" : `Sent by ${nudge.senderName ?? "a manager"}`}
          </Text>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {formatWhen(nudge.sentAt)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function ComposeSheet({
  candidate,
  onClose,
  onSent,
}: {
  candidate: NudgeCandidate;
  onClose: () => void;
  onSent: (tenantName: string | null) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [message, setMessage] = useState("");
  const form = useFormErrors<"message">();
  const [sendNudge, sendState] = useSendNudgeMutation();

  const trimmed = message.trim();

  async function submit() {
    if (!form.validate(trimmed ? {} : { message: "Write a message first." })) {
      return;
    }
    try {
      await sendNudge({ message: trimmed, tenancyId: candidate.tenancyId }).unwrap();
      onSent(candidate.tenantName);
    } catch (caught) {
      // The cooldown is re-checked server-side, so its refusal arrives here and
      // is the one message worth showing verbatim.
      form.failFromServer(readErrorMessage(caught) ?? "Could not send the nudge. Try again.");
    }
  }

  return (
    <SheetShell onClose={onClose} title={`Nudge ${firstName(candidate.tenantName)}`}>
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>
          Message
        </Text>
        <AppTextInput
          autoFocus
          maxLength={NUDGE_MESSAGE_MAX_LENGTH}
          multiline
          onChangeText={(next) => {
            setMessage(next);
            form.clearField("message");
          }}
          placeholder="A quick reminder that this month's rent is still pending."
          placeholderTextColor={colors.kicker}
          style={{
            borderColor: colors.borderStrong,
            borderRadius: 14,
            borderWidth: 1.5,
            color: colors.ink,
            fontFamily: fonts.sansMedium,
            fontSize: 15,
            minHeight: 96,
            padding: spacing.md,
            textAlignVertical: "top",
          }}
          value={message}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={[type.caption, { color: form.errors.message ? colors.danger : colors.kicker, flex: 1 }]}>
            {form.errors.message ?? "They cannot reply, so keep it specific."}
          </Text>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {trimmed.length} / {NUDGE_MESSAGE_MAX_LENGTH}
          </Text>
        </View>
      </View>

      <ActionButton
        disabled={sendState.isLoading || !trimmed || form.blocked}
        icon={Send}
        label={sendState.isLoading ? "Sending…" : "Send nudge"}
        onPress={() => void submit()}
      />
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

function filterCandidates(candidates: NudgeCandidate[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return candidates;
  }
  return candidates.filter((candidate) => {
    const name = candidate.tenantName?.toLowerCase() ?? "";
    const room = candidate.roomNumber?.toLowerCase() ?? "";
    return name.includes(needle) || room.includes(needle);
  });
}

function firstName(fullName: string | null) {
  if (!fullName) {
    return "tenant";
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
