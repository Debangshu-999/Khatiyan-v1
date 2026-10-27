import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SelectField, type SelectOption } from "@/components/select-field";
import { useToast } from "@/components/toast";
import { PhoneField } from "@/features/auth/auth-ui";
import { formatSlotRange } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { FormSectionTitle } from "@/features/forms/form-section-title";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, rupeesToPaise } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useGetPropertyVisitsQuery } from "@/store/services/enquiry-chat-api";
import { useRecordExternalVisitMutation, type VisitImpression, type VisitInterest } from "@/store/services/lead-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const IMPRESSIONS: SelectOption<VisitImpression>[] = [
  { label: "Yes, they liked it", value: "LIKED" },
  { label: "It was okay", value: "OKAY" },
  { label: "No, they disliked it", value: "DISLIKED" },
];

/** What the ? beside How it went says. */
const HOW_IT_WENT_HELP = {
  steps: [
    { body: "Whether they liked the place and whether they are interested. Both are asked, nothing is chosen for you.", title: "What to record" },
    { body: "Disliked it asks why, so the reason stays with the visit.", title: "If they disliked it" },
    { body: "Interested makes them a strong lead, and asks the sharing and budget they want. Not interested closes their lead.", title: "Interested or not" },
  ],
  title: "How it went",
};

const INTEREST: SelectOption<VisitInterest>[] = [
  { label: "Yes", value: "YES" },
  { label: "Not sure", value: "NOT_SURE" },
  { label: "No", value: "NO" },
];

const SHARING: SelectOption<string>[] = [
  { label: "Single", value: "SINGLE" },
  { label: "Double", value: "DOUBLE" },
  { label: "Triple", value: "TRIPLE" },
  { label: "Four sharing", value: "FOUR_SHARING" },
  { label: "Dormitory", value: "DORMITORY" },
];

/** Today in India, YYYY-MM-DD. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

type Field = "name" | "phone" | "slot" | "impression" | "dislikedReason" | "interest" | "sharing" | "budget";

/**
 * Record external visit (user, 2026-10-19): someone who walked in and saw the
 * place, without booking a visit in the app. Only a visit that happened, today,
 * in one of the day's slots: the slot the button was pressed under on Manage
 * Visits to start with, any other of the day's from the dropdown. It
 * makes or joins their lead, a strong lead unless they said they are not
 * interested. Just a record: they get no account and nothing is sent to them.
 */
