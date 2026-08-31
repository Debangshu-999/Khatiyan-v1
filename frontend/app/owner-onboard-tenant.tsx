import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, BackHandler, Modal, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { deviceFingerprint, primeInstallId } from "@/auth/device-fingerprint";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp, DoorOpen, Expand, Hotel, Info, KeyRound, Lock, MapPin, Phone, Plus, Trash2, UserPlus, UserRound, Wallet, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { HeaderNote } from "@/components/header-note";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { AlertModal } from "@/components/alert-modal";
import { SingleOptionPicker } from "@/components/option-picker";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { PhoneField } from "@/features/auth/auth-ui";
import { DateOfBirthField } from "@/features/account/date-of-birth-field";
import { emailProblem } from "@/features/forms/email-validation";
import { GENDER_LABELS, GenderPicker } from "@/features/account/gender-picker";
import { ClickwrapConsent } from "@/features/compliance/clickwrap-consent";
import { AgreementDocument } from "@/features/compliance/agreement-document";
import { AgreementTemplateEditor } from "@/features/compliance/agreement-template-editor";
import { OnboardingGateBoard } from "@/features/compliance/onboarding-gate-board";
import { Section } from "@/components/section";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  useGetLegalStatementQuery,
  useGetOnboardingReadinessQuery,
  useGetPropertyAgreementSettingsQuery,
  useListMiscClausesQuery,
  useOnboardTenantWithAgreementMutation,
  usePreviewTenancyAgreementQuery,
  type AgreementTemplate,
  type Gender,
} from "@/store/services/compliance-api";
import {
  useLazyLookupTenantQuery,
  useOnboardDailyStayMutation,
  type TenancyOnboardingResult,
  type TenantLookup,
  type TenantPrefill,
} from "@/store/services/tenancy-api";
import {
  useListMyPropertiesQuery,
  useListPropertyRoomsQuery,
  type OwnerProperty,
  type OwnerRoom,
} from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Step = "type" | "tenant" | "details" | "review" | "agreement" | "done";
type IdDocumentType = "AADHAAR" | "PASSPORT" | "DRIVING_LICENCE" | "VOTER_ID" | "PAN" | "OTHER";

/**
 * The wizard as a person experiences it: five things to do, then a result.
 *
 * <p>"done" is deliberately absent from the count. It is the outcome rather
 * than a sixth task, and including it would leave the bar short of full on the
 * screen that says the work is finished.
 */
const STEP_ORDER: Step[] = ["type", "tenant", "details", "review", "agreement"];

const STEP_TITLE: Record<Step, string> = {
  agreement: "Agreement",
  details: "Room and dates",
  done: "Complete",
  review: "Review",
  tenant: "Tenant",
  type: "Tenancy type",
};

/**
 * Where Back goes from each step.
 *
 * <p>"type" has no previous step, so Back leaves the flow; "done" has nothing
 * to go back to — the tenancy already exists and stepping back into the form
 * would invite a second submission.
 */
const PREVIOUS_STEP: Partial<Record<Step, Step>> = {
  agreement: "review",
  details: "tenant",
  review: "details",
  tenant: "type",
};
type BillingKind = "MONTHLY" | "DAILY";

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

// Whole nights between two date-only values.
function nightsBetween(start: Date, end: Date) {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000);
}

function startOfDay(d: Date) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDateLong(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(paise / 100);
}

function errorText(e: unknown) {
  if (typeof e === "object" && e && "data" in e) {
    const d = (e as { data?: { message?: string } }).data;
    if (d?.message) return d.message;
  }
  return "Something went wrong. Please try again.";
}

