import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ComponentType } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, BackHandler, Image, Modal, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { deviceFingerprint, primeInstallId } from "@/auth/device-fingerprint";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ArrowLeft, BadgeCheck, BedDouble, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp, CircleHelp, CircleX, ClipboardList, Clock3, DoorOpen, Expand, FileCheck, Hotel, Info, KeyRound, Lock, type LucideProps, MapPin, Phone, Plus, ScanFace, ShieldCheck, UserCheck, UserPlus, UserRound, Wallet, X } from "lucide-react-native";
import { DeleteIcon as Trash2 } from "@/components/delete-icon";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SegmentedChoice } from "@/components/segmented-choice";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { AlertModal } from "@/components/alert-modal";
import { SingleOptionPicker } from "@/components/option-picker";
import { AgreementMonthDropdown } from "@/components/agreement-month-dropdown";
import { agreementTermIssue, dateOfBirthIssue, identityErrors, monthlyAmountErrors } from "@/features/compliance/onboarding-validation";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { StepProgress } from "@/components/step-progress";
import { PinnedWizardHeader, usePinnedWizardHeader } from "@/components/pinned-wizard-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { api } from "@/store/api";
import {
  OwnerOnboardingPropertySkeleton,
  OwnerOnboardingRoomsSkeleton,
  OwnerStayTypeOptionsSkeleton,
} from "@/components/skeletons/owner";
import { ConfirmDialog, NoticeBar } from "@/features/owner/owner-ui";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { PhoneField } from "@/features/auth/auth-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { StatusIcon } from "@/components/status-icon";
import { DateOfBirthField } from "@/features/account/date-of-birth-field";
import { istToday } from "@/features/analytics/period";
import { emailProblem } from "@/features/forms/email-validation";
import { GENDER_LABELS, GenderPicker } from "@/features/account/gender-picker";
import { ClickwrapConsent } from "@/features/compliance/clickwrap-consent";
import {
  MAX_ATTEMPTS,
  MIN_ATTEMPTS,
  VerificationOrderSummary,
  VerificationServicePicker,
  orderTotalPaise,
  orderedServices,
  type VerificationOrder,
  type VerificationServiceKey,
} from "@/features/compliance/verification-services";
import { formatFloor } from "@/features/property/floor";
import { AgreementTemplateEditor } from "@/features/compliance/agreement-template-editor";
import { OnboardingGateBoard } from "@/features/compliance/onboarding-gate-board";
import { ActionButton, FormInput, formatMoneyPaise, IconButton, RequiredMark } from "@/features/owner/owner-ui";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { ChevronDisc } from "@/components/chevron-disc";
import { SheetShell } from "@/components/sheet-shell";
import { BookingConfirmedIcon } from "@/components/booking-vector-icons";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearAgreementPreview, showAgreementPreview } from "@/store/slices/agreement-preview-slice";
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
  useListPropertyUpcomingVacanciesQuery,
  useOnboardDailyStayMutation,
  type TenancyOnboardingResult,
  type TenantLookup,
  type TenantPrefill,
} from "@/store/services/tenancy-api";
import {
  useGetPropertyExitPoliciesQuery,
  useListMyPropertiesQuery,
  useListPropertyRoomsQuery,
  type DamageLevel,
  type OwnerProperty,
  type OwnerRoom,
} from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";
import { useConvertBookingMutation, useGetPropertyBookingRequestQuery } from "@/store/services/booking-api";
import { useOnboardExistingTenantMutation } from "@/store/services/compliance-api";
import { MultiImageField } from "@/features/uploads/multi-image-field";
import { Lightbox } from "@/components/image-carousel";
import { AMENITY_LABELS } from "@/features/property/amenity-picker";
import { DamageLevelDropdown } from "@/features/tenancy/damage-level";
import { ItemIcon } from "@/features/property/item-icon";

type Step = "type" | "tenant" | "details" | "verify" | "handover" | "review" | "agreement" | "done";
/** One line of the move-in checklist while it is filled in. */
/** Each item carries its own 1 to 3 photos (user, 2026-10-29). */
/**
 * Room: basic things and anything added by hand, removable. Amenities: the
 * room's own, not removable. Bathroom: things in an attached bathroom.
 */
type MoveInSection = "ROOM" | "AMENITY" | "BATHROOM";
/** `fixed`: one of the room's own amenities, which stays on the list. */
type MoveInItem = { name: string; damageLevel: DamageLevel; note: string; custom: boolean; photoUrls: string[]; section: MoveInSection; fixed: boolean };


type IdDocumentType = "AADHAAR" | "PASSPORT" | "DRIVING_LICENCE" | "VOTER_ID" | "PAN" | "OTHER";

/**
 * The wizard as a person experiences it: five things to do, then a result.
 *
 * <p>"done" is deliberately absent from the count. It is the outcome rather
 * than a sixth task, and including it would leave the bar short of full on the
 * screen that says the work is finished.
 */
const STEP_ORDER: Step[] = ["type", "tenant", "details", "verify", "handover", "review", "agreement"];
/** From a booking the kind is already monthly, so the wizard starts at the tenant (user, 2026-10-28). */
const BOOKING_STEP_ORDER: Step[] = ["tenant", "details", "verify", "handover", "review", "agreement"];
/** A daily guest has no move-in checklist: a register entry, not a handover. */
const DAILY_STEP_ORDER: Step[] = ["type", "tenant", "details", "verify", "review", "agreement"];

const STEP_TITLE: Record<Step, string> = {
  agreement: "Agreement",
  details: "Room and dates",
  verify: "Verify tenant",
  handover: "Move in & move out",
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
  handover: "verify",
  review: "handover",
  tenant: "type",
  verify: "details",
};

/**
 * How the tenant's identity was established.
 *
 * <p>Two routes to the same fact, and the tenancy records which was used. The
 * manual one is the owner's own declaration, which is where the legal duty
 * actually sits. The digital one is a check somebody else carried out, which is
 * only worth more than the declaration because nobody involved could fake it.
 */
type VerificationMode = "MANUAL" | "KYC";

/** How a room is cooled, in the room picker. */
function conditioningLabel(room: OwnerRoom): string {
  return room.conditioning === "AC" ? "AC" : "Non-AC";
}

/** What an ID check can record. Undeclared is an answer an account may give, not one a check can. */
const ID_CHECK_GENDERS: Gender[] = ["MALE", "FEMALE", "TRANSGENDER", "OTHER"];

/**
 * Why a date of birth cannot pass a manual check: missing, or under 18 on
 * `today` (IST). The server makes the same check and has the last word.
 */
const ID_DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function adultDobIssue(dob: string, today: string): string | null {
  return dateOfBirthIssue(dob, today);
}