export default function OwnerExternalVisitScreen() {
  const router = useGuardedRouter();
  const toast = useToast();
  const { colors, type } = useTheme();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const [recordVisit, state] = useRecordExternalVisitMutation();
  const form = useFormErrors<Field>();

  const params = useLocalSearchParams<{ slot?: string }>();
  // Today's slots, the ones that have ended too: they may have come earlier in the day. As on
  // Manage Visits, a slot the property no longer offers is one too while a visit today keeps it.
  const visitsQuery = useGetPropertyVisitsQuery(propertyId, { skip: !propertyId });
  const slotOptions = useMemo(() => {
    const keys = [
      ...(visitsQuery.data?.todaySlots ?? []).map((slot) => `${slot.start}-${slot.end}`),
      ...(visitsQuery.data?.today ?? []).filter((visit) => !visit.external).map((visit) => `${visit.slotStart}-${visit.slotEnd}`),
    ];
    if (params.slot && !keys.includes(params.slot)) keys.push(params.slot);
    return [...new Set(keys)].sort().map((key): SelectOption<string> => {
      const [start, end] = key.split("-");
      return { label: formatSlotRange(start, end).replace(" to ", " - "), value: key };
    });
  }, [params.slot, visitsQuery.data]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slot, setSlot] = useState<string | null>(params.slot ?? null);
  const [impression, setImpression] = useState<VisitImpression | null>(null);
  const [dislikedReason, setDislikedReason] = useState("");
  const [interest, setInterest] = useState<VisitInterest | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");

  async function submit() {
    // Sharing and budget only for someone interested (user, 2026-10-19).
    const interested = interest === "YES";
    const budgetPaise = interested ? rupeesToPaise(budget) : null;
    const errors: Partial<Record<Field, string>> = {};
    if (!name.trim()) errors.name = "Enter their name.";
    if (phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a 10-digit phone number.";
    if (slotOptions.length > 0 && !slot) errors.slot = "Choose the slot they came in.";
    if (!impression) errors.impression = "Choose how they found the place.";
    // A dislike is recorded with its reason (user, 2026-10-19).
    if (impression === "DISLIKED" && !dislikedReason.trim()) errors.dislikedReason = "Say why they did not like it.";
    if (!interest) errors.interest = "Choose whether they are interested.";
    if (interested && !sharing) errors.sharing = "Choose the sharing they want.";
    if (interested && (budgetPaise == null || budgetPaise <= 0)) errors.budget = "Enter a budget above zero.";
    if (!form.validate(errors) || !impression || !interest) {
      return;
    }
    const [slotStart, slotEnd] = slot ? slot.split("-") : [null, null];
    try {
      const made = await recordVisit({
        body: {
          budgetPaise,
          dislikedReason: impression === "DISLIKED" ? dislikedReason.trim() : null,
          impression,
          interest,
          name: name.trim(),
          note: note.trim() || null,
          phone,
          slotEnd,
          slotStart,
          visitedOn: istToday(),
          wantedSharing: interested ? sharing : null,
        },
        propertyId,
      }).unwrap();
      toast.success(made.leadState === "CLOSED" ? "Visit recorded. Their lead is closed as not interested." : "Visit recorded.");
      router.back();
    } catch (caught) {
      form.failFromServer(errorMessage(caught));
    }
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }} refreshable={false} safeAreaEdges={["top"]}>
        <ScreenHeader italicTail="visit." subtitle="Someone who walked in today and saw the place." title="External" />

        <Card>
          <View style={{ gap: spacing.md }}>
            <FormSectionTitle title="Visitor details" />
            <FormInput error={form.errors.name} label="Name" onChangeText={(next) => { setName(next); form.clearField("name"); }} placeholder="Their full name" required value={name} />
            <PhoneField error={form.errors.phone} label="Phone" onChangeText={(next) => { setPhone(next); form.clearField("phone"); }} value={phone} />
            {slotOptions.length > 0 ? (
              <SelectField error={form.errors.slot} label="Visiting slot" onChange={(next) => { setSlot(next); form.clearField("slot"); }} options={slotOptions} value={slot} />
            ) : null}
          </View>
        </Card>

        <Card>
          <View style={{ gap: spacing.md }}>
            <FormSectionTitle help={HOW_IT_WENT_HELP} title="How it went" />
            <SelectField error={form.errors.impression} label="Did they like the property?" onChange={(next) => { setImpression(next); form.clearField("impression"); form.clearField("dislikedReason"); }} options={IMPRESSIONS} value={impression} />
            {impression === "DISLIKED" ? (
              <FormInput error={form.errors.dislikedReason} label="Why not?" multiline onChangeText={(next) => { setDislikedReason(next); form.clearField("dislikedReason"); }} placeholder="What put them off" required value={dislikedReason} />
            ) : null}
            <SelectField error={form.errors.interest} label="Interested?" onChange={(next) => { setInterest(next); form.clearField("interest"); }} options={INTEREST} value={interest} />
            {interest === "YES" ? (
              <>
                <SelectField error={form.errors.sharing} label="Sharing wanted" onChange={(next) => { setSharing(next); form.clearField("sharing"); }} options={SHARING} value={sharing} />
                <FormInput error={form.errors.budget} keyboardType="decimal-pad" label="Budget a month" onChangeText={(next) => { setBudget(next); form.clearField("budget"); }} placeholder="0" prefix="₹" value={budget} />
              </>
            ) : null}
            <FormInput label="Note" multiline onChangeText={setNote} placeholder="Anything worth remembering" value={note} />
          </View>
        </Card>
      </ScreenScrollView>
      <PinnedFooter>
        <View style={{ flexDirection: "row" }}>
          <ActionButton disabled={state.isLoading || form.blocked || !propertyId} label={state.isLoading ? "Recording..." : "Record visit"} onPress={() => void submit()} />
        </View>
      </PinnedFooter>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </View>
  );
}