export default function OwnerOnboardTenantScreen() {
  // Server refusal — nothing on screen to correct.
  const opErrors = useFormErrors<never>();
  // The wizard's own inputs. Separate from opErrors because these have a field
  // to point at, and a message under the box beats a modal that has to be
  // dismissed before the box can be reached.
  const form = useFormErrors<
    | "tenantName"
    | "tenantEmail"
    | "tenantAddress"
    | "tenantPincode"
    | "guestPhone"
    | "guestAge"
    | "guestGender"
    | "idDocumentType"
    | "idLastFour"
  >();

  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  // Onboarding only surfaces error feedback (success advances the wizard step).
  const setMessage = (value: string | null) => {
    if (value) {
      opErrors.failFromServer(value);
    }
  };

  // Type first, then who is staying. The kind of stay decides what the next
  // step even asks for: a monthly tenant gets a phone lookup because they will
  // hold an account, and a daily guest gets a register form because they will
  // not. Asking for the phone first meant looking up an account for somebody
  // who was about to turn out not to need one.
  const [step, setStep] = useState<Step>("type");
  const [confirmExit, setConfirmExit] = useState(false);

  // Read once on mount so the fingerprint can be assembled synchronously when
  // the declaration is made.
  useEffect(() => {
    void primeInstallId();
  }, []);
  const [idDocumentType, setIdDocumentType] = useState<IdDocumentType | null>(null);
  const [idLastFour, setIdLastFour] = useState("");
  /** How much room the pinned footer actually takes, so the list can clear it. */
  const [footerHeight, setFooterHeight] = useState(0);
  const idStatementQuery = useGetLegalStatementQuery("TENANT_ID_DECLARATION");
  const idStatement = idStatementQuery.data?.text ?? "";

  /** The IDs a tenant may produce. Aadhaar is one of them, never the default. */
  const ID_DOCUMENT_OPTIONS = [
    { label: "Aadhaar", value: "AADHAAR" as const },
    { label: "Passport", value: "PASSPORT" as const },
    { label: "Driving licence", value: "DRIVING_LICENCE" as const },
    { label: "Voter ID", value: "VOTER_ID" as const },
    { label: "PAN", value: "PAN" as const },
    { label: "Other", value: "OTHER" as const },
  ];
  const previousStep = PREVIOUS_STEP[step] ?? null;

  // The device back button walks the wizard too. Without this it unmounted the
  // whole screen from step 4, losing everything typed — the hardware button
  // knows nothing about steps unless told.
  useEffect(() => {
    if (!previousStep) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep(previousStep);
      return true;
    });
    return () => subscription.remove();
  }, [previousStep]);
  /**
   * Field errors withdraw themselves after a few seconds.
   *
   * <p>They have already done their work by then — the border and the message
   * said what was wrong the moment the button was pressed. Leaving them up means
   * a red box still shouting at somebody who is part-way through fixing it.
   *
   * <p>Typing clears them sooner, via clearField on the input itself.
   */
  const nameError = form.errors.tenantName;
  useEffect(() => {
    if (!nameError) {
      return;
    }
    const timer = setTimeout(() => form.clearField("tenantName"), 3000);
    return () => clearTimeout(timer);
  }, [form, nameError]);

  const [billingType, setBillingType] = useState<BillingKind | null>(null);
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<TenantLookup | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [startDate, setStartDate] = useState<Date>(startOfToday());
  const [plannedEndDate, setPlannedEndDate] = useState<Date>(addDays(startOfToday(), 1));
  const [showPicker, setShowPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [result, setResult] = useState<TenancyOnboardingResult | null>(null);
  // Agreement path: SELECTIVE properties opt in per tenancy; ALL_MONTHLY always
  // goes through the agreement step. Custom clauses are editable on that step.
  // The owner's declaration. Khatiyan verifies nothing — this records that they
  // did, which is where the legal duty actually sits.
  const [idCheckConfirmed, setIdCheckConfirmed] = useState(false);

  // The tenant's own particulars, which the deed names them by.
  //
  // Collected here because the account may not exist yet. For one that does, the
  // lookup prefills these and the already-set fields render read-only — an owner
  // filling in a form is not editing somebody else's profile, and the server
  // writes back only what the account had blank.
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantAddress, setTenantAddress] = useState("");
  const [tenantPincode, setTenantPincode] = useState("");
  const [tenantDob, setTenantDob] = useState("");
  const [tenantGender, setTenantGender] = useState<Gender | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);

  // A daily guest's age, not a date of birth. The register records what was
  // stated at the desk and is never read again, so a stored DOB would imply the
  // app tracks a birthday it has no business tracking.
  const [guestAge, setGuestAge] = useState("");

  const isDaily = billingType === "DAILY";
  const [triggerLookup, lookupState] = useLazyLookupTenantQuery();

  // Seeded from the account when the lookup finds one. Fields it already holds
  // are shown read-only; the server writes back only the blanks either way, so
  // the form and the rule agree rather than the form merely being polite.
  useEffect(() => {
    const prefill = lookupState.data?.prefill;
    // Guarded on the kind as well as the data. RTK Query keeps the last lookup
    // in cache, so without this a re-render after switching to Daily could pour
    // the monthly tenant's account details back into the guest register.
    if (!prefill || isDaily) {
      return;
    }
    setTenantAddress((current) => current || prefill.permanentAddress || "");
    setTenantPincode((current) => current || prefill.permanentAddressPincode || "");
    setTenantDob((current) => current || prefill.dateOfBirth || "");
    setTenantGender((current) => current ?? prefill.gender);
  }, [lookupState.data]);
  const propertiesQuery = useListMyPropertiesQuery(undefined);
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = useMemo<OwnerProperty | undefined>(
    () => resolveSelectedProperty(properties, selectedPropertyId),
    [properties, selectedPropertyId],
  );
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const rooms = roomsQuery.data ?? [];
  // Rooms under maintenance cannot take a new tenancy, so keep them out of the
  // selectable list entirely.
  const selectableRooms = useMemo(() => rooms.filter((room) => room.status !== "MAINTENANCE"), [rooms]);
  const selectedRoom = useMemo<OwnerRoom | undefined>(
    () => rooms.find((room) => room.id === roomId),
    [roomId, rooms],
  );
  const [onboardDailyStay, onboardState] = useOnboardDailyStayMutation();
  const [onboardWithAgreement, onboardWithAgreementState] = useOnboardTenantWithAgreementMutation();

  // Property agreement mode decides whether monthly onboarding routes through
  // the agreement step: ALL_MONTHLY always, SELECTIVE by the owner's toggle.
  const agreementSettingsQuery = useGetPropertyAgreementSettingsQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty,
  });

  // Writing clause prose is a TENANCY_RULES power. A manager may well hold
  // TENANCY_CREATE without it, so they onboard on the property's stored terms
  // and cannot alter them here. The server drops submitted prose regardless.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const clausesReadOnly = !canManageResource("TENANCY_RULES");

  // Every monthly tenancy is agreement-backed. There is no opt-out any more:
  // the agreement is the two-way handshake that makes a tenancy record mean
  // anything, and without it an owner can fabricate a stay end to end.
  const withAgreement = billingType === "MONTHLY";

  // Onboarding cannot start until the property OWNER's profile can carry a deed
  // — the agreement names them as Landlord. Read on arrival so the screen can
  // block with an explanation rather than collecting a refusal at submit.
  const readinessQuery = useGetOnboardingReadinessQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty || !withAgreement,
  });
  const gateBlocked = Boolean(readinessQuery.data && !readinessQuery.data.landlordReady);

  const settingsQuery = useGetPropertyAgreementSettingsQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty || !withAgreement,
  });
  const miscQuery = useListMiscClausesQuery(undefined, { skip: !withAgreement });

  // This tenancy's own copy of the property's template. Seeded once, then edited
  // freely — a clause dropped for this tenant must never vanish from anyone
  // else's deed, so nothing here writes back to the property.
  const [template, setTemplate] = useState<AgreementTemplate | null>(null);
  const [termMonths, setTermMonths] = useState<number | null>(null);
  const [fixedTerm, setFixedTerm] = useState(false);
  const [earlyExitRule, setEarlyExitRule] = useState("");

  useEffect(() => {
    const stored = settingsQuery.data?.template;
    if (!stored || template !== null) {
      return;
    }
    setTemplate(stored);
    setFixedTerm(stored.defaultValidityMonths != null);
    setTermMonths(stored.defaultValidityMonths);
    setEarlyExitRule(stored.defaultEarlyExitRule);
  }, [settingsQuery.data, template]);

  // The preview carries the room and the term, not just the money: the period
  // clause prints the term's dates and the furniture clause lists the room's
  // fittings. Without them the preview would differ from the deed created, in
  // the two clauses a tenant is most likely to check.
  const previewQuery = usePreviewTenancyAgreementQuery(
    {
      depositAmountPaise: Math.round(Number(deposit || "0") * 100),
      earlyExitRule,
      propertyId: selectedProperty?.id ?? "",
      rentAmountPaise: Math.round(Number(rent || "0") * 100),
      roomId,
      startDate: dateToStr(startDate),
      // The deed names the person the form has been collecting, not a blank.
      // Trimmed to null so a half-typed field previews as its placeholder
      // rather than as a stray fragment on a legal document.
      tenant: {
        dateOfBirth: tenantDob.trim() || null,
        fullName: tenantName.trim() || null,
        gender: tenantGender,
        permanentAddress: tenantAddress.trim() || null,
        permanentAddressPincode: tenantPincode.trim() || null,
        phone: phone.trim() || null,
      },
      template,
      validityMonths: fixedTerm ? termMonths : null,
    },
    { skip: step !== "agreement" || !selectedProperty || !withAgreement || !template || gateBlocked },
  );

  // What the agreement step's collapsed sections report about themselves. A
  // section that is shut still has to say what it holds, or an owner accepts a
  // default without ever seeing which one.
  const mainClauses = useMemo(
    () => (previewQuery.data?.clauses ?? []).filter((clause) => clause.kind !== "MISC"),
    [previewQuery.data],
  );
  const clauseCountLabel = `${mainClauses.length} ${mainClauses.length === 1 ? "clause" : "clauses"}`;
  const termSummary = fixedTerm ? `Fixed term, ${termMonths ?? 11} months` : "Indefinite";

  // Daily renting is available when the property has at least one nightly rate
  // configured; the rate that applies depends on the chosen room's AC type.
  const dailyAvailable = Boolean(
    selectedProperty && (selectedProperty.dailyGuestAcRatePaise != null || selectedProperty.dailyGuestNonAcRatePaise != null),
  );
  const dailyRatePaise =
    selectedProperty && selectedRoom
      ? selectedRoom.conditioning === "AC"
        ? selectedProperty.dailyGuestAcRatePaise
        : selectedProperty.dailyGuestNonAcRatePaise
      : null;
  const nights = nightsBetween(startDate, plannedEndDate);

  const phoneValid = /^(\+91)?\d{10}$/.test(phone.trim());

  function handlePhoneChange(value: string) {
    setPhone(value);
    setLookup(null);
    setTenantName("");
    setMessage(null);
  }

  async function handleLookup() {
    setMessage(null);
    setLookup(null);
    setTenantName("");
    if (!phoneValid) {
      setMessage("Enter a valid 10-digit phone number.");
      return;
    }

    try {
      const res = await triggerLookup({ phone: phone.trim(), propertyId: selectedPropertyId ?? undefined }).unwrap();
      setLookup(res);
      if (res.canOnboard && res.exists && res.fullName) {
        setTenantName(res.fullName);
      }
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  /** Puts the picker back, and drops the figures the old room supplied. */
  function clearRoom() {
    setRoomId(null);
    setRent("");
    setDeposit("");
  }

  function selectRoom(room: OwnerRoom) {
    setRoomId(room.id);
    setRent(String(Math.round(room.baseRentPaise / 100)));
    if (selectedProperty) {
      setDeposit(String(Math.round(selectedProperty.standardDepositPaise / 100)));
    }
  }

  /**
   * Leaves the tenant step for a MONTHLY stay.
   *
   * <p>Every particular the deed names the tenant by, checked HERE rather than
   * at submit. They were validated only on the final call, so an owner could
   * walk three more steps and be told at the end that a field on the first one
   * was empty — with the form that owns it no longer on screen.
   *
   * <p>Age and gender are absent by design: they are optional on an agreement,
   * and the deed omits them when blank.
   */
  function goToRoomAndDates() {
    if (!lookup?.canOnboard) {
      return;
    }
    const cleared = form.validate({
      ...(tenantName.trim() ? {} : { tenantName: "Enter the tenant's full name as it appears on their ID." }),
      ...(tenantAddress.trim() ? {} : { tenantAddress: "Enter the tenant's permanent address." }),
      ...(/^\d{6}$/.test(tenantPincode.trim()) ? {} : { tenantPincode: "Enter a 6-digit PIN code." }),
    });
    if (!cleared) {
      return;
    }

    setMessage(null);
    setStep("details");
  }

  /**
   * Leaves the tenant step for a DAILY stay.
   *
   * <p>A different set of fields, because a different thing is being recorded.
   * There is no PIN code and no date of birth — a guest register wants an age
   * and a gender, and it wants them filled in, because this declaration is the
   * whole of the owner's record of who they let the room to.
   *
   * <p>Email is the exception. A walk-in often has no reason to give one, so it
   * is asked for plainly and accepted blank.
   */
  function goToRoomAndDatesForGuest() {
    const age = Number(guestAge.trim());
    // Null blank message: a walk-in may have no email, but a typo is still a typo.
    const emailIssue = emailProblem(tenantEmail, null);
    const cleared = form.validate({
      ...(tenantName.trim() ? {} : { tenantName: "Enter the guest's full name as it appears on their ID." }),
      ...(/^\d{10}$/.test(phone.trim()) ? {} : { guestPhone: "Enter a 10-digit phone number." }),
      ...(emailIssue ? { tenantEmail: emailIssue } : {}),
      ...(tenantAddress.trim() ? {} : { tenantAddress: "Enter the guest's address." }),
      // Number("") is 0, not NaN, so the blank case has to be tested first.
      ...(guestAge.trim() && Number.isInteger(age) && age >= 18 && age <= 120
        ? {}
        : { guestAge: "Enter an age between 18 and 120." }),
      ...(tenantGender ? {} : { guestGender: "Select the guest's gender." }),
    });
    if (!cleared) {
      return;
    }

    setMessage(null);
    setStep("details");
  }

  function chooseBilling(kind: BillingKind) {
    setMessage(null);
    // Whoever was being entered is cleared when the KIND changes, not on every
    // tap. A monthly lookup prefills name, email, address and PIN from the
    // account it found, and those were still sitting in state when the owner
    // went back and picked Daily — so a guest register opened pre-filled with a
    // different person's details. Re-picking the same kind leaves the form
    // alone, because going Back and choosing again is not a decision to discard
    // what you already typed.
    if (billingType !== null && billingType !== kind) {
      setLookup(null);
      setPhone("");
      setTenantName("");
      setTenantEmail("");
      setTenantAddress("");
      setTenantPincode("");
      setTenantDob("");
      setTenantGender(null);
      setGuestAge("");
      setOptionalOpen(false);
      form.clearAll();
    }
    setBillingType(kind);
    // Reset room-derived inputs so a switch between kinds starts clean.
    setRoomId(null);
    setRent("");
    setDeposit("");
    setStep("tenant");
  }

  function goToReview() {
    setMessage(null);
    if (!selectedProperty || !selectedRoom) {
      setMessage("Select a property on Home and choose a room.");
      return;
    }
    if (selectedRoom.status === "MAINTENANCE") {
      setMessage("This room is under maintenance and cannot take a tenancy.");
      return;
    }
    if (selectedRoom.availableVacancies <= 0) {
      setMessage("This room has no available vacancy.");
      return;
    }
    if (dateToStr(startDate) < dateToStr(startOfToday())) {
      setMessage("Start date must be today or a future date.");
      return;
    }
    if (isDaily) {
      if (dailyRatePaise == null) {
        setMessage("This room type has no daily rate configured.");
        return;
      }
      if (nights < 1 || nights > 29) {
        setMessage("Daily stay must be between 1 and 29 nights.");
        return;
      }
    } else if (!(Number(rent) > 0)) {
      setMessage("Rent must be greater than zero.");
      return;
    }
    setStep("review");
  }

  /** Blocks every route out of review until the owner has declared the ID check. */
  /**
   * The declaration is three facts, so it fails in three places.
   *
   * <p>The tick goes through the refusal modal rather than a field error: it is
   * not a box with a correction to make, it is a statement the person has not
   * made yet.
   */
  function idCheckMissing() {
    const cleared = form.validate({
      ...(idDocumentType ? {} : { idDocumentType: "Select which ID you checked." }),
      ...(/^[0-9]{4}$/.test(idLastFour) ? {} : { idLastFour: "Enter the last four digits." }),
    });
    if (!cleared) {
      return true;
    }
    if (!idCheckConfirmed) {
      setMessage("Read the declaration and tick it before continuing.");
      return true;
    }
    return false;
  }

  /** What every onboarding path sends about the ID check. */
  const idCheckPayload = {
    confirmed: idCheckConfirmed,
    documentType: idDocumentType,
    lastFour: idLastFour,
  };

  /**
   * Books the daily stay. The only path that reaches this — a monthly tenancy
   * goes through handleConfirmWithAgreement, because it has an agreement to be
   * accepted before it starts.
   */
  async function handleConfirm() {
    if (!selectedProperty || !roomId) return;
    if (idCheckMissing()) return;
    setMessage(null);
    try {
      const res = await onboardDailyStay({
        guestAddress: tenantAddress.trim(),
        guestAge: Number(guestAge.trim()),
        // Sent as null rather than "" when skipped, so the server stores an
        // absent email instead of an empty one.
        guestEmail: tenantEmail.trim() ? tenantEmail.trim() : null,
        guestGender: tenantGender!,
        guestName: tenantName.trim(),
        guestPhone: phone.trim(),
        idCheck: idCheckPayload,
        plannedEndDate: dateToStr(plannedEndDate),
        propertyId: selectedProperty.id,
        roomId,
        startDate: dateToStr(startDate),
      }).unwrap();
      setResult(res);
      setStep("done");
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  async function handleConfirmWithAgreement() {
    if (!selectedProperty || !roomId) return;
    if (idCheckMissing()) return;
    setMessage(null);
    if (!tenantAddress.trim() || !/^\d{6}$/.test(tenantPincode.trim())) {
      setMessage("The tenant's permanent address and a 6-digit PIN code are needed for the agreement.");
      return;
    }
    try {
      const res = await onboardWithAgreement({
        template,
        tenant: {
          dateOfBirth: tenantDob.trim() ? tenantDob.trim() : null,
          gender: tenantGender,
          permanentAddress: tenantAddress.trim(),
          permanentAddressPincode: tenantPincode.trim(),
        },
        term: { earlyExitRule, months: fixedTerm ? termMonths ?? 11 : null },
        depositAmountPaise: Math.round(Number(deposit || "0") * 100),
        propertyId: selectedProperty.id,
        rentAmountPaise: Math.round(Number(rent) * 100),
        roomId,
        startDate: dateToStr(startDate),
        idCheck: idCheckPayload,
        // Sent back verbatim so the server can refuse a build showing wording
        // it did not write, and hashed into the record either way.
        idCheckStatementText: idStatement,
        device: deviceFingerprint(),
        tenantName: tenantName.trim() ? tenantName.trim() : null,
        tenantPhone: phone.trim(),
      }).unwrap();
      setResult({ tenancy: res.tenancy, tenantAccountCreated: res.tenantAccountCreated });
      setStep("done");
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const onDone = step === "done";

  /**
   * Leaves the wizard, asking first once there is something to lose.
   *
   * <p>Back steps and X leaves — two buttons that used to do the same thing,
   * which made one of them a trap. Now that they differ, X has to say so before
   * discarding a half-filled form.
   */
  function closeWizard() {
    if (onDone || step === "type") {
      router.back();
      return;
    }
    setConfirmExit(true);
  }

  return (
    // The footer is absolutely positioned, so it needs a filled parent that is
    // NOT the scroll view — inside one it scrolls away with the content, which
    // is the one thing a pinned footer must not do.
    <View style={{ backgroundColor: colors.formSurface, flex: 1 }}>
    <ScreenScrollView surface={colors.formSurface}>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          {/* Both slots are always occupied, even when a button would do
              nothing, so the title stays centred instead of drifting left on
              the first and last steps. */}
          <View style={{ width: 40 }}>
            {previousStep ? (
              <HeaderButton icon={ArrowLeft} onPress={() => setStep(previousStep)} subtle />
            ) : null}
          </View>

          {/* The noun in blue, as it was. Blue stays legal as TEXT — it is a
              fill that is banned, not the colour. */}
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 19, textAlign: "center" }}
          >
            {onDone ? "Tenant " : "Onboard "}
            <Text style={{ color: colors.primary }}>{onDone ? "onboarded" : "tenant"}</Text>
          </Text>

          <View style={{ alignItems: "flex-end", width: 40 }}>
            <HeaderButton icon={X} onPress={closeWizard} subtle />
          </View>
        </View>

        {onDone ? null : (
          <View style={{ gap: 6 }}>
            <ProgressBar color={colors.jade} height={4} ratio={(stepIndex + 1) / STEP_ORDER.length} />
            <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
              Step {stepIndex + 1} of {STEP_ORDER.length}
            </Text>
          </View>
        )}
      </View>

      {step === "type" ? (
        <Card>
          {propertiesQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {!propertiesQuery.isLoading && !selectedProperty ? (
            <EmptyState
              icon={KeyRound}
              title={properties.length > 1 ? "Select a property from Home" : "No property available"}
              description="Onboarding uses the owner workspace property selected on Home."
            />
          ) : null}
          {selectedProperty ? (
            <>
              <Text style={[type.body, { color: colors.muted, fontSize: 14 }]}>
                Choose the kind of stay to start. This decides what is asked for next.
              </Text>
              <SelectRow
                title="Monthly tenancy"
                subtitle="Recurring monthly rent with a security deposit and billing cycles."
                selected={billingType === "MONTHLY"}
                onPress={() => chooseBilling("MONTHLY")}
              />
              <SelectRow
                title="Daily tenancy"
                subtitle={
                  dailyAvailable
                    ? "Short stay billed per night (1–29 nights). No deposit."
                    : "Daily rates are not configured for this property."
                }
                selected={billingType === "DAILY"}
                disabled={!dailyAvailable}
                onPress={() => chooseBilling("DAILY")}
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {step === "tenant" ? (
        isDaily ? (
          /* No lookup, and nothing said about whether an account exists —
             because none is created. A daily stay is management-side from end
             to end, so what this step collects is a register entry rather than
             the start of somebody's account. */
          <GuestStayCard
            address={tenantAddress}
            addressError={form.errors.tenantAddress}
            age={guestAge}
            ageError={form.errors.guestAge}
            blocked={form.blocked}
            email={tenantEmail}
            emailError={form.errors.tenantEmail}
            gender={tenantGender}
            genderError={form.errors.guestGender}
            name={tenantName}
            nameError={nameError}
            onAddress={(value) => {
              setTenantAddress(value);
              form.clearField("tenantAddress");
            }}
            onAge={(value) => {
              setGuestAge(value.replace(/[^0-9]/g, ""));
              form.clearField("guestAge");
            }}
            onChangeName={(value) => {
              setTenantName(value);
              form.clearField("tenantName");
            }}
            onContinue={goToRoomAndDatesForGuest}
            onEmail={(value) => {
              setTenantEmail(value);
              form.clearField("tenantEmail");
            }}
            onGender={(value) => {
              setTenantGender(value);
              form.clearField("guestGender");
            }}
            onPhone={(value) => {
              setPhone(value);
              form.clearField("guestPhone");
            }}
            phone={phone}
            phoneError={form.errors.guestPhone}
          />
        ) : (
          <>
            {/* The auth screen's own phone field, not a bare digits input: the
                flag and fixed +91 are how this app asks for a number everywhere
                else, and a plain box here made the same question look like a
                different one. It also clamps to ten digits by itself. */}
            <Card style={{ borderRadius: 8 }}>
              <PhoneField label="Tenant phone" onChangeText={handlePhoneChange} value={phone} />
              <PrimaryButton label="Look up" onPress={handleLookup} busy={lookupState.isFetching} />
            </Card>

            {/* A card of its own beneath the lookup, not an expansion inside it.
                The answer is about a person, and a person's details reading as an
                appendix to the field that found them is the wrong emphasis. */}
            {lookup ? (
              <LookupResultCard
                address={tenantAddress}
                addressError={form.errors.tenantAddress}
                blocked={form.blocked}
                canOnboard={lookup.canOnboard}
                dob={tenantDob}
                exists={lookup.exists}
                existingName={lookup.fullName ?? null}
                gender={tenantGender}
                message={lookup.message}
                name={tenantName}
                nameError={nameError}
                onAddress={(value) => {
                  setTenantAddress(value);
                  form.clearField("tenantAddress");
                }}
                onChangeName={(value) => {
                  setTenantName(value);
                  form.clearField("tenantName");
                }}
                onContinue={goToRoomAndDates}
                onDob={setTenantDob}
                onGender={setTenantGender}
                onPincode={(value) => {
                  setTenantPincode(value);
                  form.clearField("tenantPincode");
                }}
                onToggleOptional={() => setOptionalOpen((current) => !current)}
                optionalOpen={optionalOpen}
                phone={phone}
                pincode={tenantPincode}
                pincodeError={form.errors.tenantPincode}
                prefill={lookup.prefill ?? null}
              />
            ) : null}
          </>
        )
      ) : null}

      {step === "details" ? (
        <>
          <Card>
            {propertiesQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {selectedProperty ? (
              <PropertySummary property={selectedProperty} />
            ) : !propertiesQuery.isLoading ? (
              <EmptyState
                icon={KeyRound}
                title={properties.length > 1 ? "Select a property from Home" : "No property available"}
                description={
                  properties.length > 1
                    ? "Onboarding uses the owner workspace property selected on Home."
                    : "Create a property before onboarding a tenant."
                }
              />
            ) : null}
          </Card>

          {selectedProperty ? (
            <Card>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Room
              </Text>
              {roomsQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
              <RoomPicker
                onClear={clearRoom}
                onSelect={selectRoom}
                priceOf={(room) => {
                  const perNight =
                    room.conditioning === "AC"
                      ? selectedProperty.dailyGuestAcRatePaise
                      : selectedProperty.dailyGuestNonAcRatePaise;
                  if (!isDaily) {
                    return `${rupees(room.baseRentPaise)} / month`;
                  }
                  return perNight != null ? `${rupees(perNight)} / night` : "No daily rate";
                }}
                rooms={selectableRooms}
                selectedRoomId={roomId}
                unavailable={(room) => {
                  const perNight =
                    room.conditioning === "AC"
                      ? selectedProperty.dailyGuestAcRatePaise
                      : selectedProperty.dailyGuestNonAcRatePaise;
                  return room.availableVacancies <= 0 || (isDaily && perNight == null);
                }}
              />
            </Card>
          ) : null}

          {roomId ? (
            <Card>
              {isDaily ? (
                <Field label="Daily rate">
                  <View
                    style={{
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.border,
                      borderRadius: 10,
                      borderWidth: 1,
                      padding: spacing.md,
                    }}
                  >
                    <Text style={[type.bodyStrong, { color: dailyRatePaise != null ? colors.ink : colors.danger }]}>
                      {dailyRatePaise != null ? `${rupees(dailyRatePaise)} / night` : "Not configured for this room type"}
                    </Text>
                  </View>
                </Field>
              ) : (
                <>
                  <Field label="Rent / month">
                    <Input value={rent} onChangeText={setRent} placeholder="From room base rent" keyboardType="number-pad" prefix="₹" />
                  </Field>
                  <Field label="Deposit">
                    <Input value={deposit} onChangeText={setDeposit} placeholder="From property policy" keyboardType="number-pad" prefix="₹" />
                  </Field>
                </>
              )}
              <Field label="Start date">
                <AnimatedPressable
                  onPress={() => setShowPicker(true)}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: 10,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    minHeight: 48,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <CalendarDays color={colors.primary} size={18} strokeWidth={2.1} />
                  <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
                    {formatDateLong(startDate)}
                  </Text>
                </AnimatedPressable>
              </Field>

              {showPicker ? (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={startOfToday()}
                  onChange={(event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== "ios") {
                      setShowPicker(false);
                    }
                    if (event.type === "set" && selected) {
                      setStartDate(selected);
                    }
                  }}
                />
              ) : null}
              {showPicker && Platform.OS === "ios" ? <PrimaryButton label="Done" muted onPress={() => setShowPicker(false)} /> : null}

              {isDaily ? (
                <>
                  <Field label="Checkout date">
                    <AnimatedPressable
                      onPress={() => setShowEndPicker(true)}
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.surfaceRaised,
                        borderColor: colors.border,
                        borderRadius: 10,
                        borderWidth: 1,
                        flexDirection: "row",
                        gap: spacing.sm,
                        minHeight: 48,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      <CalendarDays color={colors.primary} size={18} strokeWidth={2.1} />
                      <Text style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
                        {formatDateLong(plannedEndDate)}
                      </Text>
                    </AnimatedPressable>
                  </Field>

                  {showEndPicker ? (
                    <DateTimePicker
                      value={plannedEndDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "inline" : "default"}
                      minimumDate={addDays(startDate, 1)}
                      onChange={(event: DateTimePickerEvent, selected?: Date) => {
                        if (Platform.OS !== "ios") {
                          setShowEndPicker(false);
                        }
                        if (event.type === "set" && selected) {
                          setPlannedEndDate(selected);
                        }
                      }}
                    />
                  ) : null}
                  {showEndPicker && Platform.OS === "ios" ? (
                    <PrimaryButton label="Done" muted onPress={() => setShowEndPicker(false)} />
                  ) : null}

                  <Text style={[type.caption, { color: colors.muted }]}>
                    {nights > 0
                      ? `${nights} night${nights === 1 ? "" : "s"}${dailyRatePaise != null ? ` · ${rupees(dailyRatePaise * nights)} total` : ""}`
                      : "Choose a checkout date after the start date."}
                  </Text>
                </>
              ) : null}

              <PrimaryButton label="Review" onPress={goToReview} />
            </Card>
          ) : null}
        </>
      ) : null}

      {step === "review" ? (
        <Card>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>
            Review before creating
          </Text>
          <OverviewBox
            rows={[
              { label: isDaily ? "Guest" : "Tenant", value: tenantName.trim() || lookup?.fullName || phone.trim() },
              { label: "Phone", value: phone.trim(), mono: true },
              // The register entry itself, reviewed before it is written. There
              // is no deed behind a guest stay, so this screen is the last look
              // the owner gets at what their record will say.
              ...(isDaily
                ? [
                    { label: "Age", value: guestAge.trim() || "-" },
                    { label: "Gender", value: tenantGender ? GENDER_LABELS[tenantGender] : "-" },
                    { label: "Email", value: tenantEmail.trim() || "Not given" },
                  ]
                : []),
              { label: "Type", value: isDaily ? "Daily" : "Monthly" },
              { label: "Property", value: selectedProperty?.name ?? "-" },
              { label: "Room", value: selectedRoom ? `Room ${selectedRoom.roomNumber}` : "-" },
              ...(isDaily
                ? [
                    { label: "Daily rate", value: dailyRatePaise != null ? rupees(dailyRatePaise) : "-", mono: true },
                    { label: "Start date", value: formatDateLong(startDate) },
                    { label: "Checkout date", value: formatDateLong(plannedEndDate) },
                    { label: "Nights", value: String(nights) },
                    { label: "Estimated total", value: dailyRatePaise != null ? rupees(dailyRatePaise * nights) : "-", mono: true },
                  ]
                : [
                    { label: "Rent / month", value: rupees(Math.round(Number(rent) * 100)), mono: true },
                    { label: "Deposit", value: rupees(Math.round(Number(deposit || "0") * 100)), mono: true },
                    { label: "Start date", value: formatDateLong(startDate) },
                  ]),
            ]}
          />
          {!isDaily ? (
            <Text style={[type.caption, { color: colors.muted }]}>
              Every monthly tenancy needs an accepted agreement. The tenancy stays pending until the
              tenant accepts.
            </Text>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            {/* Which document, then its last four. Never Aadhaar by default: a
                private landlord cannot require it, so the tenant's choice is
                what gets recorded. */}
            {/* Single choice, so the single picker: it commits on tap and has
                no tick column, which on a one-of-six field only marked the row
                the sheet was about to close over anyway. */}
            <SingleOptionPicker<IdDocumentType>
              emptyLabel="Select the ID you checked"
              error={form.errors.idDocumentType}
              label="Government photo ID"
              onChange={(picked) => {
                setIdDocumentType(picked);
                form.clearField("idDocumentType");
              }}
              options={ID_DOCUMENT_OPTIONS}
              required
              showIcon={false}
              value={idDocumentType}
            />

            <Field error={form.errors.idLastFour} label="Last four digits">
              <Input
                invalid={Boolean(form.errors.idLastFour)}
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={(value) => {
                  setIdLastFour(value.replace(/[^0-9]/g, ""));
                  form.clearField("idLastFour");
                }}
                placeholder="4417"
                value={idLastFour}
              />
            </Field>

          </View>

          {withAgreement ? (
            <PrimaryButton
              disabled={!idCheckConfirmed}
              label="Continue to agreement"
              onPress={() => {
                if (idCheckMissing()) return;
                setStep("agreement");
              }}
            />
          ) : (
            <PrimaryButton
              busy={onboardState.isLoading}
              disabled={!idCheckConfirmed}
              label="Confirm and create tenancy"
              onPress={handleConfirm}
            />
          )}

          {/* Under the button it gates. The header's own back arrow already
              steps to the previous screen, so a second Back here was a third
              control doing what two others do. */}
          <ClickwrapConsent
            checked={idCheckConfirmed}
            onToggle={() => setIdCheckConfirmed((value) => !value)}
            statement={idStatement}
          />
        </Card>
      ) : null}

      {/* A wall, not a warning. The deed names the property owner as Landlord, so
          until their profile can carry one there is nothing on this step worth
          filling in — and the endpoint would refuse it anyway. */}
      {step === "agreement" && gateBlocked && readinessQuery.data ? (
        <OnboardingGateBoard
          onOpenProfile={() => router.push("/account-settings")}
          readiness={readinessQuery.data}
        />
      ) : null}

      {step === "agreement" && !gateBlocked ? (
        <>
          {/* No card behind the heading. The deed inside Preview is already a
              bordered surface of its own, so wrapping this in another one put a
              card inside a card and gave the page two competing edges. */}
          <View style={{ gap: spacing.sm }}>
            {/* The screen's subject, set as one. This step is where the legal
                document is settled, and an 11px upper-case eyebrow gave it the
                same weight as the word "Room" two screens earlier. */}
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.2 }}>
              Tenancy agreement
            </Text>
            <Text style={[type.body, { color: colors.muted, fontSize: 13, lineHeight: 19 }]}>
              These are the exact terms this tenant will accept. The term and the clauses below apply to this
              tenancy only — they do not change the property's standard agreement.
            </Text>
          </View>

          {/* Open by default. This is the document being issued, and an owner
              creating a tenancy without having seen it is the one outcome this
              step exists to prevent. */}
          <CollapsibleSection defaultOpen summary="The tenant's agreement" title="Preview">
            {previewQuery.isFetching && !previewQuery.data ? <ActivityIndicator color={colors.primary} /> : null}
            {previewQuery.data ? (
              <AgreementDocument
                clauses={previewQuery.data.clauses}
                preamble={previewQuery.data.preamble}
              />
            ) : null}
          </CollapsibleSection>

          {/* Choosing clauses is a TENANCY_RULES power, but creating a tenancy is
              TENANCY_CREATE — a manager can hold one without the other. They still
              see the deed above; they just cannot change which clauses it carries,
              and the server falls back to the property's template for them rather
              than refusing the request. */}
          {template && !clausesReadOnly ? (
            <CollapsibleSection summary={clauseCountLabel} title="Clauses">
              <AgreementTemplateEditor
                clauses={mainClauses}
                miscOptions={miscQuery.data ?? []}
                onChange={setTemplate}
                template={template}
              />
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection summary={termSummary} title="Agreement Term">
            {/* The same segmented control the agreement settings screen uses.
                Two ChoiceButtons here made the identical decision look like a
                different kind of control depending on which screen you reached
                it from. */}
            <SegmentedChoice
              onChange={(value) => {
                if (value === "FIXED") {
                  setFixedTerm(true);
                  setTermMonths((current) => current ?? 11);
                  return;
                }
                setFixedTerm(false);
                setTermMonths(null);
              }}
              options={[
                { label: "Indefinite", value: "INDEFINITE" },
                { label: "Fixed term", value: "FIXED" },
              ]}
              value={fixedTerm ? "FIXED" : "INDEFINITE"}
            />

            {fixedTerm ? (
              <>
                <Field label="Length (months)">
                  <Input
                    keyboardType="number-pad"
                    onChangeText={(text) => {
                      const parsed = Number(text.replace(/[^0-9]/g, ""));
                      setTermMonths(parsed > 0 ? Math.min(parsed, 12) : null);
                    }}
                    placeholder="11"
                    value={termMonths != null ? String(termMonths) : ""}
                  />
                </Field>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  Min 1, max 12 months. A fixed term ends the tenancy on its last day.
                </Text>
              </>
            ) : (
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                Runs until either side serves notice. Leaving without serving it is what the early-exit clause
                charges for.
              </Text>
            )}
          </CollapsibleSection>


          {/* Measured, not guessed. PINNED_FOOTER_CLEARANCE assumes the tall
              faded footer; this one has no runway and carries a note, so its
              height is its own business — reading it back is the only way the
              two stay in step. */}
          <View style={{ height: footerHeight || PINNED_FOOTER_CLEARANCE }} />
        </>
      ) : null}

      {step === "done" && result ? (
        <Card>
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.successSoft,
                borderRadius: 999,
                height: 56,
                justifyContent: "center",
                width: 56,
              }}
            >
              <Check color={colors.successText} size={28} strokeWidth={2.4} />
            </View>
            {/* The outcome, then its status, then what happens next — three
                statements on three lines. They were one run-on sentence held
                together by two dashes, which put "awaiting acceptance" and a
                three-day deadline in the same breath as the good news. */}
            <Text style={[type.bodyStrong, { color: colors.ink, textAlign: "center" }]}>
              {result.tenantAccountCreated ? "Tenant account and tenancy created" : "Tenancy created"}
            </Text>

            {result.tenancy.status === "PENDING_ACCEPTANCE" ? (
              <>
                <Text
                  style={{
                    color: colors.accent,
                    fontFamily: fonts.sansSemiBold,
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  Awaiting acceptance
                </Text>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18, textAlign: "center" }]}>
                  The bed is reserved. The tenancy and billing start once the tenant accepts the
                  agreement in their app. Pending tenancies auto-cancel after 3 days.
                </Text>
              </>
            ) : null}
          </View>
          <OverviewBox
            rows={[
              { label: "Tenancy", value: result.tenancy.referenceCode, mono: true },
              { label: "Type", value: result.tenancy.billingType === "DAILY" ? "Daily" : "Monthly" },
              ...(result.tenancy.billingType === "DAILY"
                ? [
                    { label: "Daily rate", value: rupees(result.tenancy.dailyRatePaise ?? 0), mono: true },
                    { label: "Start date", value: result.tenancy.startDate },
                    { label: "Checkout date", value: result.tenancy.plannedEndDate ?? "-" },
                  ]
                : [
                    { label: "Rent / month", value: rupees(result.tenancy.rentAmountPaise ?? 0), mono: true },
                    { label: "Deposit", value: rupees(result.tenancy.depositAmountPaise ?? 0), mono: true },
                    { label: "Start date", value: result.tenancy.startDate },
                  ]),
            ]}
          />
          {result.tenantAccountCreated ? (
            <Text style={[type.body, { color: colors.muted, fontSize: 13 }]}>
              The tenant can now sign up with this phone number to set their PIN.
            </Text>
          ) : null}
          {/* Said plainly, because it changes what the owner has to do next.
              Nothing reaches this guest through the app, so bills, reminders
              and anything they raise are handled by you in person. */}
          {result.tenancy.guestStay ? (
            <Text style={[type.body, { color: colors.muted, fontSize: 13 }]}>
              No account was created and the guest is not sent anything. Raise the bill and mark it
              paid here, and handle anything else with them directly.
            </Text>
          ) : null}
          <PrimaryButton label="Done" onPress={() => router.back()} />
        </Card>
      ) : null}


      {confirmExit ? (
        <ConfirmDialog
          confirmLabel="Discard"
          destructive
          message="Nothing entered so far will be saved, and no tenancy will be created."
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => {
            setConfirmExit(false);
            router.back();
          }}
          title="Leave onboarding?"
        />
      ) : null}

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
    </ScreenScrollView>

      {/* Pinned rather than scrolled to. It is the one action of this step, and
          on a long agreement it was several clauses below the fold — PinnedFooter
          also handles the system bar inset, which a button inside the scroll
          view never did. */}
      {step === "agreement" ? (
        <PinnedFooter
          fade={false}
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          {/* ActionButton, the same one every other pinned footer uses. The
              local PrimaryButton drops to opacity 0.65 when disabled, which
              inside a footer lets the page scroll visibly through it — the
              shared button says disabled with colour and keeps a border, and
              its shadow and radius match the rest of the app. */}
          <ActionButton
            disabled={onboardWithAgreementState.isLoading}
            label={onboardWithAgreementState.isLoading ? "Creating…" : "Create tenancy"}
            onPress={() => void handleConfirmWithAgreement()}
          />

          {/* Under the button, because it describes what pressing it does. The
              tenancy does not begin here — it waits, and somebody expecting a
              live stay would go looking for one. */}
          <View
            style={{
              alignItems: "flex-start",
              flexDirection: "row",
              gap: spacing.sm,
              marginTop: spacing.sm,
            }}
          >
            <Info color={colors.muted} size={14} strokeWidth={2.2} style={{ marginTop: 2 }} />
            <Text style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 17 }]}>
              Sent to the tenant&apos;s account for acceptance. The tenancy and its billing start
              only once they accept.
            </Text>
          </View>
        </PinnedFooter>
      ) : null}
    </View>
  );
}

/**
 * Who is staying, for a daily guest who gets no account.
 *
 * <p>Deliberately not the lookup card. There is no phone lookup behind this and
 * nothing said about whether an account already exists, because none is created
 * either way — somebody staying two nights has no reason to install an app, set
 * a PIN and keep a login they will never open again. What this collects is the
 * register a hotel desk keeps.
 *
 * <p>So the fields differ from the tenant form on purpose. Age replaces date of
 * birth, because a register records what it was told at the desk rather than
 * tracking a birthday. There is no PIN code, because nothing here is posted to
 * anyone. And age and gender are REQUIRED where an agreement leaves them
 * optional: this declaration is the whole of the owner's record of who they let
 * the room to, and there is no signed deed standing behind it.
 */
function GuestStayCard({
  address,
  addressError,
  age,
  ageError,
  blocked,
  email,
  emailError,
  gender,
  genderError,
  name,
  nameError,
  onAddress,
  onAge,
  onChangeName,
  onContinue,
  onEmail,
  onGender,
  onPhone,
  phone,
  phoneError,
}: {
  address: string;
  addressError?: string;
  age: string;
  ageError?: string;
  /** True while any field on this card is in error. */
  blocked: boolean;
  email: string;
  emailError?: string;
  gender: Gender | null;
  genderError?: string;
  name: string;
  nameError?: string;
  onAddress: (value: string) => void;
  onAge: (value: string) => void;
  onChangeName: (value: string) => void;
  onContinue: () => void;
  onEmail: (value: string) => void;
  onGender: (value: Gender | null) => void;
  onPhone: (value: string) => void;
  phone: string;
  phoneError?: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {/* Outlined, never filled — the app's icon rule. */}
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
          <UserPlus color={colors.ink} size={21} strokeWidth={2} />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
            {name.trim() || "Guest details"}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            Recorded for this stay only
          </Text>
        </View>
      </View>

      <NoticeBar
        message="A daily stay is managed entirely by you, so no account is created and the guest is not sent anything. Take these details as you would at a front desk."
        title="No account is created"
        tone="info"
      />

      <Field error={nameError} label="Guest name">
        <Input
          autoCapitalize="words"
          invalid={Boolean(nameError)}
          onChangeText={onChangeName}
          placeholder="Full name as on their ID"
          value={name}
        />
      </Field>

      {/* The same phone field the rest of the app uses, flag and fixed +91 and
          all. It is a contact number here rather than the key to an account,
          but it is still the same question, so it looks like the same question. */}
      <PhoneField error={phoneError} label="Phone number" onChangeText={onPhone} value={phone} />

      {/* Asked for plainly, not tucked behind "optional details". Whether it is
          worth taking is the owner's call at the desk, and a walk-in often has
          no reason to give one. */}
      <Field error={emailError} label="Email address">
        <Input
          autoCapitalize="none"
          invalid={Boolean(emailError)}
          keyboardType="email-address"
          onChangeText={onEmail}
          placeholder="Optional"
          value={email}
        />
      </Field>

      <Field error={addressError} label="Address">
        <Input
          invalid={Boolean(addressError)}
          multiline
          onChangeText={onAddress}
          placeholder="Enter full address"
          value={address}
        />
      </Field>

      <Field error={ageError} label="Age">
        <Input
          invalid={Boolean(ageError)}
          keyboardType="number-pad"
          maxLength={3}
          onChangeText={onAge}
          placeholder="Enter age"
          value={age}
        />
      </Field>

      {/* No Field wrapper: GenderPicker draws its own label, and nesting it in
          one printed "Gender" twice. Only the error message is added here. */}
      <View style={{ gap: 6 }}>
        <GenderPicker onChange={onGender} value={gender} />
        {genderError ? (
          <Text style={[type.caption, { color: colors.danger }]}>{genderError}</Text>
        ) : null}
      </View>

      {/* Held until every blamed field is corrected, per the form-error
          contract — otherwise the same invalid details can be fired at the next
          step repeatedly, each time producing the identical set of messages. */}
      <PrimaryButton disabled={blocked} label="Continue" onPress={onContinue} />
    </Card>
  );
}

/**
 * The lookup's answer, as a card about a person.
 *
 * <p>Three states in one shape: somebody we already know, somebody new, or
 * somebody who cannot be onboarded at all. Keeping them in one card rather than
 * three keeps the eye in the same place while the answer changes.
 */
function LookupResultCard({
  address,
  addressError,
  blocked,
  canOnboard,
  dob,
  exists,
  existingName,
  gender,
  message,
  name,
  nameError,
  onAddress,
  onChangeName,
  onContinue,
  onDob,
  onGender,
  onPincode,
  onToggleOptional,
  optionalOpen,
  phone,
  pincode,
  pincodeError,
  prefill,
}: {
  address: string;
  /** True while any field on this card is in error. */
  blocked: boolean;
  addressError?: string;
  canOnboard: boolean;
  dob: string;
  exists: boolean;
  existingName: string | null;
  gender: Gender | null;
  message: string;
  name: string;
  nameError?: string;
  onAddress: (value: string) => void;
  onChangeName: (value: string) => void;
  onContinue: () => void;
  onDob: (value: string) => void;
  onGender: (value: Gender | null) => void;
  onPincode: (value: string) => void;
  onToggleOptional: () => void;
  optionalOpen: boolean;
  phone: string;
  pincode: string;
  pincodeError?: string;
  prefill: TenantPrefill | null;
}) {
  const { colors, fonts, type } = useTheme();

  /** A field the account already holds is shown, but not editable here. */
  const held = (value: string | null | undefined) => Boolean(value && value.trim());

  // An account we already hold owns its own name. Letting the owner retype it
  // here would fork the person's identity across two records and leave the
  // agreement disagreeing with the account it belongs to.
  const nameLocked = exists && Boolean(existingName);
  const displayName = nameLocked ? existingName! : name;


  // Three outcomes, three headings. The notice says what KIND of person this
  // is; the message underneath says what that means for onboarding them.
  const noticeTitle = !canOnboard
      ? "Cannot be onboarded"
      : exists
        ? "Existing Khatiyan account"
        : "New tenant — no account yet";

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {/* Outlined, never filled — the app's icon rule. The glyph says which
            KIND of person this is; the pill beside it says whether they can be
            onboarded, which is a different question. */}
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
          {exists ? (
            <UserRound color={colors.ink} size={21} strokeWidth={2} />
          ) : (
            <UserPlus color={colors.ink} size={21} strokeWidth={2} />
          )}
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}
          >
            {displayName.trim() || "New tenant"}
          </Text>
          {/* The number is marked as a number. On its own under a name it read
              as a second line of the name rather than as how to reach them. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Phone color={colors.muted} size={13} strokeWidth={2.2} />
            <Text style={[type.caption, { color: colors.muted }]}>
              {phone}
            </Text>
          </View>
        </View>
      </View>

      {/* The app's standing notice rather than a strip of this screen's own.
          Same status mark and tone rule as the toast, so a precaution here
          reads in the same voice as feedback everywhere else. */}
      <NoticeBar
        message={message}
        title={noticeTitle}
        tone={!canOnboard ? "danger" : exists ? "success" : "info"}
      />

      {canOnboard ? (
        <Field error={nameError} label="Tenant name">
          {nameLocked ? (
            <LockedValue value={existingName!} />
          ) : (
            <Input
              autoCapitalize="words"
              invalid={Boolean(nameError)}
              onChangeText={onChangeName}
              placeholder="Full name as on their ID"
              value={name}
            />
          )}
        </Field>
      ) : null}

      {canOnboard && !nameLocked && !nameError ? (
        <Text style={[type.caption, { color: colors.kicker }]}>
          This name goes on the agreement, so enter it as it appears on the ID you check.
        </Text>
      ) : null}
      {canOnboard && nameLocked ? (
        <Text style={[type.caption, { color: colors.kicker }]}>
          Taken from their existing account and cannot be changed here.
        </Text>
      ) : null}

      {/* The rest of who this person is, in the same card as their name — it is
          one act, not two. Fields their account already holds render locked; the
          server writes back only the blanks, so the lock is the rule rather than
          a courtesy. */}
      {canOnboard ? (
        <>

          <NoticeBar
            message="Updates about this agreement are sent to the phone number above."
            title="Where updates go"
            tone="info"
          />

          <Field error={addressError} label="Full permanent address">
            <Input
              editable={!held(prefill?.permanentAddress)}
              invalid={Boolean(addressError)}
              multiline
              onChangeText={onAddress}
              placeholder="Enter full address"
              value={address}
            />
          </Field>

          <Field error={pincodeError} label="PIN code">
            <Input
              editable={!held(prefill?.permanentAddressPincode)}
              invalid={Boolean(pincodeError)}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(text) => onPincode(text.replace(/[^0-9]/g, ""))}
              placeholder="Enter PIN code"
              value={pincode}
            />
          </Field>

          {/* Collapsed by default. Age and gender are genuinely optional — the
              deed omits them when blank — and two fields nobody has to answer
              should not be the last thing standing between an owner and the
              Continue button. */}
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ expanded: optionalOpen }}
            onPress={onToggleOptional}
            style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.xs }}
          >
            {/* The icon is SWAPPED, not rotated. A transform on a lucide icon
                goes to an SVG that does not forward style, so a rotated chevron
                silently stays pointing down. */}
            {optionalOpen ? (
              <ChevronUp color={colors.primary} size={17} strokeWidth={2.4} />
            ) : (
              <ChevronDown color={colors.primary} size={17} strokeWidth={2.4} />
            )}
            <Text style={{ color: colors.primary, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
              {optionalOpen ? "Hide optional details" : "Add optional details (Age, Gender)"}
            </Text>
          </AnimatedPressable>

          {optionalOpen ? (
            <>
              <DateOfBirthField disabled={held(prefill?.dateOfBirth)} onChange={onDob} value={dob} />
              <GenderPicker onChange={prefill?.gender ? () => {} : onGender} value={gender} />
            </>
          ) : null}
        </>
      ) : null}

      {/* Held until every blamed field is corrected, per the form-error
          contract — otherwise the same invalid details can be fired at the next
          step repeatedly, each time producing the identical set of messages. */}
      {canOnboard ? <PrimaryButton disabled={blocked} label="Continue" onPress={onContinue} /> : null}
    </Card>
  );
}

