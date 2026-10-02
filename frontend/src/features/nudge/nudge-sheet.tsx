import { useEffect, useMemo, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { Clock, Send, User, type LucideProps } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { SearchField } from "@/components/search-field";
import { SheetShell } from "@/components/sheet-shell";
import { GhostIcon, GhostPill, GhostText, SkeletonBoundary } from "@/components/skeletons/boundary";
import { useToast } from "@/components/toast";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  describeCooldownRemaining,
  NUDGE_MESSAGE_MAX_LENGTH,
  NUDGE_REFETCH_OPTIONS,
  useListNudgeCandidatesQuery,
  useSendNudgeMutation,
  type NudgeCandidate,
} from "@/store/services/nudge-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The cooldown label counts down without asking the server. Half a minute is
// fine for a three-hour timer and keeps the sheet from re-rendering constantly.
const COUNTDOWN_TICK_MS = 30_000;

// Drawn through the real row while the roster loads. Every leaf of the row is a
// Ghost, so none of this reads as a tenant of the property.
const SAMPLE_CANDIDATES: NudgeCandidate[] = [1, 2, 3, 4].map((at) => ({
  canNudge: true,
  cooldownEndsAt: null,
  lastNudgedAt: null,
  roomNumber: "000",
  tenancyId: `sample-${at}`,
  tenantName: "Sample tenant",
  userId: `sample-${at}`,
}));

/**
 * Sending a nudge, start to finish, on one sheet.
 *
 * <p>Two steps share the sheet: the property's tenants, then the message for
 * the one picked. The second step carries a back arrow to the first, and the
 * device back button does the same, so picking the wrong tenant costs one tap
 * rather than closing and reopening.
 *
 * <p>The roster arrives whole, because the cooldown on each row has to be
 * known. It scrolls inside the sheet instead of paging.
 */
export function NudgeSheet({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();

  const candidatesQuery = useListNudgeCandidatesQuery(propertyId, NUDGE_REFETCH_OPTIONS);
  const [search, setSearch] = useState("");
  const [composeFor, setComposeFor] = useState<NudgeCandidate | null>(null);

  // Re-rendered on a timer so "again in 2h 04m" stays true while the sheet sits
  // open, rather than freezing at whatever it said when the data landed.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(handle);
  }, []);

  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);
  const matches = useMemo(() => filterCandidates(candidates, search), [candidates, search]);
  const loading = candidatesQuery.isFetching && !candidatesQuery.data;

  function backToList() {
    // The message field is focused on this step. Left up, the keyboard would
    // sit over a list that has nothing to type into.
    Keyboard.dismiss();
    setComposeFor(null);
  }

  return (
    <SheetShell
      onBack={composeFor ? backToList : undefined}
      onClose={onClose}
      title={composeFor ? `Nudge ${firstName(composeFor.tenantName)}` : "Nudge a tenant"}
    >
      {composeFor ? (
        <ComposeStep
          candidate={composeFor}
          key={composeFor.tenancyId}
          onSent={(name) => {
            onClose();
            toast.show(`Nudge sent to ${name ?? "the tenant"}.`, "success");
          }}
        />
      ) : (
        <>
          <SearchField onChangeText={setSearch} placeholder="Search by tenant name or room" value={search} />

          {loading ? (
            <SkeletonBoundary>
              {SAMPLE_CANDIDATES.map((candidate) => (
                <CandidateRow candidate={candidate} key={candidate.tenancyId} now={now} onNudge={() => undefined} />
              ))}
            </SkeletonBoundary>
          ) : null}

          {!loading && candidatesQuery.isError && candidates.length === 0 ? (
            <Text style={[type.modalDescription, { color: colors.muted, paddingVertical: spacing.md }]}>
              Could not load the tenants. Close this and try again.
            </Text>
          ) : null}

          {!loading && !candidatesQuery.isError && matches.length === 0 ? (
            <Text style={[type.modalDescription, { color: colors.muted, paddingVertical: spacing.md }]}>
              {search.trim()
                ? "No active tenant matches that name or room."
                : "Nudges go to tenants who are currently staying. Onboard one first."}
            </Text>
          ) : null}

          {matches.map((candidate) => (
            <CandidateRow
              candidate={candidate}
              key={candidate.tenancyId}
              now={now}
              onNudge={() => setComposeFor(candidate)}
            />
          ))}
        </>
      )}
    </SheetShell>
  );
}

function FilledUser(props: LucideProps) {
  return <User {...props} fill={props.color} />;
}

function CandidateRow({
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
  // what is true now, so a row that cooled down while the sheet sat open opens
  // up on its own rather than waiting for a refetch.
  const remaining = candidate.cooldownEndsAt
    ? describeCooldownRemaining(candidate.cooldownEndsAt, now, candidate.lastNudgedAt)
    : null;
  const cooling = remaining !== null;

  return (
    <View
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {/* The icon is its own column so everything under the name starts at the
          name, rather than the room hanging back under the glyph. */}
      <View style={{ flex: 1, flexDirection: "row", gap: spacing.xs }}>
        <View style={{ marginTop: 4 }}>
          <GhostIcon color={colors.ink} icon={FilledUser} size={14} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <GhostText
            ghostWidth="58%"
            numberOfLines={1}
            style={[type.display, { color: colors.ink, fontSize: 17, lineHeight: 22 }]}
          >
            {candidate.tenantName ?? "Unnamed tenant"}
          </GhostText>
          {/* The name is who the owner is looking for, the room is how they
              confirm it. Under, not above. */}
          <GhostText ghostWidth="30%" style={[type.caption, { color: colors.kicker }]}>
            {candidate.roomNumber ? `Room ${candidate.roomNumber}` : "Room not set"}
          </GhostText>
          {cooling ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, marginTop: 2 }}>
              <Clock color={colors.kicker} size={11} strokeWidth={2.4} />
              <Text style={[type.caption, { color: colors.kicker }]}>Nudge again in {remaining}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <GhostPill height={26} width={58}>
        <NudgeButton disabled={cooling} onPress={onNudge} />
      </GhostPill>
    </View>
  );
}

/**
 * A small outlined pill rather than the shared ActionButton.
 *
 * <p>This one sits once per row down a roster, so it has to stay quiet. A filled
 * button repeated ten times reads as ten calls to action. `outline` on
 * ActionButton is ink-bordered, and the send action wants the primary colour,
 * which is the one combination that variant does not offer.
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
        // row of nearly the same value.
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

function ComposeStep({
  candidate,
  onSent,
}: {
  candidate: NudgeCandidate;
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
    <>
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>Message</Text>
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
    </>
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

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}
