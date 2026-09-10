import { useState } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Phone, Search, UserPlus, UserRound } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FieldError } from "@/components/field-error";
import { SingleOptionPicker } from "@/components/option-picker";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { OwnerStaffProfileSkeleton } from "@/components/skeletons/owner";
import { PhoneField } from "@/features/auth/auth-ui";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, NoticeBar } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { DatePickerField, ManagerAccessModal } from "@/features/owner/staff-workspace";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  useAddPropertyManagerMutation,
  useLazyLookupManagerQuery,
  useListMyPropertiesQuery,
  type ManagerLookup,
} from "@/store/services/property-api";
import type { SalaryStructure } from "@/store/services/staff-api";
import { rupeesToPaise } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Assigning a manager to a property.
 *
 * <p>
 * A screen, not the sheet it used to be. The flow is a lookup, then a full
 * employment record, then a permissions decision — three stages and a dozen
 * fields, which a bottom sheet asks someone to scroll through a window while the
 * keyboard eats half of it.
 *
 * <p>
 * Shaped like tenant onboarding on purpose: a card that asks for the number,
 * then a separate card about the person it found. An owner adding a manager and
 * an owner adding a tenant are doing the same thing — attaching a phone number
 * to a role at this property — and the two should not feel like different
 * products.
 */