type BillingKind = "MONTHLY" | "DAILY";

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateFromStr(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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
    | "guestDob"
    | "guestGender"
    | "idDocumentType"
    | "idLastFour"
    | "idGender"
    | "idDob"
    | "rent"
    | "deposit"
    | "verification"
    | "movedInOn"
    | "dues"
  >();

  const router = useRouter();
  const dispatch = useAppDispatch();
  // Onboarding a confirmed booking (user, 2026-10-28): the same wizard, with
  // what the booking agreed locked. The room, the rent, the deposit, the term
  // and the person are the booking's. The room can only change, from the
  // booking's own card, when the booked bed is not free on the move-in day.
  const params = useLocalSearchParams<{ bookingId?: string; propertyId?: string }>();
  const bookingId = typeof params.bookingId === "string" && params.bookingId ? params.bookingId : null;
  // The booking's property, named by the screen that opened this, so the flow never rests on Home's choice.
  const bookingPropertyId = bookingId && typeof params.propertyId === "string" && params.propertyId ? params.propertyId : null;
  const fromBooking = bookingId !== null;
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
  const [step, setStep] = useState<Step>(fromBooking ? "tenant" : "type");
  useEffect(() => {
    if (step !== "agreement") dispatch(clearAgreementPreview());
  }, [dispatch, step]);
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
  const beforeStatementQuery = useGetLegalStatementQuery("EXISTING_TENANT_VERIFIED_DECLARATION");
  const beforeStatement = beforeStatementQuery.data?.text ?? "";

  /** The IDs a tenant may produce. Aadhaar is one of them, never the default. */
  const ID_DOCUMENT_OPTIONS = [
    { label: "Aadhaar", value: "AADHAAR" as const },
    { label: "Passport", value: "PASSPORT" as const },
    { label: "Driving licence", value: "DRIVING_LICENCE" as const },
    { label: "Voter ID", value: "VOTER_ID" as const },
    { label: "PAN", value: "PAN" as const },
    { label: "Other", value: "OTHER" as const },
  ];
  // From a booking the tenant step is the first: Back from it leaves.

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
  // A daily stay has no move-in checklist, so Back from its review goes to Verify.
  const previousStep = fromBooking && step === "tenant" ? null
    : step === "review" && billingType === "DAILY" ? "verify"
    : PREVIOUS_STEP[step] ?? null;
  // Existing-tenant onboarding (P1.1, 2026-10-28): someone already living here,
  // brought onto Khatiyan from their next bill. A monthly stay that keeps when
  // they moved in, the deposit already held, what they owed at the switch, and
  // either their paper agreement (its photos) or a Khatiyan deed to sign.
  const [existingTenant, setExistingTenant] = useState(false);
  const [movedInOn, setMovedInOn] = useState<Date | null>(null);
  const [showMovedInPicker, setShowMovedInPicker] = useState(false);
  const [dues, setDues] = useState("");
  const [duesNote, setDuesNote] = useState("");
  const [agreementKind, setAgreementKind] = useState<"PAPER" | "IN_APP" | null>(null);
  const [paperPhotos, setPaperPhotos] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<TenantLookup | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [carryOverHelp, setCarryOverHelp] = useState(false);
  const [agreementHelp, setAgreementHelp] = useState(false);
  const [startDate, setStartDate] = useState<Date>(startOfToday());
  const [plannedEndDate, setPlannedEndDate] = useState<Date>(addDays(startOfToday(), 1));
  const [showPicker, setShowPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [result, setResult] = useState<TenancyOnboardingResult | null>(null);
  const [bookedForFuture, setBookedForFuture] = useState(false);
  // Agreement path: SELECTIVE properties opt in per tenancy; ALL_MONTHLY always
  // goes through the agreement step. Custom clauses are editable on that step.
  // The owner's declaration. Khatiyan verifies nothing — this records that they
  // did, which is where the legal duty actually sits.
  const [idCheckConfirmed, setIdCheckConfirmed] = useState(false);
  // An existing tenant's first choice on the verify step (user, 2026-10-28):
  // verified before Khatiyan, declared with a tick, or verified now by one of
  // the two ordinary routes.
  const [existingRoute, setExistingRoute] = useState<"BEFORE" | "NOW" | null>(null);
  const [verifiedBeforeConfirmed, setVerifiedBeforeConfirmed] = useState(false);
  // The move-in checklist (user, 2026-10-29): optional, between Verify and
  // Review. Items start from the room's amenities and the property's damage
  // list, each with a damage level; 1 to 10 photos are required once it is filled in.
  const [moveInItems, setMoveInItems] = useState<MoveInItem[] | null>(null);
  // A photo opened full size from an item on the checklist.
  const [moveInLightbox, setMoveInLightbox] = useState<{ images: string[]; index: number } | null>(null);
  // 1 by default (user, 2026-10-29): every tenant gets at least one key.
  const [keysHandedOver, setKeysHandedOver] = useState("1");
  const [moveInSkipped, setMoveInSkipped] = useState(false);
  // What is being typed to add, per section: every section but Amenities takes its own (user, 2026-10-29).
  // The Add sheet: which section it adds to, and the name typed (user, 2026-10-29).
  const [addingTo, setAddingTo] = useState<MoveInSection | null>(null);
  const [newItemName, setNewItemName] = useState("");
  // The item whose removal is being confirmed.
  const [removingItem, setRemovingItem] = useState<number | null>(null);
  const [moveInHelp, setMoveInHelp] = useState(false);
  // This stay's own move-out checklist, set here and printed on its deed (user, 2026-10-29).
  const [moveOutItems, setMoveOutItems] = useState<string[]>(["Keys returned", "Dues cleared", "Final inspection completed"]);
  const [addingMoveOut, setAddingMoveOut] = useState(false);
  const [newMoveOutItem, setNewMoveOutItem] = useState("");

  // Which route the owner took, and how far a digital check has got.
  //
  // Null until they choose: presenting one as preselected would make the other
  // look like the unusual thing to do, and for most owners today the manual
  // check is still the ordinary one.
  const [chosenVerificationMode, setVerificationMode] = useState<VerificationMode | null>(null);
  // What the owner has ordered for this tenancy, and how many attempts each
  // check gets. The owner never sees an Aadhaar number or an OTP: they choose
  // the checks, the tenant does them from their own phone.
  const [verificationOrder, setVerificationOrder] = useState<VerificationOrder>({});

  function toggleVerificationService(key: VerificationServiceKey) {
    setVerificationOrder((current) => {
      const next = { ...current };
      if ((next[key] ?? 0) > 0) {
        delete next[key];
        return next;
      }
      next[key] = MIN_ATTEMPTS;
      return next;
    });
  }

  function setVerificationAttempts(key: VerificationServiceKey, attempts: number) {
    setVerificationOrder((current) => ({
      ...current,
      [key]: Math.min(Math.max(attempts, MIN_ATTEMPTS), MAX_ATTEMPTS),
    }));
  }

  const orderedVerificationServices = orderedServices(verificationOrder);
  // What this costs IF the tenant uses every attempt. Nothing is set aside:
  // Khatiyan pays the provider, and the owner's balance is charged per attempt
  // as it is used, so unused attempts cost nothing by construction.
  const verificationMaxPaise = orderTotalPaise(verificationOrder);

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

  // What the owner confirms at a manual ID check on a MONTHLY stay (owner's
  // rule, 2026-09-27): gender, and the date of birth the 18+ check is made
  // against. Each starts as whatever the tenant step holds and stays editable
  // here. Undefined means "not edited", so a value typed on the tenant step
  // after a visit here still carries over. A daily guest has no copy: the
  // guest form already requires gender and date of birth, and the check
  // edits those in place.
  const [idGenderEdit, setIdGenderEdit] = useState<Gender | null | undefined>(undefined);
  const [idDobEdit, setIdDobEdit] = useState<string | undefined>(undefined);

  // A daily guest's date of birth lives in tenantDob too (owner's rule,
  // 2026-09-27): the guest form asks for it instead of an age, and the manual
  // check shows it and makes the 18+ check against it.

  const isDaily = billingType === "DAILY";
  // A daily guest has no account, so nobody could ever run a KYC check: the
  // register takes the owner's own check and nothing else (owner's rule,
  // 2026-09-27). Derived rather than stored, so no path can leave it on KYC.
  const verificationMode: VerificationMode | null = isDaily ? "MANUAL" : chosenVerificationMode;
  // Manual: the deed and the account take what the owner checked.
  const manualCheck = verificationMode === "MANUAL";
  const verifiedBefore = existingTenant && existingRoute === "BEFORE";
  const goBackStep = useCallback(() => {
    if (step === "verify" && !isDaily && verificationMode !== null) {
      setVerificationMode(null);
      form.clearAll();
    } else if (step === "verify" && existingTenant && existingRoute !== null) {
      setExistingRoute(null);
    } else if (previousStep) {
      setStep(previousStep);
    }
  }, [step, isDaily, verificationMode, existingTenant, existingRoute, previousStep, form.clearAll]);

  useFocusEffect(useCallback(() => {
    if (!previousStep) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBackStep();
      return true;
    });
    return () => subscription.remove();
  }, [goBackStep, previousStep]));
  const [triggerLookup, lookupState] = useLazyLookupTenantQuery();
  // What an existing Khatiyan account already holds. Those are not the
  // owner's to change (owner's rule, 2026-09-27): the check shows them
  // read-only, and only a new account, or a field the account left blank, is
  // entered here. An Undeclared gender counts as blank, since a check must
  // record one. The server refuses a declaration that differs from these.
  // Read from the screen's own copy of the lookup, the one the tenant step
  // uses, not the query hook's: that one is dropped by a reload.
  const prefillGender = isDaily ? null : lookup?.prefill?.gender ?? null;
  const accountGender = prefillGender === "UNDECLARED" ? null : prefillGender;
  const accountDob = isDaily ? null : lookup?.prefill?.dateOfBirth || null;
  const idGender = isDaily
    ? tenantGender
    : accountGender ?? (idGenderEdit === undefined ? tenantGender : idGenderEdit);
  const idDob = isDaily ? tenantDob : accountDob ?? (idDobEdit === undefined ? tenantDob : idDobEdit);

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
    () => resolveSelectedProperty(properties, bookingPropertyId ?? selectedPropertyId),
    [properties, bookingPropertyId, selectedPropertyId],
  );
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const rooms = roomsQuery.data ?? [];
  const upcomingVacanciesQuery = useListPropertyUpcomingVacanciesQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty || step === "type" || step === "tenant" || step === "done",
  });
  // The server decides which full-room beds can be booked ahead: an approved
  // room change, or a stay certain to end soon. The same rule checks the
  // booking, so a room offered here is never refused on submit. Earliest per room.
  const upcomingRoomVacancies = useMemo(() => {
    const dates = new Map<string, string>();
    for (const vacancy of upcomingVacanciesQuery.data ?? []) {
      const current = dates.get(vacancy.roomId);
      if (!current || vacancy.availableFrom < current) {
        dates.set(vacancy.roomId, vacancy.availableFrom);
      }
    }
    return dates;
  }, [upcomingVacanciesQuery.data]);
  // Rooms under maintenance cannot take a new tenancy, so keep them out of the
  // selectable list entirely.
  const selectableRooms = useMemo(() => rooms.filter((room) => room.status !== "MAINTENANCE"), [rooms]);
  const selectedRoom = useMemo<OwnerRoom | undefined>(
    () => rooms.find((room) => room.id === roomId),
    [roomId, rooms],
  );
  // The move-in checklist starts from the room's amenities and the property's
  // damage list, without repeats, every item at NA (2026-10-29).
  const exitPoliciesQuery = useGetPropertyExitPoliciesQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  useEffect(() => {
    if (step !== "handover" || moveInItems !== null || exitPoliciesQuery.isLoading) return;
    // Only what the room's type picked (user, 2026-10-29), sorted into Room and
    // Bathroom by the damage list, the one list of what a room can have. AC is
    // the variant; the toilet is never an item; a common toilet's things are
    // not one tenant's, so they stay off.
    const attached = selectedProperty?.bathroomType === "ATTACHED";
    const categoryOf = new Map((exitPoliciesQuery.data?.damageCharges ?? []).map((charge) => [charge.name.toLowerCase(), charge.category]));
    const seen = new Set<string>();
    const items: MoveInItem[] = [];
    const add = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      const category = categoryOf.get(key) ?? (key === "geyser" ? (attached ? "BATHROOM" : "COMMON_TOILET") : "ROOM");
      if (category === "COMMON_TOILET") return;
      if (category === "BATHROOM" && !attached) return;
      seen.add(key);
      items.push({ custom: false, damageLevel: "NA", fixed: true, name: name.trim(), note: "", photoUrls: [], section: category === "BATHROOM" ? "BATHROOM" : "ROOM" });
    };
    // The variant's own thing: AC, or a fan on a non-AC room (user, 2026-10-29).
    if (selectedRoom) add(selectedRoom.conditioning === "AC" ? "AC" : "Fan");
    (selectedRoom?.amenities ?? []).forEach((amenity) => {
      if (amenity === "ATTACHED_TOILET" || amenity === "COMMON_TOILET") return;
      add(AMENITY_LABELS[amenity]);
    });
    (selectedRoom?.customAmenities ?? []).forEach(add);
    setMoveInItems(items);
  }, [exitPoliciesQuery.data, exitPoliciesQuery.isLoading, moveInItems, selectedProperty, selectedRoom, step]);
  // Sent only when filled in: skipped, or not yet complete, nothing is recorded.
  // Every item needs at least one photo before the step can go on (user, 2026-10-29).
  // Keys at least 1, every item a photo, every damage described (user, 2026-10-29).
  const moveInReady = Boolean(
    moveInItems && moveInItems.length > 0
      && moveInItems.every((item) => item.photoUrls.length > 0 && (item.damageLevel === "NA" || item.note.trim()))
      && Number(keysHandedOver) >= 1,
  );
  const moveInPayload = billingType !== "DAILY" && !moveInSkipped && moveInItems && moveInReady
    ? {
        items: moveInItems.map((item) => ({
          custom: item.custom,
          damageLevel: item.damageLevel,
          name: item.name,
          note: item.damageLevel === "NA" || !item.note.trim() ? null : item.note.trim(),
          photoUrls: item.photoUrls,
          section: item.section,
        })),
        keysHandedOver: keysHandedOver ? Number(keysHandedOver) : null,
      }
    : null;
  // What each level means at this property, for the ⓘ beside every dropdown.
  const levelWords = exitPoliciesQuery.data?.damageLevels ?? [
    { description: "No damage", level: "NA" as const },
    { description: "Light wear. Cleaning or a small fix", level: "D1" as const },
    { description: "Damaged. Needs repair", level: "D2" as const },
    { description: "Broken or missing. Must be replaced", level: "D3" as const },
  ];
  // Never for an existing tenant: they live here now, so their bed must be free now.
  const selectedRoomAvailableFrom = !existingTenant && selectedRoom && selectedRoom.availableVacancies <= 0
    ? upcomingRoomVacancies.get(selectedRoom.id) ?? null
    : null;
  const minimumStartDate = selectedRoomAvailableFrom ? dateFromStr(selectedRoomAvailableFrom) : startOfToday();
  const [onboardDailyStay, onboardState] = useOnboardDailyStayMutation();
  const [convertBooking, convertState] = useConvertBookingMutation();
  const [onboardExisting, onboardExistingState] = useOnboardExistingTenantMutation();
  const bookingQuery = useGetPropertyBookingRequestQuery(
    { propertyId: selectedProperty?.id ?? "", requestId: bookingId ?? "" },
    { skip: !fromBooking || !selectedProperty },
  );
  const booking = fromBooking ? bookingQuery.currentData ?? bookingQuery.data ?? null : null;
  const [bookingSeeded, setBookingSeeded] = useState(false);
  // The booking can no longer be onboarded: closing the refusal leaves the wizard.
  const [bookingGone, setBookingGone] = useState(false);
  // Everything the booking agreed, poured in once. The account lookup runs on
  // the booking's own number, so the address it holds comes with it.
  useEffect(() => {
    if (!booking || bookingSeeded) return;
    setBookingSeeded(true);
    setBillingType("MONTHLY");
    setPhone(booking.tenantPhone);
    setTenantName(booking.tenantName);
    setTenantEmail(booking.tenantEmail ?? "");
    setTenantGender(booking.tenantGender);
    setTenantDob(booking.tenantDateOfBirth);
    setRoomId(booking.roomId);
    setRent(String(Math.round((booking.agreedRentPaise ?? booking.currentRentPaise) / 100)));
    setDeposit(String(Math.round(booking.depositPaise / 100)));
    // They are moving in now: the stay starts today, whatever day was booked.
    setStartDate(startOfToday());
    void triggerLookup({ phone: booking.tenantPhone, propertyId: booking.propertyId }).unwrap()
      .then((found) => setLookup(found))
      .catch((caught: unknown) => setMessage(errorText(caught)));
  }, [booking, bookingSeeded]);
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
  // The booking agreed the room, the money and the term, never the deed: its clauses are
  // edited here as on any onboarding (user, 2026-10-28).
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
  // An existing tenant's paper agreement names no landlord, so the profile gate
  // only stands in front of a Khatiyan deed: their step shows the choice first.
  const paperChosen = existingTenant && agreementKind === "PAPER";
  const agreementGateBlocked = gateBlocked && !existingTenant;
  /** The term picker: always, except an existing tenant who has not chosen yet. */
  const showTerm = !existingTenant || agreementKind !== null;
  /** The deed's clauses: not on paper, and not before an existing tenant has chosen. */
  const showDeed = !existingTenant || (agreementKind === "IN_APP" && !gateBlocked);

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
  // From a booking the term is the one it agreed, not the property's default.
  useEffect(() => {
    if (!booking || !template) return;
    setFixedTerm(booking.agreementMonths != null);
    setTermMonths(booking.agreementMonths);
  }, [booking, template]);

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
        dateOfBirth: (manualCheck ? idDob : tenantDob).trim() || null,
        fullName: tenantName.trim() || null,
        gender: manualCheck ? idGender : tenantGender,
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

  // Both the deed and the clause editor hang off the property's stored template,
  // so one failed read blanks both halves of this step. Say so rather than
  // rendering two empty sections.
  const agreementUnavailable =
    withAgreement
    && !previewQuery.data
    && !previewQuery.isFetching
    && !settingsQuery.isFetching
    && (settingsQuery.isError
      || previewQuery.isError
      // Answered, but with nothing to seed the deed from. Checked against the
      // response rather than the seeded state, which is still null for the one
      // frame between the settings arriving and the effect copying them.
      || (settingsQuery.isSuccess && !settingsQuery.data?.template));

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
    // An existing tenant's deposit is what the owner holds, not the room's.
    if (!existingTenant) setDeposit("");
  }

  function selectRoom(room: OwnerRoom) {
    setRoomId(room.id);
    setRent(String(Math.round(room.baseRentPaise / 100)));
    const availableFrom = room.availableVacancies <= 0 ? upcomingRoomVacancies.get(room.id) : null;
    if (availableFrom && dateToStr(startDate) < availableFrom) {
      const earliest = dateFromStr(availableFrom);
      setStartDate(earliest);
      setPlannedEndDate((current) => dateToStr(current) <= availableFrom ? addDays(earliest, 1) : current);
    }
    // An existing tenant's deposit is typed, never taken from the property
    // policy: part of it may already have been used before Khatiyan.
    if (selectedProperty && !existingTenant) {
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
   * <p>DOB and gender can be supplied later on the manual-check step. The
   * eKYC route leaves them optional until the tenant completes verification.
   */
  function goToRoomAndDates() {
    if (!tenantDetailsValid()) return;
    setMessage(null);
    setStep("details");
  }

  function tenantDetailsValid(): boolean {
    if (isDaily) return guestDetailsValid();
    if (!phoneValid || !lookup?.canOnboard) {
      setMessage("Look up a valid tenant phone number before continuing.");
      return false;
    }
    // Required on this step for every monthly tenant, existing ones too
    // (user, 2026-10-29). It was optional here for an existing tenant and only
    // demanded at Create tenancy when a deed was chosen, two steps too late.
    const cleared = form.validate({
      ...(tenantName.trim() && tenantName.trim().length <= 120 ? {} : { tenantName: "Enter the tenant's full name (up to 120 characters)." }),
      ...(tenantAddress.trim() && tenantAddress.trim().length <= 300 ? {} : { tenantAddress: "Enter the tenant's permanent address (up to 300 characters)." }),
      ...(/^\d{6}$/.test(tenantPincode.trim()) ? {} : { tenantPincode: "Enter a 6-digit PIN code." }),
    });
    return cleared;
  }

  /**
   * Leaves the tenant step for a DAILY stay.
   *
   * <p>A different set of fields, because a different thing is being recorded.
   * There is no PIN code — a guest register requires a date of birth
   * and a gender, because this declaration is the
   * whole of the owner's record of who they let the room to.
   *
   * <p>Email is the exception. A walk-in often has no reason to give one, so it
   * is asked for plainly and accepted blank.
   */
  function goToRoomAndDatesForGuest() {
    if (!guestDetailsValid()) return;
    setMessage(null);
    setStep("details");
  }

  function guestDetailsValid(): boolean {
    const dobIssue = adultDobIssue(tenantDob, istToday());
    // Null blank message: a walk-in may have no email, but a typo is still a typo.
    const emailIssue = emailProblem(tenantEmail, null);
    const cleared = form.validate({
      ...(tenantName.trim() ? {} : { tenantName: "Enter the guest's full name as it appears on their ID." }),
      // The same rule the account path uses. This was bare-digits-only, so the
      // one field in the app that refused a +91 was the one under a +91 flag.
      ...(/^(\+91)?\d{10}$/.test(phone.trim()) ? {} : { guestPhone: "Enter a 10-digit phone number." }),
      ...(emailIssue ? { tenantEmail: emailIssue } : {}),
      ...(tenantAddress.trim() ? {} : { tenantAddress: "Enter the guest's address." }),
      ...(dobIssue ? { guestDob: dobIssue.replace("The tenant", "The guest") } : {}),
      ...(tenantGender && tenantGender !== "UNDECLARED" ? {} : { guestGender: "Select the guest's gender." }),
    });
    return cleared;
  }

  function chooseBilling(kind: BillingKind, existing = false) {
    setMessage(null);
    // Whoever was being entered is cleared when the KIND changes, not on every
    // tap. A monthly lookup prefills name, email, address and PIN from the
    // account it found, and those were still sitting in state when the owner
    // went back and picked Daily — so a guest register opened pre-filled with a
    // different person's details. Re-picking the same kind leaves the form
    // alone, because going Back and choosing again is not a decision to discard
    // what you already typed.
    if (billingType !== null && (billingType !== kind || existing !== existingTenant)) {
      setLookup(null);
      setPhone("");
      setTenantName("");
      setTenantEmail("");
      setTenantAddress("");
      setTenantPincode("");
      setTenantDob("");
      setTenantGender(null);
      setIdGenderEdit(undefined);
      setIdDobEdit(undefined);
      form.clearAll();
    }
    setBillingType(kind);
    setExistingTenant(existing);
    if (!existing) {
      setMovedInOn(null);
      setDues("");
      setDuesNote("");
      setAgreementKind(null);
      setPaperPhotos([]);
    }
    setExistingRoute(null);
    setVerifiedBeforeConfirmed(false);
    setMoveInItems(null);
    setKeysHandedOver("1");
    setMoveInSkipped(false);
    // Reset room-derived inputs so a switch between kinds starts clean.
    setRoomId(null);
    setRent("");
    setDeposit("");
    setStartDate(startOfToday());
    setStep("tenant");
  }

  function goToReview() {
    if (!tenantDetailsValid()) {
      setStep("tenant");
      return;
    }
    if (!roomAndDatesValid()) return;
    setStep("verify");
  }

  function roomAndDatesValid(): boolean {
    setMessage(null);
    // The booking holds its bed, so the room shows no vacancy of its own. The
    // server checks the bed is free before it creates anything.
    if (fromBooking) {
      if (!selectedProperty || !booking || !roomId) {
        setMessage("The booking has not loaded yet. Try again in a moment.");
        return false;
      }
      return true;
    }
    if (!selectedProperty || !selectedRoom) {
      setMessage("Select a property on Home and choose a room.");
      return false;
    }
    if (selectedRoom.status === "MAINTENANCE") {
      setMessage("This room is under maintenance and cannot take a tenancy.");
      return false;
    }
    if (selectedRoom.availableVacancies <= 0 && (isDaily || !selectedRoomAvailableFrom)) {
      setMessage("This room has no available vacancy.");
      return false;
    }
    if (selectedRoomAvailableFrom && dateToStr(startDate) < selectedRoomAvailableFrom) {
      setMessage(`This room becomes available on ${formatDateLong(minimumStartDate)}. Choose that date or later.`);
      return false;
    }
    if (!Number.isFinite(startDate.getTime()) || dateToStr(startDate) < istToday()) {
      setMessage("Start date must be today or a future date.");
      return false;
    }
    if (isDaily) {
      if (dailyRatePaise == null) {
        setMessage("This room type has no daily rate configured.");
        return false;
      }
      if (!Number.isFinite(nights) || nights < 1 || nights > 29) {
        setMessage("Daily stay must be between 1 and 29 nights.");
        return false;
      }
    } else if (existingTenant) {
      // The deposit held now is typed by the owner, and may be none at all.
      const { deposit: depositIssue, ...amountErrors } = monthlyAmountErrors(rent, deposit);
      const noDeposit = /^0+(\.0{1,2})?$/.test(deposit.trim());
      const duesIssue = dues.trim() && !(/^\d+(\.\d{1,2})?$/.test(dues.trim()) && Number(dues) > 0)
        ? "Enter the dues in rupees, or leave it empty."
        : null;
      const movedInIssue = !movedInOn
        ? "Pick the day they moved in."
        : dateToStr(movedInOn) > istToday() || dateToStr(movedInOn) >= dateToStr(startDate)
          ? "They moved in before the first Khatiyan bill, on a day already past."
          : null;
      if (!form.validate({
        ...amountErrors,
        ...(!deposit.trim()
          ? { deposit: "Enter the deposit you hold for them now, 0 if none." }
          : depositIssue && !noDeposit ? { deposit: "Enter the deposit you hold for them now, 0 if none." } : {}),
        ...(movedInIssue ? { movedInOn: movedInIssue } : {}),
        ...(duesIssue ? { dues: duesIssue } : {}),
      })) {
        return false;
      }
      if (dateToStr(startDate) > dateToStr(addDays(startOfToday(), 31))) {
        setMessage("The first Khatiyan bill must be on their next rent day, within a month from today.");
        return false;
      }
    } else if (!form.validate(monthlyAmountErrors(rent, deposit))) {
      return false;
    }
    return true;
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
    if (verifiedBefore) {
      if (!beforeStatement.trim()) {
        setMessage("The declaration has not loaded. Try again before continuing.");
        return true;
      }
      if (!verifiedBeforeConfirmed) {
        setMessage("Read the declaration and tick it before continuing.");
        return true;
      }
      return false;
    }
    if (existingTenant && existingRoute === null) {
      setMessage("Choose whether they were verified before or are verified now.");
      return true;
    }
    const errors = identityErrors({
      mode: verificationMode,
      dob: idDob,
      gender: idGender,
      documentType: idDocumentType,
      lastFour: idLastFour,
      verificationAttempts: orderedVerificationServices.map((service) => verificationOrder[service.key] ?? 0),
      today: istToday(),
    });
    if (!form.validate(errors)) {
      if (errors.verification) setMessage(errors.verification);
      return true;
    }
    if (verificationMode === "KYC") {
      return false;
    }
    if (!idStatement.trim()) {
      setMessage("The ID declaration has not loaded. Try again before continuing.");
      return true;
    }
    if (!idCheckConfirmed) {
      setMessage("Read the declaration and tick it before continuing.");
      return true;
    }
    return false;
  }

  // Recheck prior steps at review and submit, including a changed verification route.
  function priorStepsValid(): boolean {
    if (!billingType) {
      setStep("type");
      setMessage("Select a kind of tenancy.");
      return false;
    }
    if (!tenantDetailsValid()) {
      setStep("tenant");
      return false;
    }
    if (!roomAndDatesValid()) {
      setStep("details");
      return false;
    }
    if (idCheckMissing()) {
      setStep("verify");
      return false;
    }
    return true;
  }

  /**
   * Two routes, and the request carries exactly one.
   *
   * <p>An owner either declares they checked an ID themselves, or orders
   * checks the TENANT will run. The stand-in that used to send a fake
   * declaration on the digital route is gone: the owner declares nothing there,
   * because the tenant has not done anything yet, and the server now refuses a
   * request that carries both or neither.
   */
  const manualIdCheck = {
    confirmed: idCheckConfirmed,
    dateOfBirth: idDob.trim() || null,
    documentType: idDocumentType,
    gender: idGender,
    lastFour: idLastFour,
  };
  const idCheckPayload = verificationMode === "KYC" || verifiedBefore ? null : manualIdCheck;

  /** What the owner ordered, priced and charged per attempt the tenant uses. */
  const verificationPayload =
    verificationMode === "KYC"
      ? orderedVerificationServices.map((service) => ({
          attempts: verificationOrder[service.key] ?? 1,
          serviceCode: service.key,
        }))
      : null;

  /**
   * Books the daily stay. The only path that reaches this — a monthly tenancy
   * goes through handleConfirmWithAgreement, because it has an agreement to be
   * accepted before it starts.
   */
  async function handleConfirm() {
    if (!priorStepsValid() || !selectedProperty || !roomId) return;
    setMessage(null);
    try {
      const res = await onboardDailyStay({
        guestAddress: tenantAddress.trim(),
        guestDateOfBirth: tenantDob.trim(),
        // Sent as null rather than "" when skipped, so the server stores an
        // absent email instead of an empty one.
        guestEmail: tenantEmail.trim() ? tenantEmail.trim() : null,
        // The gender the owner checked is the register's record of the guest.
        guestGender: idGender!,
        guestName: tenantName.trim(),
        guestPhone: phone.trim(),
        // A guest stay has no account, so nobody could ever run a check on
        // themselves. The daily path is the manual route and only that.
        idCheck: manualIdCheck,
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

  /**
   * Onboards a booking (user, 2026-10-28). Only what a booking does not hold is
   * sent: the ID check or the ordered checks, the address the agreement names
   * them by, and the early-exit rule. The stay is built from what was agreed.
   */
  async function handleConvertBooking() {
    if (!priorStepsValid() || !selectedProperty || !booking) return;
    setMessage(null);
    if (!template || !previewQuery.data || previewQuery.isFetching || previewQuery.isError || readinessQuery.isFetching
      || !readinessQuery.data?.landlordReady) {
      setMessage("Wait for the agreement to load successfully before onboarding.");
      return;
    }
    try {
      const res = await convertBooking({
        body: {
          device: deviceFingerprint(),
          earlyExitRule: earlyExitRule.trim() ? earlyExitRule : null,
          idCheck: idCheckPayload,
          idCheckStatementText: idCheckPayload ? idStatement : null,
          tenant: {
            dateOfBirth: (manualCheck ? idDob : tenantDob).trim() || null,
            gender: manualCheck ? idGender : tenantGender,
            permanentAddress: tenantAddress.trim(),
            permanentAddressPincode: tenantPincode.trim(),
          },
          // The clauses as edited here, the same as any onboarding sends them.
          template,
          verification: verificationPayload,
          moveInChecklist: moveInPayload,
          moveOutChecklist: billingType === "DAILY" ? null : moveOutItems,
        },
        propertyId: selectedProperty.id,
        requestId: booking.id,
        version: booking.version,
      }).unwrap();
      setBookedForFuture(false);
      setResult({ tenancy: res.stay.tenancy, tenantAccountCreated: res.stay.tenantAccountCreated });
      setStep("done");
    } catch (e) {
      // Onboarded or closed elsewhere meanwhile, on another device (user, 2026-10-28): the refusal
      // says so, and its OK leaves, since there is nothing left to onboard here. Read before the
      // refusal shows, so OK never closes it a moment too early to know.
      const fresh = await bookingQuery.refetch().then((read) => read.data ?? null).catch(() => null);
      if (fresh && !fresh.allowedMoveInActions.includes("CONVERT")) {
        setBookingGone(true);
        // The list it goes back to drops the booking too.
        dispatch(api.util.invalidateTags(["Booking"]));
      }
      setMessage(errorText(e));
    }
  }

  /**
   * An existing tenant onto Khatiyan (P1.1, 2026-10-28). On their paper
   * agreement the stay starts now. On a Khatiyan deed it waits for them to
   * sign, as any onboarding does. Either way the server keeps when they moved
   * in, opens the deposit already held and raises the dues at the switch.
   */
  async function handleOnboardExisting() {
    if (!priorStepsValid() || !selectedProperty || !roomId || !movedInOn) return;
    setMessage(null);
    if (!agreementKind) {
      setMessage("Choose how their agreement carries over.");
      return;
    }
    const onPaper = agreementKind === "PAPER";
    if (onPaper && paperPhotos.length === 0) {
      setMessage("Add their paper agreement, as photos or a PDF.");
      return;
    }
    const termIssue = agreementTermIssue(fixedTerm, termMonths);
    if (termIssue) {
      setMessage(termIssue);
      return;
    }
    const hasAddress = Boolean(tenantAddress.trim()) && /^\d{6}$/.test(tenantPincode.trim());
    if (!onPaper && !hasAddress) {
      setStep("tenant");
      form.validate({
        ...(tenantAddress.trim() ? {} : { tenantAddress: "A Khatiyan agreement names them by their permanent address." }),
        ...(/^\d{6}$/.test(tenantPincode.trim()) ? {} : { tenantPincode: "Enter a 6-digit PIN code." }),
      });
      return;
    }
    if (!onPaper && (!template || !previewQuery.data || previewQuery.isFetching || settingsQuery.isFetching
      || previewQuery.isError || settingsQuery.isError || readinessQuery.isFetching
      || !readinessQuery.data?.landlordReady)) {
      setMessage("Wait for the agreement to load successfully before creating the tenancy.");
      return;
    }
    try {
      const res = await onboardExisting({
        agreement: agreementKind,
        depositHeldPaise: Math.round(Number(deposit || "0") * 100),
        device: deviceFingerprint(),
        firstBillOn: dateToStr(startDate),
        idCheck: idCheckPayload,
        idCheckStatementText: idCheckPayload ? idStatement : null,
        verifiedBefore: verifiedBefore || null,
        verifiedBeforeStatementText: verifiedBefore ? beforeStatement : null,
        movedInOn: dateToStr(movedInOn),
        openingDuesNote: dues.trim() && duesNote.trim() ? duesNote.trim() : null,
        openingDuesPaise: dues.trim() ? Math.round(Number(dues) * 100) : null,
        paperAgreementPhotoUrls: onPaper ? paperPhotos : null,
        propertyId: selectedProperty.id,
        rentAmountPaise: Math.round(Number(rent) * 100),
        roomId,
        template: onPaper ? null : template,
        // On paper they may fill this in themselves: only sent once it is complete.
        tenant: hasAddress
          ? {
              dateOfBirth: (manualCheck ? idDob : tenantDob).trim() || null,
              gender: manualCheck ? idGender : tenantGender,
              permanentAddress: tenantAddress.trim(),
              permanentAddressPincode: tenantPincode.trim(),
            }
          : null,
        tenantName: tenantName.trim() ? tenantName.trim() : null,
        tenantPhone: phone.trim(),
        term: { earlyExitRule: earlyExitRule.trim() ? earlyExitRule : null, months: fixedTerm ? termMonths : null },
        verification: verificationPayload,
          moveInChecklist: moveInPayload,
          moveOutChecklist: billingType === "DAILY" ? null : moveOutItems,
      }).unwrap();
      setBookedForFuture(false);
      setResult({ tenancy: res.tenancy, tenantAccountCreated: res.tenantAccountCreated });
      setStep("done");
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  async function handleConfirmWithAgreement() {
    if (!priorStepsValid() || !selectedProperty || !roomId) return;
    setMessage(null);
    const termIssue = agreementTermIssue(fixedTerm, termMonths);
    if (termIssue) {
      setMessage(termIssue);
      return;
    }
    if (!template || !previewQuery.data || previewQuery.isFetching || settingsQuery.isFetching
      || previewQuery.isError || settingsQuery.isError || readinessQuery.isFetching
      || !readinessQuery.data?.landlordReady) {
      setMessage("Wait for the agreement to load successfully before creating the tenancy.");
      return;
    }
    try {
      const res = await onboardWithAgreement({
        template,
        tenant: {
          dateOfBirth: (manualCheck ? idDob : tenantDob).trim() || null,
          gender: manualCheck ? idGender : tenantGender,
          permanentAddress: tenantAddress.trim(),
          permanentAddressPincode: tenantPincode.trim(),
        },
        term: { earlyExitRule, months: fixedTerm ? termMonths : null },
        depositAmountPaise: Math.round(Number(deposit || "0") * 100),
        propertyId: selectedProperty.id,
        rentAmountPaise: Math.round(Number(rent) * 100),
        roomId,
        startDate: dateToStr(startDate),
        idCheck: idCheckPayload,
        // Only with a declaration. On the other route there is no statement to
        // send, because nobody made one.
        idCheckStatementText: idCheckPayload ? idStatement : null,
        verification: verificationPayload,
          moveInChecklist: moveInPayload,
          moveOutChecklist: billingType === "DAILY" ? null : moveOutItems,
        device: deviceFingerprint(),
        tenantName: tenantName.trim() ? tenantName.trim() : null,
        tenantPhone: phone.trim(),
      }).unwrap();
      setBookedForFuture(Boolean(selectedRoomAvailableFrom));
      setResult({ tenancy: res.tenancy, tenantAccountCreated: res.tenantAccountCreated });
      setStep("done");
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  const wizardHeader = usePinnedWizardHeader();
  const stepOrder = fromBooking ? BOOKING_STEP_ORDER : isDaily ? DAILY_STEP_ORDER : STEP_ORDER;
  const stepIndex = stepOrder.indexOf(step);
  const onDone = step === "done";
  const tenantStepCanContinue = isDaily || Boolean(lookup?.canOnboard);
  const hasStandardFooter =
    (step === "tenant" && tenantStepCanContinue) ||
    step === "details" ||
    step === "handover" ||
    (step === "verify" && (verificationMode !== null || verifiedBefore)) ||
    step === "review" ||
    step === "done";

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
    {/* Held still while the form scrolls under it: the step count and the bar
        answer "where am I and how much is left", which is asked precisely when
        someone has scrolled far enough to have pushed the answer off screen. */}
    <PinnedWizardHeader onHeightChange={wizardHeader.onHeightChange}>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          {/* Both slots are always occupied, even when a button would do
              nothing, so the title stays centred instead of drifting left on
              the first and last steps. */}
          <View style={{ width: 40 }}>
            {previousStep ? (
              <HeaderButton icon={ArrowLeft} onPress={goBackStep} subtle />
            ) : null}
          </View>

          {/* The noun in blue, as it was. Blue stays legal as TEXT — it is a
              fill that is banned, not the colour. */}
          <FitText
            numberOfLines={1}
            style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 19, textAlign: "center" }}
          >
            {onDone ? "Tenant " : "Onboard "}
            <Text style={{ color: colors.primary }}>{onDone ? (bookedForFuture ? "booked" : "onboarded") : fromBooking ? "booking" : "tenant"}</Text>
          </FitText>

          <View style={{ alignItems: "flex-end", width: 40 }}>
            <HeaderButton icon={X} onPress={closeWizard} subtle />
          </View>
        </View>

        {onDone ? null : <StepProgress step={stepIndex} totalSteps={stepOrder.length} />}
      </View>
    </PinnedWizardHeader>

    <ScreenScrollView
      // Cleared by the measured header, not a guessed number: the bar drops off
      // the final step, so a fixed inset would leave a gap on one step and clip
      // the first field on another. lg, not sm: the panel is an object with a
      // curved edge, and content arriving right against that curve reads as
      // clipped rather than as passing beneath it.
      contentContainerStyle={{
        paddingBottom: hasStandardFooter ? PINNED_FOOTER_CLEARANCE : undefined,
        paddingTop: wizardHeader.contentInset + spacing.xl,
      }}
      // The clearance lies under the pinned footer: a step only sits still when nothing is behind it.
      bottomPaddingCovered={hasStandardFooter}
      surface={colors.formSurface}
    >
      {step === "type" ? (
        // No heading over the four kinds (user, 2026-10-29).
        <View style={{ gap: spacing.md }}>
          {propertiesQuery.isLoading ? <OwnerStayTypeOptionsSkeleton /> : null}
          {!propertiesQuery.isLoading && !selectedProperty ? (
            <EmptyState
              icon={KeyRound}
              title={properties.length > 1 ? "Select a property from Home" : "No property available"}
              description="Onboarding uses the owner workspace property selected on Home."
            />
          ) : null}
          {selectedProperty ? (
            <>
              {/* An icon each, as the verify step's routes have (user, 2026-10-29). */}
              <SelectRow
                icon={CalendarDays}
                title="Monthly tenancy"
                subtitle="Recurring monthly rent with a security deposit and billing cycles"
                selected={billingType === "MONTHLY" && !existingTenant}
                onPress={() => chooseBilling("MONTHLY")}
              />
              <SelectRow
                icon={BedDouble}
                title="Daily tenancy"
                subtitle={
                  dailyAvailable
                    ? "Short stay billed per night (1–29 nights). No deposit"
                    : "Daily rates are not configured for this property"
                }
                selected={billingType === "DAILY"}
                disabled={!dailyAvailable}
                onPress={() => chooseBilling("DAILY")}
              />
              {/* A confirmed booking arriving: its own screen of today's and missed move-ins (user, 2026-10-27). */}
              <SelectRow
                icon={BookingConfirmedIcon}
                title="From booking"
                subtitle="Onboard tenants from confirmed bookings for your property"
                selected={false}
                onPress={() => router.push("/owner-booking-onboarding")}
              />
              {/* Someone already living here, onto Khatiyan from their next bill (P1.1, 2026-10-28). Last of the four (user, 2026-10-29). */}
              <SelectRow
                icon={UserCheck}
                title="Existing tenant"
                subtitle="Someone already living here, brought onto Khatiyan from their next bill"
                selected={billingType === "MONTHLY" && existingTenant}
                onPress={() => chooseBilling("MONTHLY", true)}
              />
            </>
          ) : null}
        </View>
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
            dob={tenantDob}
            dobError={form.errors.guestDob}
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
            onDob={(value) => {
              setTenantDob(value);
              form.clearField("guestDob");
            }}
            onChangeName={(value) => {
              setTenantName(value);
              form.clearField("tenantName");
            }}
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
            {fromBooking ? (
              /* The person who booked, by the booking's own number: nothing to look up or retype. */
              <>
                <NoticeBar
                  icon={Lock}
                  message="The room, rent, deposit and term agreed in the booking cannot be changed here."
                  title={booking ? `From booking ${booking.referenceCode}` : "Loading the booking"}
                  tone="info"
                />
                <Card style={{ borderRadius: 8 }}>
                  <Field label="Tenant phone">
                    {booking ? <LockedValue value={formatIndianPhone(booking.tenantPhone)} /> : <ActivityIndicator color={colors.muted} />}
                  </Field>
                  {lookupState.isFetching ? <ActivityIndicator color={colors.muted} /> : null}
                </Card>
              </>
            ) : (
            /* The auth screen's own phone field, not a bare digits input: the
                flag and fixed +91 are how this app asks for a number everywhere
                else, and a plain box here made the same question look like a
                different one. It also clamps to ten digits by itself. */
            <Card style={{ borderRadius: 8 }}>
              <PhoneField label="Tenant phone" onChangeText={handlePhoneChange} value={phone} />
              <PrimaryButton label="Look up" onPress={handleLookup} busy={lookupState.isFetching} />
            </Card>
            )}

            {/* A card of its own beneath the lookup, not an expansion inside it.
                The answer is about a person, and a person's details reading as an
                appendix to the field that found them is the wrong emphasis. */}
            {lookup ? (
              <LookupResultCard
                address={tenantAddress}
                addressError={form.errors.tenantAddress}
                canOnboard={lookup.canOnboard}
                exists={lookup.exists}
                existingName={lookup.fullName ?? null}
                message={lookup.message}
                name={tenantName}
                nameLockedTo={fromBooking ? booking?.tenantName ?? null : null}
                nameError={nameError}
                onAddress={(value) => {
                  setTenantAddress(value);
                  form.clearField("tenantAddress");
                }}
                onChangeName={(value) => {
                  setTenantName(value);
                  form.clearField("tenantName");
                }}
                onPincode={(value) => {
                  setTenantPincode(value);
                  form.clearField("tenantPincode");
                }}
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
            {propertiesQuery.isLoading ? (
              <OwnerOnboardingPropertySkeleton />
            ) : selectedProperty ? (
              <PropertySummary property={selectedProperty} />
            ) : (
              <EmptyState
                icon={KeyRound}
                title={properties.length > 1 ? "Select a property from Home" : "No property available"}
                description={
                  properties.length > 1
                    ? "Onboarding uses the owner workspace property selected on Home."
                    : "Create a property before onboarding a tenant."
                }
              />
            )}
          </Card>

          {selectedProperty && fromBooking ? (
            <Card>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Agreed in the booking
              </Text>
              <Field label="Room">
                <LockedValue value={booking ? `Room ${booking.roomNumber}` : "-"} />
              </Field>
              <Field label="Rent / month">
                <LockedValue value={booking ? rupees(booking.agreedRentPaise ?? booking.currentRentPaise) : "-"} />
              </Field>
              <Field label="Deposit">
                <LockedValue value={booking ? rupees(booking.depositPaise) : "-"} />
              </Field>
              <Field label="Start date">
                <LockedValue value={formatDateLong(startDate)} />
              </Field>
              <Text style={[type.description, { color: colors.muted }]}>
                The stay starts today, the day they move in. The room can only be changed from the booking&apos;s card, when the booked bed is not free.
              </Text>
            </Card>
          ) : null}

          {selectedProperty && !fromBooking ? (
            <Card>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Room
              </Text>
              {roomsQuery.isLoading || upcomingVacanciesQuery.isLoading ? (
                <OwnerOnboardingRoomsSkeleton />
              ) : (
                <RoomPicker
                  availableFrom={(room) => !isDaily && !existingTenant && room.availableVacancies <= 0
                    ? upcomingRoomVacancies.get(room.id) ?? null
                    : null}
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
                    return (room.availableVacancies <= 0 && (isDaily || existingTenant || !upcomingRoomVacancies.has(room.id)))
                      || (isDaily && perNight == null);
                  }}
                />
              )}
            </Card>
          ) : null}

          {roomId && !fromBooking ? (
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
                  <Field error={form.errors.rent} label="Rent / month" required>
                    <Input invalid={Boolean(form.errors.rent)} value={rent} onChangeText={(value) => { setRent(value); form.clearField("rent"); }} placeholder="From room base rent" keyboardType="number-pad" prefix="₹" />
                  </Field>
                  <Field error={form.errors.deposit} label={existingTenant ? "Deposit already held" : "Deposit"} required>
                    <Input invalid={Boolean(form.errors.deposit)} value={deposit} onChangeText={(value) => { setDeposit(value); form.clearField("deposit"); }} placeholder={existingTenant ? "What you hold for them now" : "From property policy"} keyboardType="number-pad" prefix="₹" />
                  </Field>
                </>
              )}
              <Field label={existingTenant ? "First Khatiyan bill" : "Start date"} required>
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
                  minimumDate={minimumStartDate}
                  // An existing tenant's first bill is their next rent day, within the month ahead.
                  maximumDate={existingTenant ? addDays(startOfToday(), 31) : undefined}
                  onChange={(event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== "ios") {
                      setShowPicker(false);
                    }
                    if (event.type === "set" && selected) {
                      const next = dateToStr(selected) < dateToStr(minimumStartDate) ? minimumStartDate : selected;
                      setStartDate(next);
                      if (dateToStr(plannedEndDate) <= dateToStr(next)) {
                        setPlannedEndDate(addDays(next, 1));
                      }
                    }
                  }}
                />
              ) : null}
              {showPicker && Platform.OS === "ios" ? <PrimaryButton label="Done" muted onPress={() => setShowPicker(false)} /> : null}

              {isDaily ? (
                <>
                  <Field label="Checkout date" required>
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

                  <Text style={[type.description, { color: colors.muted }]}>
                    {nights > 0
                      ? `${nights} night${nights === 1 ? "" : "s"}${dailyRatePaise != null ? ` · ${rupees(dailyRatePaise * nights)} total` : ""}`
                      : "Choose a checkout date after the start date."}
                  </Text>
                </>
              ) : null}

            </Card>
          ) : null}

          {/* What came before Khatiyan (P1.1, 2026-10-28): when they moved in, and what they owed. */}
          {roomId && existingTenant ? (
            <Card>
              {/* The deposit and dues notes sit behind the question mark (user, 2026-10-28). */}
              <View style={{ position: "absolute", right: spacing.sm, top: spacing.sm, zIndex: 1 }}>
                <IconButton accessibilityLabel="How the deposit and dues work" icon={CircleHelp} onPress={() => setCarryOverHelp(true)} />
              </View>
              <Field error={form.errors.movedInOn} label="Moved in on" required>
                <AnimatedPressable
                  onPress={() => setShowMovedInPicker(true)}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surfaceRaised,
                    borderColor: form.errors.movedInOn ? colors.danger : colors.border,
                    borderRadius: 10,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    minHeight: 48,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <CalendarDays color={colors.primary} size={18} strokeWidth={2.1} />
                  <Text style={[type.bodyStrong, { color: movedInOn ? colors.ink : colors.muted, flex: 1 }]}>
                    {movedInOn ? formatDateLong(movedInOn) : "Pick the day they moved in"}
                  </Text>
                </AnimatedPressable>
              </Field>
              {showMovedInPicker ? (
                <DateTimePicker
                  value={movedInOn ?? addDays(startOfToday(), -30)}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  maximumDate={addDays(startOfToday(), -1)}
                  onChange={(event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== "ios") {
                      setShowMovedInPicker(false);
                    }
                    if (event.type === "set" && selected) {
                      setMovedInOn(startOfDay(selected));
                      form.clearField("movedInOn");
                    }
                  }}
                />
              ) : null}
              {showMovedInPicker && Platform.OS === "ios" ? (
                <PrimaryButton label="Done" muted onPress={() => setShowMovedInPicker(false)} />
              ) : null}
              <Field error={form.errors.dues} label="Dues at the switch">
                <Input
                  invalid={Boolean(form.errors.dues)}
                  keyboardType="number-pad"
                  onChangeText={(value) => { setDues(value); form.clearField("dues"); }}
                  placeholder="Rent or charges they still owe"
                  prefix="₹"
                  value={dues}
                />
              </Field>
              {dues.trim() ? (
                <Field label="What the dues are for">
                  <Input maxLength={120} onChangeText={setDuesNote} placeholder="Dues before Khatiyan" value={duesNote} />
                </Field>
              ) : null}
            </Card>
          ) : null}
          {carryOverHelp ? (
            <HowItWorksSheet
              eyebrow="Existing tenant"
              onClose={() => setCarryOverHelp(false)}
              steps={[
                { title: "Deposit already held", body: "The deposit is what you hold for them now, after anything already taken from it. It is kept as held and never billed again." },
                { title: "Dues at the switch", body: "Dues become an opening bill when their billing starts." },
              ]}
              title="Deposit and dues"
            />
          ) : null}
        </>
      ) : null}

      {step === "verify" ? (
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.2 }}>
          Tenant verification
        </Text>
      ) : null}

      {step === "verify" ? (
        <Card>
          {/* A stack, not a long page. The picker is the whole card until a
              route is chosen, and then the route is the whole card with its own
              way back — so there is only ever one thing being answered. */}
          {verificationMode === null && existingTenant && existingRoute === null ? (
            <>
              {/* An existing tenant may have been verified when they moved in,
                  before Khatiyan (user, 2026-10-28). */}
              <SelectRow
                icon={BadgeCheck}
                onPress={() => setExistingRoute("BEFORE")}
                selected={false}
                subtitle="You verified their ID when they moved in, and declare it here."
                title="Already verified"
              />
              <SelectRow
                icon={ScanFace}
                onPress={() => setExistingRoute("NOW")}
                selected={false}
                subtitle="Check their ID yourself, or have them verify through an official check."
                title="Verify now"
              />
            </>
          ) : verificationMode === null && verifiedBefore ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <HeaderButton icon={ArrowLeft} onPress={goBackStep} subtle />
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 17 }}>
                Already verified
              </Text>
            </View>
          ) : verificationMode === null ? (
            <>
              {existingTenant ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                  <HeaderButton icon={ArrowLeft} onPress={goBackStep} subtle />
                  <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 17 }}>
                    Verify now
                  </Text>
                </View>
              ) : null}
              <SelectRow
                icon={ClipboardList}
                onPress={() => setVerificationMode("MANUAL")}
                selected={false}
                subtitle="You check a government photo ID yourself and record what you saw."
                title="Manual verification"
              />
              <SelectRow
                icon={ShieldCheck}
                onPress={() => setVerificationMode("KYC")}
                selected={false}
                subtitle="The tenant proves their own identity through an official check."
                title="KYC verification"
              />
            </>
          ) : (
            <>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                {isDaily ? null : <HeaderButton icon={ArrowLeft} onPress={goBackStep} subtle />}
                <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 17 }}>
                  {verificationMode === "MANUAL" ? "Manual verification" : "KYC verification"}
                </Text>
              </View>

              {verificationMode === "MANUAL" ? (
                <View style={{ gap: spacing.md }}>
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
              {/* Locked until a document is picked: the digits are OF that
                  document, so there is nothing to type them from before it. */}
              <Input
                editable={Boolean(idDocumentType)}
                invalid={Boolean(form.errors.idLastFour)}
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={(value) => {
                  setIdLastFour(value.replace(/[^0-9]/g, ""));
                  form.clearField("idLastFour");
                }}
                placeholder="As per verified document"
                value={idLastFour}
              />
            </Field>

            <View style={{ gap: 6 }}>
              <GenderPicker
                disabled={Boolean(accountGender)}
                label={accountGender ? "Gender (from their Khatiyan account)" : "Gender (as per verified document)"}
                onChange={(value) => {
                  // A guest's gender IS the register's, so it is edited in place.
                  if (isDaily) {
                    setTenantGender(value);
                    form.clearField("guestGender");
                  } else {
                    setIdGenderEdit(value);
                  }
                  form.clearField("idGender");
                }}
                options={ID_CHECK_GENDERS}
                value={idGender}
              />
              {form.errors.idGender ? (
                <Text style={[type.caption, { color: colors.danger }]}>{form.errors.idGender}</Text>
              ) : null}
            </View>

              <View style={{ gap: 6 }}>
                <DateOfBirthField
                  disabled={Boolean(accountDob)}
                  // Where the value came from: an existing account's own, read-only,
                  // or what the owner reads off the document.
                  label={accountDob ? "Date of birth (from their Khatiyan account)" : "Date of birth (as per verified document)"}
                  onChange={(value) => {
                    // A guest's date of birth IS the register's, so it is edited in place.
                    if (isDaily) {
                      setTenantDob(value);
                      form.clearField("guestDob");
                    } else {
                      setIdDobEdit(value);
                    }
                    form.clearField("idDob");
                  }}
                  value={idDob}
                />
                {/* The 18+ verdict, as soon as a date is in. It replaces the
                    under-18 error rather than repeating it, so only a missing
                    date is left for the error line to say. */}
                {ID_DOB_PATTERN.test(idDob.trim()) ? (
                  <AdultVerdict adult={adultDobIssue(idDob, istToday()) === null} />
                ) : form.errors.idDob ? (
                  <Text style={[type.caption, { color: colors.danger }]}>{form.errors.idDob}</Text>
                ) : null}
              </View>
                </View>
              ) : null}

              {verificationMode === "KYC" ? (
                <View style={{ gap: spacing.md }}>
                  <Text style={[type.description, { color: colors.muted }]}>
                    Choose what this tenant must complete. They do each check from their own phone.
                  </Text>

                  <VerificationServicePicker onToggle={toggleVerificationService} order={verificationOrder} />
                </View>
              ) : null}

            </>
          )}
        </Card>
      ) : null}

      {/* Under the card, not in it: the details are what the owner saw, and
          this is the statement they make about them. */}
      {step === "verify" && verificationMode === "MANUAL" ? (
        <ClickwrapConsent
          checked={idCheckConfirmed}
          onToggle={() => setIdCheckConfirmed((value) => !value)}
          statement={idStatement}
        />
      ) : null}

      {/* In full, in its own box under the card: the declaration is all this
          route asks, so the screen has room for it (user, 2026-10-28). */}
      {step === "verify" && verificationMode === null && verifiedBefore ? (
        <ClickwrapConsent
          boxed
          checked={verifiedBeforeConfirmed}
          expanded
          expandedHeight={380}
          onToggle={() => setVerifiedBeforeConfirmed((value) => !value)}
          statement={beforeStatement}
        />
      ) : null}


      {/* Outside the card on purpose: this is what the list above produced, not
          another section of it. Only once something is in it — an empty total
          under an empty list says nothing worth the space. */}
      {step === "verify" && verificationMode === "KYC" ? (
        <>
          <VerificationOrderSummary
            onAttemptsChange={setVerificationAttempts}
            order={verificationOrder}
          />

        </>
      ) : null}

      {step === "handover" ? (
        <>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.2 }}>
              Move in & move out
            </Text>
            <IconButton accessibilityLabel="How the move-in checklist works" icon={CircleHelp} onPress={() => setMoveInHelp(true)} />
          </View>
          {moveInHelp ? (
            <HowItWorksSheet
              eyebrow="Move-in checklist"
              onClose={() => setMoveInHelp(false)}
              steps={[
                { title: "Optional", body: "Skip it and nothing is recorded. Fill it in and every item needs at least one photo, up to 3, and the keys handed over." },
                { title: "A damage level for each item", body: "NA is no damage, D3 the worst. Any damage needs a note of what exactly is damaged." },
                { title: "The tenant answers", body: "They see it in their app and have 48 hours to accept it or note a difference. Unanswered, it counts as accepted." },
                { title: "Used at move-out", body: "It is the record the room is compared against when the tenancy ends." },
              ]}
              title="How the checklist works"
            />
          ) : null}

          {/* What must be done before the deposit is settled, this stay's own list (user, 2026-10-29). */}
          <CollapsibleSection
            accentTail="checklist"
            defaultOpen
            divided
            summary={`${moveOutItems.length} item${moveOutItems.length === 1 ? "" : "s"} before the deposit is settled`}
            title="Move-out"
            trailing={
              <AnimatedPressable
                accessibilityLabel="Add to the move-out checklist"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => { setNewMoveOutItem(""); setAddingMoveOut(true); }}
                style={{ alignItems: "center", borderColor: colors.primary, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 }}
              >
                <Plus color={colors.primary} size={14} strokeWidth={2.4} />
                <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>Add</Text>
              </AnimatedPressable>
            }
          >
            {moveOutItems.length === 0 ? (
              <Text style={[type.caption, { color: colors.muted }]}>Nothing to check at move-out. Use Add for anything.</Text>
            ) : null}
            {moveOutItems.map((entry, index) => (
              <View
                key={entry}
                style={{ alignItems: "center", borderTopColor: colors.border, borderTopWidth: index === 0 ? 0 : 1, flexDirection: "row", gap: spacing.sm, paddingTop: index === 0 ? 0 : spacing.sm }}
              >
                <Text style={[type.body, { color: colors.ink, flex: 1 }]}>{entry}</Text>
                <AnimatedPressable
                  accessibilityLabel={`Remove ${entry}`}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setMoveOutItems((items) => items.filter((kept) => kept !== entry))}
                >
                  <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
                </AnimatedPressable>
              </View>
            ))}
          </CollapsibleSection>
          {addingMoveOut ? (
            <SheetShell onClose={() => setAddingMoveOut(false)} title="Add to the move-out checklist">
              <View style={{ gap: spacing.md }}>
                <Input maxLength={120} onChangeText={setNewMoveOutItem} placeholder="e.g. Wardrobe emptied" value={newMoveOutItem} />
                <View style={{ flexDirection: "row" }}>
                  <ActionButton
                    disabled={!newMoveOutItem.trim()}
                    icon={Plus}
                    label="Add item"
                    onPress={() => {
                      const entry = newMoveOutItem.trim();
                      if (!entry) return;
                      if (moveOutItems.some((item) => item.toLowerCase() === entry.toLowerCase())) {
                        setMessage("This is already on the move-out checklist.");
                        return;
                      }
                      setMoveOutItems((items) => [...items, entry]);
                      setAddingMoveOut(false);
                    }}
                  />
                </View>
              </View>
            </SheetShell>
          ) : null}

          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
            Move-in<Text style={{ color: colors.accent }}> checklist</Text>
          </Text>
          {/* Keys first, above the list (user, 2026-10-29). */}
          <Card>
            {/* Less than 1, or emptied, is said under the field (user, 2026-10-29). */}
            <Field error={Number(keysHandedOver) >= 1 ? undefined : "Provide at least 1 key."} label="Keys handed over" required>
              <Input
                invalid={Number(keysHandedOver) < 1}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(value) => setKeysHandedOver(value.replace(/[^0-9]/g, ""))}
                placeholder="Provide at least 1 key"
                value={keysHandedOver}
              />
            </Field>
          </Card>

          {/* Amenities (the room's own, fixed), the bathroom, then the room's things. Each
              collapses to a summary, and all but Amenities add from the header (user, 2026-10-29). */}
          {([
            ...(selectedProperty?.bathroomType === "ATTACHED"
              ? [{ section: "BATHROOM", tail: "bathroom", title: "Attached" }]
              : [{ section: "COMMON", tail: "toilet", title: "Common" }]),
            { section: "ROOM", tail: "items", title: "Room" },
          ] as { section: MoveInSection | "COMMON"; tail: string; title: string }[]).map(({ section, tail, title }) => {
            // A common toilet is shared, so it is never on one tenant's checklist.
            if (section === "COMMON") {
              return (
                <CollapsibleSection accentTail={tail} defaultOpen divided key={section} summary="Not on the checklist" title={title}>
                  <NoticeBar message="It is shared by everyone here, so it is not part of a tenant's move-in checklist." title="Not on the checklist" tone="info" />
                </CollapsibleSection>
              );
            }
            const entries = (moveInItems ?? [])
              .map((item, index) => ({ index, item }))
              .filter(({ item }) => item.section === section);
            if (entries.length === 0 && section === "AMENITY") return null;
            const damaged = entries.filter(({ item }) => item.damageLevel !== "NA").length;
            const needPhotos = entries.filter(({ item }) => item.photoUrls.length === 0).length;
            const summary = [
              `${entries.length} item${entries.length === 1 ? "" : "s"}`,
              damaged > 0 ? `${damaged} with damage` : null,
              needPhotos > 0 ? `${needPhotos} need${needPhotos === 1 ? "s" : ""} a photo` : "all photographed",
            ].filter(Boolean).join(", ");
            return (
              <CollapsibleSection
                accentTail={tail}
                defaultOpen
                divided
                key={section}
                summary={summary}
                title={title}
                trailing={section === "AMENITY" ? null : (
                  <AnimatedPressable
                    accessibilityLabel={`Add an item to ${title} ${tail}`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => { setNewItemName(""); setAddingTo(section); }}
                    style={{ alignItems: "center", borderColor: colors.primary, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4 }}
                  >
                    <Plus color={colors.primary} size={14} strokeWidth={2.4} />
                    <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>Add</Text>
                  </AnimatedPressable>
                )}
              >
                {entries.length === 0 ? (
                  <Text style={[type.caption, { color: colors.muted }]}>Nothing here yet. Use Add for anything in it.</Text>
                ) : null}
                {entries.map(({ index, item }, position) => {
                  const update = (change: Partial<MoveInItem>) =>
                    setMoveInItems((items) => (items ?? []).map((entry, at) => (at === index ? { ...entry, ...change } : entry)));
                  return (
                    <View
                      key={`${item.name}-${index}`}
                      style={{
                        borderTopColor: colors.border,
                        borderTopWidth: position === 0 ? 0 : 1,
                        gap: spacing.md,
                        paddingTop: position === 0 ? 0 : spacing.md,
                      }}
                    >
                      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                        <ItemIcon color={colors.inkSoft} name={item.name} size={20} />
                        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 16 }}>{item.name}</Text>
                        {item.custom ? <Text style={[type.caption, { color: colors.kicker }]}>Added</Text> : null}
                        {/* The room's own amenities stay. Everything else can go, after a confirm. */}
                        {item.fixed ? null : (
                          <AnimatedPressable
                            accessibilityLabel={`Remove ${item.name}`}
                            accessibilityRole="button"
                            hitSlop={10}
                            onPress={() => setRemovingItem(index)}
                          >
                            <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
                          </AnimatedPressable>
                        )}
                      </View>
                      <DamageLevelDropdown levels={levelWords} onChange={(level) => update({ damageLevel: level })} value={item.damageLevel} />
                      {/* Any damage is described (user, 2026-10-29). */}
                      {item.damageLevel === "NA" ? null : (
                        <Field label="What is damaged" required>
                          <Input
                            maxLength={200}
                            onChangeText={(value) => update({ note: value })}
                            placeholder="e.g. Torn corner, stain on the left side"
                            value={item.note}
                          />
                        </Field>
                      )}
                      <MultiImageField
                        label={`Photos (${item.photoUrls.length} of 3)`}
                        max={3}
                        onChange={(urls) => update({ photoUrls: urls })}
                        showList={false}
                        target="MOVE_IN_PHOTO"
                        urls={item.photoUrls}
                      />
                      {item.photoUrls.length > 0 ? (
                        <View style={{ flexDirection: "row", gap: spacing.sm }}>
                          {item.photoUrls.map((url, photo) => (
                            <View key={url} style={{ height: 72, width: 72 }}>
                              <AnimatedPressable
                                accessibilityLabel={`Open photo ${photo + 1} of ${item.name}`}
                                accessibilityRole="imagebutton"
                                onPress={() => setMoveInLightbox({ images: item.photoUrls, index: photo })}
                                style={{ borderRadius: radii.card, height: 72, overflow: "hidden", width: 72 }}
                              >
                                <Image resizeMode="cover" source={{ uri: url }} style={{ height: "100%", width: "100%" }} />
                              </AnimatedPressable>
                              <AnimatedPressable
                                accessibilityLabel={`Remove photo ${photo + 1} of ${item.name}`}
                                accessibilityRole="button"
                                hitSlop={8}
                                onPress={() => update({ photoUrls: item.photoUrls.filter((kept) => kept !== url) })}
                                style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: 11, height: 22, justifyContent: "center", position: "absolute", right: -6, top: -6, width: 22 }}
                              >
                                <X color={colors.ink} size={13} strokeWidth={2.6} />
                              </AnimatedPressable>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                          <Info color={colors.kicker} size={13} strokeWidth={2.2} />
                          <Text style={[type.caption, { color: colors.kicker }]}>At least one photo is needed.</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </CollapsibleSection>
            );
          })}

          {/* Adding an item, in a bottom sheet over the step (user, 2026-10-29). */}
          {addingTo ? (
            <SheetShell onClose={() => setAddingTo(null)} title={addingTo === "BATHROOM" ? "Add to the bathroom" : "Add to the room"}>
              <View style={{ gap: spacing.md }}>
                {/* No autofocus: the sheet opens without the keyboard (user, 2026-10-29). */}
                <Input
                  maxLength={80}
                  onChangeText={setNewItemName}
                  placeholder={addingTo === "BATHROOM" ? "e.g. Towel rail" : "e.g. Study lamp"}
                  value={newItemName}
                />
                <View style={{ flexDirection: "row" }}>
                  <ActionButton
                    disabled={!newItemName.trim()}
                    icon={Plus}
                    label="Add item"
                    onPress={() => {
                      const name = newItemName.trim();
                      if (!name || !addingTo) return;
                      if ((moveInItems ?? []).some((item) => item.name.toLowerCase() === name.toLowerCase())) {
                        setMessage("This item is already on the checklist.");
                        return;
                      }
                      const section = addingTo;
                      setMoveInItems((items) => [...(items ?? []), { custom: true, damageLevel: "NA", fixed: false, name, note: "", photoUrls: [], section }]);
                      setNewItemName("");
                      setAddingTo(null);
                    }}
                  />
                </View>
              </View>
            </SheetShell>
          ) : null}

          {removingItem !== null && moveInItems?.[removingItem] ? (
            <ConfirmDialog
              confirmLabel="Remove"
              destructive
              message={`${moveInItems[removingItem].name} will not be on this checklist.`}
              onCancel={() => setRemovingItem(null)}
              onConfirm={() => {
                const at = removingItem;
                setRemovingItem(null);
                setMoveInItems((items) => (items ?? []).filter((_, index) => index !== at));
              }}
              title="Remove this item?"
            />
          ) : null}
          {moveInLightbox ? (
            <Lightbox images={moveInLightbox.images} initialIndex={moveInLightbox.index} onClose={() => setMoveInLightbox(null)} />
          ) : null}

        </>
      ) : null}

      {step === "review" ? (
        <>
          {/* The page's own title, not an 11px eyebrow. The sections below are
              eyebrows now, and a heading set in the same style as the things it
              contains gives a reader nothing to climb. */}
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.35 }}>
              Review before creating
            </Text>
            <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 20 }]}>
              {isDaily
                ? "This is the register entry for the stay."
                : "These are the terms the tenancy is created with."}
            </Text>
          </View>

          <Card style={{ gap: spacing.lg, padding: spacing.md }}>
          {/* Grouped, not one long list of twelve rows. Who, where, what it
              costs, and how they were checked are four different questions, and
              an owner scanning for the rent should not have to read past the
              guest's email to find it. */}
          <ReviewGroup
            rows={[
              { label: "Name", value: tenantName.trim() || lookup?.fullName || phone.trim() },
              { label: "Phone", value: phone.trim(), mono: true },
              ...(isDaily
                ? [
                    { label: "Date of birth", value: tenantDob ? formatDateLong(dateFromStr(tenantDob)) : "-" },
                    { label: "Gender", value: idGender ? GENDER_LABELS[idGender] : "-" },
                    { label: "Email", value: tenantEmail.trim() || "Not given" },
                  ]
                : []),
            ]}
            materialIcon="account"
            title={isDaily ? "Guest" : "Tenant"}
          />

          <ReviewGroup
            rows={[
              { label: "Type", value: isDaily ? "Daily" : existingTenant ? "Monthly, existing tenant" : "Monthly" },
              { label: "Property", value: selectedProperty?.name ?? "-" },
              { label: "Room", value: selectedRoom ? `Room ${selectedRoom.roomNumber}` : booking ? `Room ${booking.roomNumber}` : "-" },
              ...(booking ? [{ label: "Booking", value: booking.referenceCode, mono: true }] : []),
              ...(existingTenant && movedInOn ? [{ label: "Moved in on", value: formatDateLong(movedInOn) }] : []),
              { label: existingTenant ? "First Khatiyan bill" : "Start date", value: formatDateLong(startDate) },
              ...(isDaily
                ? [
                    { label: "Checkout date", value: formatDateLong(plannedEndDate) },
                    { label: "Nights", value: String(nights) },
                  ]
                : []),
            ]}
            materialIcon="home"
            title="Stay"
          />

          <ReviewGroup
            rows={
              isDaily
                ? [
                    { label: "Daily rate", value: dailyRatePaise != null ? rupees(dailyRatePaise) : "-", mono: true },
                    {
                      label: `Total for ${nights} ${nights === 1 ? "night" : "nights"}`,
                      mono: true,
                      strong: true,
                      value: dailyRatePaise != null ? rupees(dailyRatePaise * nights) : "-",
                    },
                  ]
                : [
                    { label: "Rent / month", mono: true, strong: true, value: rupees(Math.round(Number(rent) * 100)) },
                    { label: existingTenant ? "Deposit already held" : "Deposit", value: rupees(Math.round(Number(deposit || "0") * 100)), mono: true },
                    ...(existingTenant && dues.trim()
                      ? [{ label: "Dues at the switch", value: rupees(Math.round(Number(dues) * 100)), mono: true }]
                      : []),
                  ]
            }
            materialIcon="currency-inr"
            title="Money"
          />

          {/* A consequence, not a caption. What the owner is about to create
              does not start on the day it is created, and that sentence set as
              muted 12px under a group of rows was the quietest thing on a page
              it changes the meaning of. */}
          {!isDaily && existingTenant ? (
            <NoticeBar
              icon={FileCheck}
              message="Next, keep their paper agreement and the stay starts now, or send a Khatiyan agreement for them to sign."
              title="Their agreement"
              tone="info"
            />
          ) : !isDaily ? (
            <NoticeBar
              icon={Clock3}
              message="The tenancy and its billing start only when the tenant accepts the agreement in their app."
              title="Stays pending until accepted"
              tone="warning"
            />
          ) : null}

          {/* The identity check happened on its own step, so this states what
              was asked for rather than asking again. "Change" goes back to that
              step — it is the one thing on this page worth reopening. */}
          <ReviewGroup
            action={{ label: "Change", onPress: () => setStep("verify") }}
            footer={
              verifiedBefore
                ? "You declared their identity was verified when they moved in."
                : verificationMode === "KYC" ? undefined : "You confirmed you saw this document yourself."
            }
            rows={
              verifiedBefore
                ? [{ label: "Route", value: "Already verified" }]
                : verificationMode === "KYC"
                ? [
                    { label: "Route", value: "Tenant verifies" },
                    // A receipt line: the count rides with the thing counted,
                    // and the money stays in the money column with every other
                    // figure on the page.
                    ...orderedVerificationServices.map((service) => {
                      const attempts = verificationOrder[service.key] ?? 1;
                      return {
                        label: `${service.shortLabel} ×${attempts}`,
                        value: formatMoneyPaise(service.pricePaise * attempts),
                        mono: true,
                      };
                    }),
                    { label: "Most it can cost", mono: true, strong: true, value: formatMoneyPaise(verificationMaxPaise) },
                  ]
                : [
                    { label: "Route", value: "Manual verification" },
                    {
                      label: "Document",
                      value: `${ID_DOCUMENT_OPTIONS.find((option) => option.value === idDocumentType)?.label ?? "ID"} ending ${idLastFour || "----"}`,
                    },
                    // A guest's gender and age are already under Guest above.
                    ...(isDaily
                      ? []
                      : [
                          { label: "Gender", value: idGender ? GENDER_LABELS[idGender] : "-" },
                          { label: "Date of birth", value: idDob ? formatDateLong(dateFromStr(idDob)) : "-" },
                        ]),
                  ]
            }
            title="Verification"
          />

          {isDaily ? null : (
            <ReviewGroup
              action={{ label: "Change", onPress: () => setStep("handover") }}
              rows={moveInPayload
                ? [
                    { label: "Items", value: `${moveInPayload.items.length}, ${moveInPayload.items.filter((item) => item.damageLevel !== "NA").length} with damage` },
                    { label: "Photos", value: String(moveInPayload.items.reduce((total, item) => total + item.photoUrls.length, 0)) },
                    ...(moveInPayload.keysHandedOver != null ? [{ label: "Keys handed over", value: String(moveInPayload.keysHandedOver) }] : []),
                  ]
                : [{ label: "Checklist", value: "Skipped" }]}
              title="Move-in checklist"
            />
          )}
          {isDaily ? null : (
            <ReviewGroup
              action={{ label: "Change", onPress: () => setStep("handover") }}
              rows={[{ label: "Items", value: moveOutItems.length ? moveOutItems.join(", ") : "None" }]}
              title="Move-out checklist"
            />
          )}

          {/* What the money does, said where the money is. The same notice
              shape as the one below it, in blue: this explains a mechanism,
              where that one warns about a state the tenancy sits in. */}
          {verificationMode === "KYC" && orderedVerificationServices.length > 0 ? (
            <NoticeBar
              icon={Wallet}
              message={`Nothing is set aside now. Each attempt is charged to your Service balance only when the tenant uses it, so ${formatMoneyPaise(verificationMaxPaise)} is the most this can come to and attempts they never use cost nothing.`}
              title="Charged as they are used"
              tone="info"
            />
          ) : null}

          </Card>
        </>
      ) : null}

      {/* A wall, not a warning. The deed names the property owner as Landlord, so
          until their profile can carry one there is nothing on this step worth
          filling in — and the endpoint would refuse it anyway. */}
      {step === "agreement" && agreementGateBlocked && readinessQuery.data ? (
        <OnboardingGateBoard
          onOpenProfile={() => router.push("/account-settings")}
          readiness={readinessQuery.data}
        />
      ) : null}

      {step === "agreement" && !agreementGateBlocked ? (
        <>
          <View style={{ gap: spacing.sm }}>
            {/* The screen's subject, set as one. This step is where the legal
                document is settled, and an 11px upper-case eyebrow gave it the
                same weight as the word "Room" two screens earlier. */}
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.2 }}>
                Tenancy agreement
              </Text>
              {/* The points sit behind the question mark, in How it works (user, 2026-10-28). */}
              <IconButton accessibilityLabel="How the agreement works" icon={CircleHelp} onPress={() => setAgreementHelp(true)} />
            </View>
          </View>
          {agreementHelp ? (
            <HowItWorksSheet
              eyebrow="Tenancy agreement"
              onClose={() => setAgreementHelp(false)}
              steps={paperChosen
                ? [
                    { title: "Their paper agreement stays", body: "Their paper agreement stays their agreement. Its photos are kept on file for you and for them." },
                    { title: "What is left of the term", body: "Set what is left of its term. It counts from their first Khatiyan bill." },
                    { title: "Nothing to sign", body: "The stay starts now and billing on the first Khatiyan bill." },
                  ]
                : [
                    { title: "The exact terms", body: "These are the exact terms this tenant will accept." },
                    { title: "This tenancy only", body: "The term and clauses below apply to this tenancy only. The property's standard agreement does not change." },
                    { title: "Accepted in their app", body: "Sent to the tenant's account for acceptance. The tenancy and its billing start only once they accept." },
                  ]}
              title="How the agreement works"
            />
          ) : null}

          {/* How an existing tenant's agreement carries over (P1.1, 2026-10-28). */}
          {existingTenant ? (
            <Card>
              <SelectRow
                chevron={false}
                title="Upload existing agreement"
                subtitle="Add photos or a PDF of it. Nothing to sign, the stay starts now"
                selected={agreementKind === "PAPER"}
                onPress={() => setAgreementKind("PAPER")}
              />
              <SelectRow
                chevron={false}
                title="Create new agreement"
                subtitle="They sign it in their app. The stay starts when they do"
                selected={agreementKind === "IN_APP"}
                onPress={() => setAgreementKind("IN_APP")}
              />
            </Card>
          ) : null}

          {/* Photos or a PDF, in a box headed like the term below it (user, 2026-10-28). */}
          {paperChosen ? (
            <CollapsibleSection accentTail="document" collapsible={false} title="Agreement">
              <MultiImageField
                documentTarget="AGREEMENT_DOCUMENT"
                label="Photos or PDF"
                max={10}
                onChange={setPaperPhotos}
                target="AGREEMENT_PHOTO"
                urls={paperPhotos}
              />
            </CollapsibleSection>
          ) : null}

          {existingTenant && agreementKind === "IN_APP" && gateBlocked && readinessQuery.data ? (
            <OnboardingGateBoard
              onOpenProfile={() => router.push("/account-settings")}
              readiness={readinessQuery.data}
            />
          ) : null}

          {showTerm ? (
          <CollapsibleSection collapsible={false} contentGap={spacing.md} title={paperChosen ? "Remaining" : "Agreement"} accentTail={paperChosen ? "term" : "duration"}>
            {fromBooking ? (
              <>
                <LockedValue value={fixedTerm ? `Fixed term, ${termMonths} months` : "Indefinite"} />
                {/* With an info mark, as a note about the lock above (user, 2026-10-28). */}
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                  <Info color={colors.muted} size={14} strokeWidth={2.2} style={{ marginTop: 2 }} />
                  <Text style={[type.description, { color: colors.muted, flex: 1 }]}>
                    The term was agreed in the booking. It cannot be changed here.
                  </Text>
                </View>
              </>
            ) : (
            <>
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
                <AgreementMonthDropdown label="Months" onChange={setTermMonths} value={termMonths ?? 11} />
                {/* On the notice board's ground, as the agreement step's points were (user, 2026-10-29). */}
                <View
                  style={{
                    alignItems: "flex-start",
                    backgroundColor: colors.primarySoft,
                    borderCurve: "continuous",
                    borderRadius: radii.card,
                    flexDirection: "row",
                    gap: spacing.sm,
                    padding: spacing.md,
                  }}
                >
                  <Info color={colors.primary} size={15} strokeWidth={2.2} style={{ marginTop: 2 }} />
                  <Text style={[type.caption, { color: colors.inkSoft, flex: 1, fontSize: 12.5, lineHeight: 18 }]}>
                    {paperChosen
                      ? "Choose between 1 and 11 months as what is left of their agreement. A fixed term ends the tenancy on its last day."
                      : "Choose between 1 and 11 months as the agreement duration. A fixed term ends the tenancy on its last day."}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={[type.description, { color: colors.muted }]}>
                Runs until either side serves notice. Leaving without serving it is what the early-exit clause
                charges for.
              </Text>
            )}
            </>
            )}
          </CollapsibleSection>
          ) : null}

          {template && !clausesReadOnly && showDeed ? (
            <CollapsibleSection summary={clauseCountLabel} title="Agreement" accentTail="clauses">
              <AgreementTemplateEditor
                clauses={mainClauses}
                miscOptions={miscQuery.data ?? []}
                onChange={setTemplate}
                template={template}
              />
            </CollapsibleSection>
          ) : null}

          {agreementUnavailable && showDeed ? (
            <View style={{ gap: spacing.md }}>
              <NoticeBar
                message="The agreement could not be loaded, so its clauses cannot be shown or changed. Check your connection and try again."
                title="Preview unavailable"
                tone="warning"
              />
              <ActionButton label="Try again" onPress={() => {
                if (settingsQuery.isError) void settingsQuery.refetch();
                if (previewQuery.isError) void previewQuery.refetch();
              }} />
            </View>
          ) : null}

          {/* Measured, not guessed. PINNED_FOOTER_CLEARANCE assumes a single
              button; this footer carries a note as well, so its height is its
              own business — reading it back is the only way the two stay in
              step. */}
          <View style={{ height: footerHeight || PINNED_FOOTER_CLEARANCE }} />
        </>
      ) : null}

      {step === "done" && result ? (
        <>
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.35 }}>
              {bookedForFuture ? "Future tenancy booked" : "Tenancy created"}
            </Text>
            <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 20 }]}>
              {result.tenancy.guestStay
                ? "This is the register entry for the completed onboarding."
                : "These are the terms the tenancy was created with."}
            </Text>
          </View>

          <Card style={{ gap: spacing.lg, padding: spacing.md }}>
            <NoticeBar
              icon={Check}
              message={
                bookedForFuture
                  ? "The monthly tenancy is booked for its future start date. The agreement is sent now."
                  : result.tenantAccountCreated
                  ? "The tenant account and tenancy were created successfully."
                  : "The tenancy was created successfully."
              }
              title={bookedForFuture ? "Booking created" : "Onboarding complete"}
              tone="success"
            />

            {result.tenancy.status === "PENDING_ACCEPTANCE" ? (
              <NoticeBar
                icon={Clock3}
                message={bookedForFuture
                  ? "The agreement is available to sign now and expires after 3 days if not accepted. The stay and billing start on the selected date, once the bed is free. If the stay in it hasn't been ended by then, it starts the day you end it."
                  : "The bed is reserved. The tenancy and billing start once the tenant accepts the agreement in their app. Pending tenancies auto-cancel after 3 days."}
                title="Awaiting acceptance"
                tone="warning"
              />
            ) : null}

            <ReviewGroup
              materialIcon="file-document-check"
              rows={[
                { label: "Reference", value: result.tenancy.referenceCode, mono: true },
                { label: "Type", value: result.tenancy.billingType === "DAILY" ? "Daily" : "Monthly" },
              ]}
              title="Tenancy"
            />

            <ReviewGroup
              materialIcon="account"
              rows={[
                { label: "Name", value: tenantName.trim() || lookup?.fullName || phone.trim() },
                { label: "Phone", value: phone.trim(), mono: true },
              ]}
              title={result.tenancy.guestStay ? "Guest" : "Tenant"}
            />

            <ReviewGroup
              materialIcon="home"
              rows={[
                { label: "Property", value: selectedProperty?.name ?? "-" },
                { label: "Room", value: selectedRoom ? `Room ${selectedRoom.roomNumber}` : booking ? `Room ${booking.roomNumber}` : "-" },
                ...(result.tenancy.movedInOn
                  ? [{ label: "Moved in on", value: formatDateLong(dateFromStr(result.tenancy.movedInOn)) }]
                  : []),
                {
                  label: result.tenancy.transitioned ? "First Khatiyan bill" : "Start date",
                  value: formatDateLong(new Date(result.tenancy.startDate)),
                },
                ...(result.tenancy.billingType === "DAILY"
                  ? [
                      {
                        label: "Checkout date",
                        value: result.tenancy.plannedEndDate
                          ? formatDateLong(new Date(result.tenancy.plannedEndDate))
                          : "-",
                      },
                    ]
                  : []),
              ]}
              title="Stay"
            />

            <ReviewGroup
              materialIcon="currency-inr"
              rows={
                result.tenancy.billingType === "DAILY"
                  ? [
                      { label: "Daily rate", mono: true, strong: true, value: rupees(result.tenancy.dailyRatePaise ?? 0) },
                    ]
                  : [
                      { label: "Rent / month", mono: true, strong: true, value: rupees(result.tenancy.rentAmountPaise ?? 0) },
                      { label: "Deposit", value: rupees(result.tenancy.depositAmountPaise ?? 0), mono: true },
                    ]
              }
              title="Money"
            />

            {result.tenantAccountCreated ? (
              <NoticeBar
                message="The tenant can now sign up with this phone number to set their PIN."
                title="They can sign in now"
                tone="info"
              />
            ) : null}

            {result.tenancy.guestStay ? (
              <NoticeBar
                message="No account was created and the guest is not sent anything. Raise the bill and mark it paid here, and handle anything else with them directly."
                title="Everything here is yours to do"
                tone="info"
              />
            ) : null}
          </Card>
        </>
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

      {opErrors.serverError ? (
        <AlertModal
          message={opErrors.serverError}
          onClose={() => {
            opErrors.dismissServerError();
            if (bookingGone) router.back();
          }}
        />
      ) : null}
    </ScreenScrollView>

      {step === "tenant" && tenantStepCanContinue ? (
        <PinnedFooter>
          <ActionButton
            disabled={lookupState.isFetching}
            label="Continue"
            onPress={isDaily ? goToRoomAndDatesForGuest : goToRoomAndDates}
          />
        </PinnedFooter>
      ) : null}

      {step === "details" ? (
        <PinnedFooter>
          <ActionButton disabled={!roomId || (fromBooking && !booking)} label="Continue" onPress={goToReview} />
        </PinnedFooter>
      ) : null}

      {step === "verify" && (verificationMode !== null || verifiedBefore) ? (
        <PinnedFooter>
          <ActionButton
            disabled={
              verifiedBefore && verificationMode === null
                ? !verifiedBeforeConfirmed || !beforeStatement.trim()
                : verificationMode === "MANUAL"
                ? !idCheckConfirmed || !idStatement.trim()
                : orderedVerificationServices.length === 0
            }
            label={isDaily ? "Continue to review" : "Continue"}
            onPress={() => {
              if (!priorStepsValid()) return;
              setStep(isDaily ? "review" : "handover");
            }}
          />
        </PinnedFooter>
      ) : null}

      {step === "handover" ? (
        <PinnedFooter>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton
              label="Skip move-in"
              onPress={() => {
                setMoveInSkipped(true);
                setMessage(null);
                setStep("review");
              }}
              variant="neutral"
            />
            {/* Blocked until every item has a photo (user, 2026-10-29). */}
            <ActionButton
              disabled={!moveInReady}
              label="Continue"
              onPress={() => {
                if (!moveInReady) return;
                setMoveInSkipped(false);
                setMessage(null);
                setStep("review");
              }}
            />
          </View>
        </PinnedFooter>
      ) : null}

      {step === "review" ? (
        <PinnedFooter>
          <ActionButton
            disabled={!withAgreement && onboardState.isLoading}
            label={
              withAgreement
                ? "Continue to agreement"
                : onboardState.isLoading
                  ? "Creating tenancy…"
                  : "Confirm and create tenancy"
            }
            onPress={withAgreement ? () => { if (priorStepsValid()) setStep("agreement"); } : () => void handleConfirm()}
          />
        </PinnedFooter>
      ) : null}

      {step === "done" ? (
        <PinnedFooter>
          <ActionButton label="Done" onPress={() => router.back()} />
        </PinnedFooter>
      ) : null}

      {/* Pinned rather than scrolled to. It is the one action of this step, and
          on a long agreement it was several clauses below the fold — PinnedFooter
          also handles the system bar inset, which a button inside the scroll
          view never did. */}
      {step === "agreement" && !agreementGateBlocked ? (
        <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
          {/* ActionButton, the same one every other pinned footer uses. The
              local PrimaryButton drops to opacity 0.65 when disabled, which
              inside a footer lets the page scroll visibly through it — the
              shared button says disabled with colour and keeps a border, and
              its shadow and radius match the rest of the app. */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {paperChosen ? null : (
            <ActionButton
              compact
              disabled={onboardWithAgreementState.isLoading || !previewQuery.currentData
                || previewQuery.isFetching || previewQuery.isError || (existingTenant && !agreementKind)}
              label="Preview agreement"
              variant="secondary"
              onPress={() => {
                if (!previewQuery.currentData || previewQuery.isFetching) return;
                dispatch(showAgreementPreview(previewQuery.currentData));
                router.push("/owner-agreement-preview");
              }}
            />
            )}
            <ActionButton
              compact
              disabled={paperChosen
                ? onboardExistingState.isLoading || paperPhotos.length === 0
                : onboardWithAgreementState.isLoading || convertState.isLoading || onboardExistingState.isLoading
                  || (existingTenant && !agreementKind) || !template || !previewQuery.data
                  || previewQuery.isFetching || previewQuery.isError || settingsQuery.isFetching || settingsQuery.isError
                  || readinessQuery.isFetching || !readinessQuery.data?.landlordReady}
              label={onboardWithAgreementState.isLoading || convertState.isLoading || onboardExistingState.isLoading ? "Creating…" : "Create tenancy"}
              onPress={() => void (existingTenant
                ? handleOnboardExisting()
                : fromBooking ? handleConvertBooking() : handleConfirmWithAgreement())}
            />
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
  dob,
  dobError,
  email,
  emailError,
  gender,
  genderError,
  name,
  nameError,
  onAddress,
  onChangeName,
  onDob,
  onEmail,
  onGender,
  onPhone,
  phone,
  phoneError,
}: {
  address: string;
  addressError?: string;
  /** `YYYY-MM-DD` as the guest's ID shows it. */
  dob: string;
  dobError?: string;
  email: string;
  emailError?: string;
  gender: Gender | null;
  genderError?: string;
  name: string;
  nameError?: string;
  onAddress: (value: string) => void;
  onChangeName: (value: string) => void;
  onDob: (value: string) => void;
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
        {/* A grey disc behind the person, not a ring (owner's call, 2026-09-27),
            the same grey ground the app's other person icons sit on. */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderRadius: 999,
            height: 46,
            justifyContent: "center",
            width: 46,
          }}
        >
          <UserPlus color={colors.ink} size={21} strokeWidth={2} />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
            {cardName(name.trim() || "Guest details")}
          </FitText>
          <Text style={[type.description, { color: colors.muted }]}>
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

      {/* A date of birth, not an age (owner's rule, 2026-09-27): it is what the
          ID shows, and the manual check makes its 18+ check against it.
          DateOfBirthField draws its own label, so only the error is added. */}
      <View style={{ gap: 6 }}>
        <DateOfBirthField onChange={onDob} value={dob} />
        {dobError ? <Text style={[type.caption, { color: colors.danger }]}>{dobError}</Text> : null}
      </View>

      {/* No Field wrapper: GenderPicker draws its own label, and nesting it in
          one printed "Gender" twice. Only the error message is added here. */}
      <View style={{ gap: 6 }}>
        <GenderPicker onChange={onGender} value={gender} />
        {genderError ? (
          <Text style={[type.caption, { color: colors.danger }]}>{genderError}</Text>
        ) : null}
      </View>

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
  canOnboard,
  exists,
  existingName,
  message,
  name,
  nameError,
  nameLockedTo,
  onAddress,
  onChangeName,
  onPincode,
  phone,
  pincode,
  pincodeError,
  prefill,
}: {
  address: string;
  addressError?: string;
  canOnboard: boolean;
  exists: boolean;
  existingName: string | null;
  message: string;
  name: string;
  nameError?: string;
  /** The booking's name, which a booking onboarding never changes (2026-10-28). */
  nameLockedTo?: string | null;
  onAddress: (value: string) => void;
  onChangeName: (value: string) => void;
  onPincode: (value: string) => void;
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
  const lockedName = nameLockedTo || (exists ? existingName : null);
  const nameLocked = Boolean(lockedName);
  const displayName = lockedName ?? name;


  // Three outcomes, three headings. The notice says what KIND of person this
  // is; the message underneath says what that means for onboarding them.
  const noticeTitle = !canOnboard
      ? "Cannot be onboarded"
      : exists
        ? "Existing Khatiyan account"
        // Not "New tenant": the notice says what happens next, and the card
        // above it already shows who this is.
        : "No account yet";

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        {/* Outlined, never filled — the app's icon rule. The glyph says which
            KIND of person this is; the pill beside it says whether they can be
            onboarded, which is a different question. */}
        {/* A grey disc behind the person, not a ring (owner's call, 2026-09-27),
            the same grey ground the app's other person icons sit on. */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderRadius: 999,
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
          <FitText
            numberOfLines={1}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}
          >
            {cardName(displayName.trim() || "New tenant")}
          </FitText>
          {/* The number is marked as a number. On its own under a name it read
              as a second line of the name rather than as how to reach them. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Phone color={colors.muted} size={13} strokeWidth={2.2} />
            <Text style={[type.caption, { color: colors.muted }]}>
              {formatIndianPhone(phone)}
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
        <Field error={nameError} label="Tenant name" required>
          {nameLocked ? (
            <LockedValue value={lockedName!} />
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

          <Field error={addressError} label="Permanent address" required>
            <Input
              editable={!held(prefill?.permanentAddress)}
              invalid={Boolean(addressError)}
              multiline
              onChangeText={onAddress}
              placeholder="Enter full address"
              value={address}
            />
          </Field>

          <Field error={pincodeError} label="PIN code" required>
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

        </>
      ) : null}

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
            <FitText numberOfLines={1} style={[type.caption, { color: colors.muted, flex: 1 }]}>
              {location}
            </FitText>
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
  availableFrom,
  onClear,
  onSelect,
  priceOf,
  rooms,
  selectedRoomId,
  unavailable,
}: {
  availableFrom: (room: OwnerRoom) => string | null;
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
          <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15.5 }}>
            Room {selected.roomNumber}
          </FitText>
          <FitText numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
            {formatFloor(selected.floor)} · {conditioningLabel(selected)} · {priceOf(selected)}
          </FitText>
          {availableFrom(selected) ? (
            <Text style={[type.caption, { color: colors.primary }]}>
              Available from {formatDateLong(dateFromStr(availableFrom(selected)!))}
            </Text>
          ) : null}
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
        const freeNow = floorRooms.filter((room) => !unavailable(room) && room.availableVacancies > 0).length;
        const upcoming = floorRooms.filter((room) => !unavailable(room) && availableFrom(room)).length;

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
                {floor === "Unassigned" ? floor : formatFloor(floor)}
              </Text>
              <Text style={[type.description, { color: freeNow + upcoming > 0 ? colors.muted : colors.kicker }]}>
                {freeNow > 0 && upcoming > 0
                  ? `${freeNow} now · ${upcoming} upcoming`
                  : freeNow > 0 ? `${freeNow} free` : upcoming > 0 ? `${upcoming} upcoming` : "Full"}
              </Text>
              <ChevronDisc color={colors.kicker} direction={open ? "down" : "right"} />
            </AnimatedPressable>

            {open
              ? floorRooms.map((room) => (
                  <View key={room.id} style={{ paddingLeft: spacing.md }}>
                    <SelectRow
                      disabled={unavailable(room)}
                      onPress={() => onSelect(room)}
                      selected={false}
                      // AC or not and the rent on the first line, what is free on
                      // the second: the two things an owner picks a room by.
                      subtitle={`${conditioningLabel(room)} · ${priceOf(room)}\n${room.availableVacancies > 0
                        ? `${room.availableVacancies} ${room.availableVacancies === 1 ? "vacancy" : "vacancies"}`
                        : availableFrom(room)
                          ? `Available from ${formatDateLong(dateFromStr(availableFrom(room)!))}`
                          : "Full"}`}
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

/** Agreement settings use plain card titles and a summary when collapsed. */
function CollapsibleSection({
  accentTail,
  children,
  collapsible = true,
  contentGap = 0,
  defaultOpen,
  divided,
  summary,
  title,
  trailing,
}: {
  /** A line between the title and the content when open: the checklist's sections (2026-10-29). */
  divided?: boolean;
  accentTail?: string;
  children: React.ReactNode;
  /** A control beside the title, before the chevron: the checklist's Add (2026-10-29). */
  trailing?: React.ReactNode;
  /**
   * False: the same card and title, always open, nothing to tap, the content
   * close under the title (user, 2026-10-28: Agreement document).
   */
  collapsible?: boolean;
  /** Space between a fixed card's title and its content (user, 2026-10-29: more on the term cards). */
  contentGap?: number;
  defaultOpen?: boolean;
  summary?: string;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [toggled, setOpen] = useState(Boolean(defaultOpen));
  const open = collapsible ? toggled : true;

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
        accessibilityRole={collapsible ? "button" : "header"}
        accessibilityState={collapsible ? { expanded: open } : undefined}
        disabled={!collapsible}
        onPress={() => setOpen((current) => !current)}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: collapsible ? spacing.md : spacing.xxs, paddingTop: spacing.md }}
      >
        {/* The title and its summary on the left; the controls centred on the
            whole of it, title and summary together (user, 2026-10-29). */}
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
            {title}{accentTail ? <Text style={{ color: colors.accent }}> {accentTail}</Text> : null}
          </Text>
          {!open && summary ? <Text style={[type.description, { color: colors.muted }]}>{summary}</Text> : null}
        </View>
        {trailing}
        {collapsible ? <ChevronDisc direction={open ? "up" : "down"} size={32} /> : null}
      </AnimatedPressable>

      {open ? (
        <View
          style={{
            gap: spacing.md,
            paddingBottom: spacing.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: divided ? spacing.md : collapsible ? spacing.xs : contentGap,
            ...(divided ? { borderTopColor: colors.border, borderTopWidth: 1 } : null),
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

/**
 * Under the checked date of birth: the 18+ verdict it gives. The status mark
 * (a filled disc, white glyph) is the app's shape for "something was decided".
 */
function AdultVerdict({ adult }: { adult: boolean }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      {adult ? (
        <StatusIcon size={16} tone="success" />
      ) : (
        // Literal white, as StatusIcon does: onPrimary is near-black in the dark theme.
        <CircleX color="#FFFFFF" fill={colors.danger} size={16} strokeWidth={2} />
      )}
      <Text style={[type.caption, { color: adult ? colors.ink : colors.danger }]}>
        {adult ? "Verified adult (18+)" : "Verified underage"}
      </Text>
    </View>
  );
}

function Field({
  children,
  error,
  label,
  required,
}: {
  children: React.ReactNode;
  /** Shown beneath the input, where the correction has to be made. */
  error?: string;
  label: string;
  /** The red asterisk FormInput puts on a mandatory field. */
  required?: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {/* type.label, matching FormInput everywhere else. It used to be the
          eyebrow, which is upper-case and belongs to section headings — so
          every input on this screen shouted its name while the same field on
          the property form did not. */}
      {/* `muted`, the colour FormInput, GenderPicker and DateOfBirthField use
          at rest. This was `inkSoft`, so "Last four digits" read darker than
          the Gender and Date of birth labels under it. */}
      <Text style={[type.label, { color: error ? colors.danger : colors.muted }]}>
        {label}
        <RequiredMark required={required} />
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
  chevron = true,
  disabled,
  icon: Icon,
  onPress,
}: {
  /** False for a row chosen in place that goes nowhere (user, 2026-10-29: the agreement choice). */
  chevron?: boolean;
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  /** Optional, so the stay-type rows stay exactly as they were. */
  icon?: ComponentType<LucideProps>;
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
      {/* A grey ground rather than an outline. Beside a row that already has
          its own border and its own selection rule, a second outlined box read
          as another edge competing with those two. */}
      {Icon ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderCurve: "continuous",
            borderRadius: radii.card,
            height: 36,
            justifyContent: "center",
            width: 36,
          }}
        >
          <Icon color={colors.ink} size={18} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15.5 }}>
          {title}
        </Text>
        <Text style={[type.description, { color: colors.muted }]}>
          {subtitle}
        </Text>
      </View>
      {/* No tick. The rule underneath already says which one is chosen, and a
          mark that appears only on the selected row made the other one look
          disabled. The chevron stays because both rows still go somewhere. */}
      {chevron ? <ChevronDisc color={colors.kicker} direction="right" /> : null}
    </AnimatedPressable>
  );
}

type ReviewRowData = { label: string; value: string; mono?: boolean; strong?: boolean };

/**
 * A titled group of facts on the review page.
 *
 * <p>A caps label, a rule, and rows divided by hairlines — no panel. The review
 * page is already a card, and the boxed list that used to sit inside it drew a
 * second border around content that belongs to the card it is in. What a reader
 * needs here is the grouping, not another frame: the box made twelve rows one
 * undifferentiated block, which is why the rent was as hard to find as the
 * guest's email.
 */
function ReviewGroup({
  action,
  footer,
  materialIcon,
  rows,
  title,
}: {
  /** Sends the owner back to the step that decided this group. */
  action?: { label: string; onPress: () => void };
  /** A sentence under the rows, for a rule the rows imply but cannot state. */
  footer?: string;
  materialIcon?: ComponentProps<typeof MaterialCommunityIcons>["name"];
  rows: ReviewRowData[];
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        {materialIcon ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.primarySoft,
              borderRadius: 999,
              height: 34,
              justifyContent: "center",
              width: 34,
            }}
          >
            <MaterialCommunityIcons color={colors.primary} name={materialIcon} size={20} />
          </View>
        ) : null}
        {/* Ink and Bold, where an eyebrow is normally grey and SemiBold. These
            labels are not chrome above a section — they are the only thing
            dividing four groups of rows set in the same size, so they have to
            outweigh the rows rather than sit quietly over them. */}
        <Text style={[type.eyebrow, { color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 12.5, letterSpacing: 0.7 }]}>
          {title}
        </Text>
        {action ? (
          <AnimatedPressable
            accessibilityRole="button"
            onPress={action.onPress}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              justifyContent: "center",
              marginTop: 5,
              minHeight: 28,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text style={[type.caption, { color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12 }]}>
              {action.label}
            </Text>
          </AnimatedPressable>
        ) : null}
      </View>
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <View style={{ backgroundColor: colors.border, height: 1 }} /> : null}
          <ReviewRow label={row.label} mono={row.mono} strong={row.strong} value={row.value} />
        </View>
      ))}

      {/* A confirmation the owner made, so it reads as one: a pale green band
          with a filled tick, not a grey line under the rows (user, 2026-10-28). */}
      {footer ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.successSoft,
            borderCurve: "continuous",
            borderRadius: radii.card,
            flexDirection: "row",
            gap: spacing.sm,
            marginTop: spacing.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <View style={{ alignItems: "center", backgroundColor: colors.successText, borderRadius: 999, height: 22, justifyContent: "center", width: 22 }}>
            <Check color="#FFFFFF" size={13} strokeWidth={3} />
          </View>
          <Text style={[type.caption, { color: colors.successText, flex: 1, fontFamily: fonts.sansSemiBold, lineHeight: 18 }]}>
            {footer}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Label left, answer right. `strong` is for the one figure that matters most. */
function ReviewRow({ label, mono, strong, value }: ReviewRowData) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        alignItems: "flex-start",
        flexDirection: "row",
        gap: spacing.md,
        justifyContent: "space-between",
        paddingVertical: 11,
      }}
    >
      <Text style={[type.body, { color: colors.muted, flexShrink: 1, fontSize: 14 }]}>{label}</Text>
      <Text
        style={[
          type.body,
          {
            color: colors.ink,
            flexShrink: 1,
            fontFamily: mono ? fonts.mono : strong ? fonts.display : fonts.sansBold,
            fontSize: strong ? 15 : 14,
            textAlign: "right",
          },
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