/**
 * The property this tenancy will belong to.
 *
 * <p>Not a table of label/value rows. The property is the setting for
 * everything that follows and reads better as an identity — name, where it is,
 * and the two figures that will shape the bill — than as three lines of data
 * with the name given no more weight than the pincode.
 */
function PropertySummary({ property }: { property: OwnerProperty }) {
  const { colors, fonts, type } = useTheme();
  const location = [property.city, property.state, property.pincode].filter(Boolean).join(", ");

  return (
    <View style={{ gap: spacing.md }}>
      {/* No icon. The card sits alone on the step and there is nothing to tell
          it apart FROM — a badge beside the name would be decoration doing the
          work of a label that is not needed. The name carries it. */}
      <View style={{ gap: 4 }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>Property</Text>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.2 }}>
          {property.name}
        </Text>
        {location ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
            <MapPin color={colors.kicker} size={12} strokeWidth={2.2} />
            <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flex: 1 }]}>
              {location}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Wallet color={colors.inkSoft} size={16} strokeWidth={2.2} />
        <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>Standard deposit</Text>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {rupees(property.standardDepositPaise)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Floors first, rooms inside one, and neither once a room is chosen.
 *
 * <p>A flat list of every room made the reader scan a property's whole
 * inventory to find one floor, and it stayed that long after the choice was
 * made — pushing rent and dates, the fields they came here to fill, below the
 * fold. Choosing collapses the picker to a single line, which is all a settled
 * decision needs.
 */
function RoomPicker({
  onClear,
  onSelect,
  priceOf,
  rooms,
  selectedRoomId,
  unavailable,
}: {
  /** Reopens the picker on the floor the current room is on. */
  onClear: () => void;
  onSelect: (room: OwnerRoom) => void;
  priceOf: (room: OwnerRoom) => string;
  rooms: OwnerRoom[];
  selectedRoomId: string | null;
  unavailable: (room: OwnerRoom) => boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [openFloor, setOpenFloor] = useState<string | null>(null);

  const floors = useMemo(() => {
    const grouped = new Map<string, OwnerRoom[]>();
    for (const room of rooms) {
      // A room with no floor recorded is not a room on no floor; it is one
      // nobody labelled. Grouping them together beats scattering them.
      const key = room.floor?.trim() || "Unassigned";
      const bucket = grouped.get(key) ?? [];
      bucket.push(room);
      grouped.set(key, bucket);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  }, [rooms]);

  const selected = rooms.find((room) => room.id === selectedRoomId) ?? null;

  if (selected) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderBottomColor: colors.jade,
          borderBottomWidth: 3,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          padding: spacing.md,
        }}
      >
        <DoorOpen color={colors.ink} size={19} strokeWidth={2} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15.5 }}>
            Room {selected.roomNumber}
          </Text>
          <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
            {selected.floor?.trim() || "Unassigned floor"} · {priceOf(selected)}
          </Text>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            setOpenFloor(selected.floor?.trim() || "Unassigned");
            onClear();
          }}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.sansSemiBold, fontSize: 13 }}>Change</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {floors.map(([floor, floorRooms]) => {
        const open = openFloor === floor;
        const free = floorRooms.filter((room) => !unavailable(room)).length;

        return (
          <View key={floor} style={{ gap: spacing.sm }}>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => setOpenFloor(open ? null : floor)}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderCurve: "continuous",
                borderRadius: 12,
                borderWidth: 1,
                flexDirection: "row",
                gap: spacing.sm,
                padding: spacing.md,
              }}
            >
              <Hotel color={colors.inkSoft} size={18} strokeWidth={2.1} />
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 15 }}>
                {floor}
              </Text>
              <Text style={[type.caption, { color: free > 0 ? colors.muted : colors.kicker }]}>
                {free > 0 ? `${free} free` : "Full"}
              </Text>
              {open ? (
                <ChevronDown color={colors.kicker} size={18} strokeWidth={2.2} />
              ) : (
                <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} />
              )}
            </AnimatedPressable>

            {open
              ? floorRooms.map((room) => (
                  <View key={room.id} style={{ paddingLeft: spacing.md }}>
                    <SelectRow
                      disabled={unavailable(room)}
                      onPress={() => onSelect(room)}
                      selected={false}
                      subtitle={`${priceOf(room)} · ${
                        room.availableVacancies > 0 ? `${room.availableVacancies} vacancy` : "Full"
                      }`}
                      title={`Room ${room.roomNumber}`}
                    />
                  </View>
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * A value the account already holds, shown but not editable here.
 *
 * <p>An owner filling in an onboarding form is not editing somebody else's
 * profile, and the server writes back only the blanks — so the lock is the rule
 * rather than a courtesy. It has to LOOK locked to say so: a plain input with
 * {@code editable={false}} is indistinguishable from one waiting to be filled.
 */
/**
 * One part of the agreement step, opened when it is wanted.
 *
 * <p>The step used to be three stacked cards, all expanded: a full deed, a
 * clause editor and the term, which put a very long scroll between arriving and
 * the button at the bottom. Collapsed, the step is a short list of the three
 * things that can be settled here.
 *
 * <p>Headed like every other section in the app — the serif title over the
 * ruled margin, with the summary as an editorial note beside its own rule. A
 * collapsible built from its own heading style would have read as a widget
 * dropped into the page rather than as part of it.
 *
 * <p>The rule and the summary SWAP. Closed, the section is a row in a list and
 * the summary says what it holds — the term especially, since an owner who
 * never opens it is accepting a default, and a heading alone would let them do
 * that without ever seeing which default. Open, the content answers that
 * question better than the summary could, so the summary goes and the ruled
 * margin takes its place: a line under a heading with a section beneath it,
 * which is the letterhead detail doing its actual job.
 */
function CollapsibleSection({
  children,
  defaultOpen,
  summary,
  title,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  summary?: string;
  title: string;
}) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(Boolean(defaultOpen));

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 21, lineHeight: 26 }]}>
            {title}
          </Text>
          {/* Swapped, never rotated. A transform on a lucide icon goes to an SVG
              that does not forward style, so a rotated chevron stays pointing
              down. */}
          {open ? (
            <ChevronUp color={colors.muted} size={18} strokeWidth={2.2} />
          ) : (
            <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
          )}
        </View>

        {open ? (
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.sm,
              marginTop: spacing.xxs,
            }}
          >
            <View style={{ backgroundColor: colors.accent, borderRadius: 2, height: 2.5, width: 24 }} />
            <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1, opacity: 0.5 }} />
          </View>
        ) : null}

        {!open && summary ? <HeaderNote>{summary}</HeaderNote> : null}
      </AnimatedPressable>

      {open ? (
        <View
          style={{
            gap: spacing.md,
            paddingBottom: spacing.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xs,
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

function LockedValue({ value }: { value: string }) {
  const { colors, fonts } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderCurve: "continuous",
        borderRadius: 12,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 13,
      }}
    >
      <Lock color={colors.muted} size={15} strokeWidth={2.2} />
      <Text style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 }}>
        {value}
      </Text>
    </View>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  /** Shown beneath the input, where the correction has to be made. */
  error?: string;
  label: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {/* type.label, matching FormInput everywhere else. It used to be the
          eyebrow, which is upper-case and belongs to section headings — so
          every input on this screen shouted its name while the same field on
          the property form did not. */}
      <Text style={[type.label, { color: error ? colors.danger : colors.inkSoft }]}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text style={[type.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Input({
  invalid,
  prefix,
  ...props
}: React.ComponentProps<typeof TextInput> & { invalid?: boolean; prefix?: string }) {
  const { colors, fonts } = useTheme();
  // The border does the pointing. A message on its own leaves the reader
  // scanning a form to work out which box it is about, and this screen has
  // several on a step.
  const edge = invalid ? colors.danger : colors.border;
  // A locked field has to LOOK locked — editable={false} alone still reads as a
  // field you can type into, which invites a tap that does nothing.
  const locked = props.editable === false;
  if (prefix) {
    // Adornment (e.g. ₹) rendered inside the field: the container owns the
    // border and the input goes borderless beside the prefix.
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: edge,
          borderRadius: 10,
          borderWidth: invalid ? 1.5 : 1,
          flexDirection: "row",
          paddingLeft: spacing.md,
        }}
      >
        <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 15, }}>
          {prefix}
        </Text>
        <AppTextInput
          {...props}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
          style={{
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.sans,
            fontSize: 15,
            padding: spacing.md,
            paddingLeft: spacing.xs,
          }}
        />
      </View>
    );
  }
  return (
    <AppTextInput
      {...props}
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={colors.muted}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: edge,
        borderRadius: 10,
        borderWidth: invalid ? 1.5 : 1,
        color: locked ? colors.inkSoft : colors.ink,
        fontFamily: fonts.sans,
        fontSize: 15,
        opacity: locked ? 0.7 : 1,
        padding: spacing.md,
      }}
    />
  );
}