export default function OwnerAddManagerScreen() {
  const { colors } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const property = (useListMyPropertiesQuery().data ?? []).find((item) => item.id === propertyId) ?? null;

  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<ManagerLookup | null>(null);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [salaryStructure, setSalaryStructure] = useState<SalaryStructure>("MONTHLY");
  const [salary, setSalary] = useState("");
  const [benefits, setBenefits] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [notes, setNotes] = useState("");

  /**
   * The manager once they exist, which turns this screen into the access step.
   *
   * <p>A new manager holds NO permissions — absence is NONE, so they can open
   * the workspace and nothing inside it. Leaving now would hand the owner a
   * manager who cannot work and no hint why, so the decision is made here
   * before the screen closes.
   */
  const [assigned, setAssigned] = useState<{ managerUserId: string; name: string } | null>(null);

  const form = useFormErrors<"phone" | "fullName" | "salary" | "startDate">();
  const [runLookup, lookupState] = useLazyLookupManagerQuery();
  const [addManager, addState] = useAddPropertyManagerMutation();

  function changePhone(value: string) {
    setPhone(value);
    // Everything below the number describes whoever that number belongs to, so
    // changing it discards the answer rather than leaving a name attached to a
    // different person.
    setFullName("");
    setLookup(null);
    form.clearAll();
  }

  async function doLookup() {
    if (!form.validate(/^\d{10,15}$/.test(phone.trim()) ? {} : { phone: "Enter a valid phone number." })) {
      return;
    }
    try {
      const result = await runLookup({ phone: phone.trim(), propertyId: propertyId ?? "" }).unwrap();
      setLookup(result);
      if (result.exists && result.fullName) {
        setFullName(result.fullName);
      }
    } catch (error) {
      form.failFromServer(errorMessage(error) || "Could not look up this phone number. Try again.");
    }
  }

  async function submit() {
    if (!propertyId) {
      return;
    }
    const salaryRatePaise = rupeesToPaise(salary);
    // The lookup gate belongs on the phone field: it is that number that has not
    // been checked, or has come back ineligible.
    const problems = {
      ...(lookup?.eligible
        ? {}
        : { phone: lookup?.message ?? "Look up the phone number before assigning a manager." }),
      ...(fullName.trim() ? {} : { fullName: "Enter the manager's name." }),
      ...(salaryRatePaise ? {} : { salary: "Enter a valid amount." }),
      ...(startDate ? {} : { startDate: "Pick a working start date." }),
    };
    if (!form.validate(problems) || !salaryRatePaise) {
      return;
    }

    try {
      const created = await addManager({
        propertyId,
        payload: {
          benefitsSummary: benefits,
          dateOfBirth: dateOfBirth || null,
          employmentEndDate: null,
          employmentNotes: notes,
          employmentStartDate: startDate,
          fullName: fullName.trim(),
          phone: phone.trim(),
          salaryRatePaise,
          salaryStructure,
        },
      }).unwrap();
      setAssigned({ managerUserId: created.managerUserId, name: fullName.trim() });
      toast.show("Manager assigned. Now choose their access.");
    } catch (error) {
      form.failFromServer(
        errorMessage(error) || "Could not assign the manager. Check the details and try again.",
      );
    }
  }

  if (!propertyId) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <EmptyState
          description="Managers are assigned to one property. Choose one on Home first."
          icon={UserPlus}
          title="Select a property"
        />
      </ScreenScrollView>
    );
  }

  const nameLocked = Boolean(lookup?.exists && lookup.fullName);

  return (
    <ScreenScrollView
      background={
        <View style={{ backgroundColor: colors.surface, flex: 1 }}>
          <LinearGradient
            colors={[colors.primarySoft, colors.surface]}
            end={{ x: 0.5, y: 1 }}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            style={{ height: 260 }}
          />
        </View>
      }
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      {/* No back row. The gesture and the hardware button both still leave, and
          an arrow above a form is one more thing between the reader and the
          first field. */}
      <ScreenHeader
        italicTail="manager."
        subtitle={
          property
            ? `Give someone the run of ${property.name}, on terms you set here.`
            : "Give someone the run of this property, on terms you set here."
        }
        title="Assign"
      />

      {/* Everything below goes once the manager exists. The access step is a
          modal over this screen, and a filled-in assignment form sitting behind
          it read as a form still waiting to be submitted, for somebody who had
          already been assigned.

          The auth screen's own phone field, not a bare digits input: the flag and
          fixed +91 are how this app asks for a number everywhere else, and a
          plain box here would make the same question look like a different one.
          It clamps to ten digits by itself. */}
      {assigned ? null : (
        <Card style={{ borderRadius: 8 }}>
          <PhoneField error={form.errors.phone} label="Manager phone" onChangeText={changePhone} value={phone} />
          <ActionButton
            disabled={lookupState.isFetching}
            icon={Search}
            label={lookupState.isFetching ? "Looking up" : "Look up"}
            onPress={() => void doLookup()}
          />
        </Card>
      )}

      {lookupState.isFetching && !lookup && !assigned ? <OwnerStaffProfileSkeleton /> : null}

      {/* A card of its own beneath the lookup, not an expansion inside it. The
          answer is about a person, and a person's details reading as an appendix
          to the field that found them is the wrong emphasis. */}
      {lookup && !assigned ? (
        <Card>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            {/* Outlined, never filled — the app's icon rule. The glyph says which
                KIND of person this is, the notice below says whether they can
                take the job, which is a different question. */}
            <View
              style={{
                alignItems: "center",
                borderColor: colors.ink,
                borderRadius: 999,
                borderWidth: 1.5,
                height: 46,
                justifyContent: "center",
                width: 46,
              }}
            >
              {lookup.exists ? (
                <UserRound color={colors.ink} size={21} strokeWidth={2} />
              ) : (
                <UserPlus color={colors.ink} size={21} strokeWidth={2} />
              )}
            </View>

            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <PersonName name={fullName.trim() || "New manager"} />
              <PersonPhone phone={phone} />
            </View>
          </View>

          <NoticeBar
            message={lookup.message}
            title={
              !lookup.eligible
                ? "Cannot be assigned"
                : lookup.exists
                  ? "Existing Khatiyan account"
                  // Not "New manager": the notice says what happens next, and
                  // the card above it already shows who this is.
                  : "No account yet"
            }
            tone={!lookup.eligible ? "danger" : lookup.exists ? "success" : "info"}
          />

          {lookup.eligible ? (
            <>
              {/* An account we already hold owns its own name. Letting the owner
                  retype it here would fork the person's identity across two
                  records — the same account may be a tenant somewhere else. */}
              {nameLocked ? (
                <LockedField
                  hint="Taken from their existing account and cannot be changed here."
                  label="Full name"
                  value={lookup.fullName ?? ""}
                />
              ) : (
                <FormInput
                  autoCapitalize="words"
                  error={form.errors.fullName}
                  label="Full name"
                  onChangeText={(next) => {
                    setFullName(next);
                    form.clearField("fullName");
                  }}
                  placeholder="Manager name"
                  required
                  value={fullName}
                />
              )}

              <DatePickerField clearable label="Date of birth" onChange={setDateOfBirth} value={dateOfBirth} />

              {/* Structure and rate on one row — one decision read together,
                  "monthly at ₹12,000". Both are free here: nothing has accrued
                  on a manager who has not been created yet. */}
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <SingleOptionPicker
                    centered
                    label="Pay structure"
                    onChange={(next) => setSalaryStructure(next)}
                    options={[
                      { label: "Monthly", value: "MONTHLY" as const },
                      { label: "Daily", value: "DAILY" as const },
                    ]}
                    showIcon={false}
                    value={salaryStructure}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput
                    error={form.errors.salary}
                    keyboardType="decimal-pad"
                    label={salaryStructure === "DAILY" ? "Daily rate" : "Monthly salary"}
                    onChangeText={(next) => {
                      setSalary(next);
                      form.clearField("salary");
                    }}
                    placeholder="0"
                    prefix="₹"
                    required
                    value={salary}
                  />
                </View>
              </View>

              <FormInput
                label="Benefits provided"
                multiline
                onChangeText={setBenefits}
                placeholder="Optional benefits"
                value={benefits}
              />

              <DatePickerField
                label="Working start date"
                onChange={(next) => {
                  setStartDate(next);
                  form.clearField("startDate");
                }}
                value={startDate}
              />
              <FieldError message={form.errors.startDate} />
              {/* Said before it is set, not after it locks. */}
              <Text style={{ color: colors.kicker, fontSize: 12.5, lineHeight: 17 }}>
                Salary is worked out from this date, so it cannot be changed once it has passed.
              </Text>

              <FormInput
                label="Notes"
                multiline
                onChangeText={setNotes}
                placeholder="Optional employment notes"
                value={notes}
              />

              <ActionButton
                disabled={addState.isLoading || form.blocked}
                icon={UserPlus}
                label={addState.isLoading ? "Assigning" : "Assign manager"}
                onPress={() => void submit()}
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {/* The access step, on the same screen. Closing it leaves the flow, which
          is the only way out once the manager exists. */}
      {assigned ? (
        <ManagerAccessModal manager={assigned} onClose={() => router.back()} propertyId={propertyId} />
      ) : null}

      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

function PersonName({ name }: { name: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
      {name}
    </Text>
  );
}

/** The number marked AS a number — under a name it otherwise reads as a second line of it. */
function PersonPhone({ phone }: { phone: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      <Phone color={colors.muted} size={13} strokeWidth={2.2} />
      <Text style={[type.caption, { color: colors.muted }]}>{formatIndianPhone(phone)}</Text>
    </View>
  );
}

/** A value the owner may read but not set, shaped like the fields around it. */
function LockedField({ hint, label, value }: { hint: string; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1.5,
          justifyContent: "center",
          minHeight: 50,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 15 }}>{value}</Text>
      </View>
      <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>{hint}</Text>
    </View>
  );
}

/** Today in IST, matching the backend's day boundaries. */
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date());
}