function SelectRow({
  title,
  subtitle,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        // Selection is a weighted rule along the bottom, grey until chosen and
        // jade once it is — the same language the dashboard snapshots use. It
        // was a pale blue wash, which is banned as a fill and cost the subtitle
        // most of its contrast.
        borderBottomColor: selected ? colors.jade : colors.border,
        borderBottomWidth: 3,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "space-between",
        opacity: disabled ? 0.5 : 1,
        padding: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15.5 }}>
          {title}
        </Text>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
          {subtitle}
        </Text>
      </View>
      {/* No tick. The rule underneath already says which one is chosen, and a
          mark that appears only on the selected row made the other one look
          disabled. The chevron stays because both rows still go somewhere. */}
      <ChevronRight color={colors.kicker} size={18} />
    </AnimatedPressable>
  );
}

type OverviewRowData = { label: string; value: string; mono?: boolean };

function OverviewBox({ rows }: { rows: OverviewRowData[] }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: spacing.md, opacity: 0.8 }} /> : null}
          <OverviewRow label={row.label} value={row.value} mono={row.mono} />
        </View>
      ))}
    </View>
  );
}

function OverviewRow({ label, value, mono }: OverviewRowData) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]}>
        {label}
      </Text>
      <Text
        style={[
          type.body,
          { color: colors.ink, flex: 1, fontFamily: mono ? fonts.mono : fonts.sans, fontWeight: "800", textAlign: "right" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}




function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  muted,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  muted?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const foreground = disabled ? colors.muted : muted ? colors.primary : colors.onPrimary;
  return (
    <AnimatedPressable
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={busy || disabled ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled && !muted ? colors.surfaceRaised : muted ? "transparent" : colors.primary,
        // A disabled button needs an edge. Filled, it reads as a button that is
        // simply pale; outlined, it reads as one that is waiting for something.
        borderColor: disabled || muted ? colors.borderStrong : "transparent",
        borderRadius: 12,
        borderWidth: disabled || muted ? 1 : 0,
        justifyContent: "center",
        minHeight: 50,
        opacity: disabled ? 0.65 : 1,
        paddingHorizontal: spacing.lg,
      }}
    >
      {busy ? (
        <ActivityIndicator color={muted ? colors.primary : colors.onPrimary} />
      ) : (
        <Text style={{ color: foreground, fontFamily: fonts.sansBold, fontSize: 14, }}>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function HeaderButton({
  icon: Icon,
  label,
  onPress,
  subtle,
}: {
  icon: typeof ArrowLeft;
  label?: string;
  onPress: () => void;
  /**
   * A small grey disc instead of an outlined box.
   *
   * <p>Both header controls use it. They sit at the same height either side of
   * the title and are read as a pair, so giving one an outlined box and the
   * other a disc made the header look like it had two unrelated buttons in it.
   */
  subtle?: boolean;
}) {
  const { colors, fonts } = useTheme();

  if (subtle) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        hitSlop={10}
        onPress={onPress}
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: 28,
          justifyContent: "center",
          width: 28,
        }}
      >
        <Icon color={colors.inkSoft} size={15} strokeWidth={2.4} />
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        justifyContent: "center",
        paddingHorizontal: label ? spacing.sm : 0,
        width: label ? undefined : 36,
      }}
    >
      <Icon color={colors.ink} size={16} strokeWidth={2.2} />
      {label ? (
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, }}>
          {label}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId);
  }

  return properties.length === 1 ? properties[0] : undefined;
}

