import type { AuthUser, Gender, UserIdentity } from "@/store/services/auth-api";
import type { BookingFormOptions, BookingFormRoom, CreateBookingRequestPayload } from "@/store/services/booking-api";
import { bookingDayLabel, bookingRangeLabel, parseBookingRent } from "@/features/booking/booking-ui";

export type BookingDraft = {
  name: string;
  phone: string;
  email: string;
  gender: Gender | null;
  dateOfBirth: string;
  roomId: string;
  exitRequestId: string | null;
  moveInDate: string;
  negotiate: boolean;
  proposedRent: string;
  agreementMonths: number | null;
};

/** What a request says about the person. Carried from their profile, never typed into the form. */
export type BookingPerson = Pick<BookingDraft, "name" | "phone" | "email" | "gender" | "dateOfBirth">;

/** What the person chooses in the form. */
export type BookingChoices = Omit<BookingDraft, keyof BookingPerson>;

/**
 * The person's details, read from their profile every time (user, 2026-10-10:
 * "auto carried in the booking first step and should not be editable there").
 * Read on each render and not copied once, so a detail added in the profile
 * is there when they come back.
 */
export function bookingPerson(identity: UserIdentity | null, authUser: Pick<AuthUser, "fullName" | "phone"> | null): BookingPerson {
  return { name: identity?.fullName ?? authUser?.fullName ?? "", phone: identity?.phone ?? authUser?.phone ?? "", email: identity?.email ?? "", gender: identity?.gender ?? null, dateOfBirth: identity?.dateOfBirth ?? "" };
}

export function validBookingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Same clamped eighteenth birthday as LocalDate.plusYears on the server. */
export function adultOn(dateOfBirth: string, today: string) {
  if (!validBookingDate(dateOfBirth) || !validBookingDate(today) || dateOfBirth >= today) return false;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const eighteenth = year + 18;
  const lastDay = new Date(Date.UTC(eighteenth, month, 0)).getUTCDate();
  return `${eighteenth}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}` <= today;
}

/** Intersect the server's shared bounds and the chosen departure's bounds. */
export function bookingBedWindow(options: BookingFormOptions, room: BookingFormRoom | undefined, exitRequestId: string | null) {
  if (!room?.available || !options.earliestMoveInDate || !options.latestMoveInDate) return null;
  const future = exitRequestId ? room.futureBeds.find((bed) => bed.exitRequestId === exitRequestId) : null;
  if (exitRequestId ? !future : room.freeBeds < 1) return null;
  const earliest = future && future.earliestMoveInDate > options.earliestMoveInDate ? future.earliestMoveInDate : options.earliestMoveInDate;
  const latest = future && future.latestMoveInDate < options.latestMoveInDate ? future.latestMoveInDate : options.latestMoveInDate;
  return validBookingDate(earliest) && validBookingDate(latest) && earliest <= latest ? { earliest, latest } : null;
}

/** True where the first day offered is the day after the person's stay elsewhere ends, so the form can say why. */
export function bookingStayHoldsStart(options: Pick<BookingFormOptions, "currentStayEndsOn" | "earliestMoveInDate">) {
  if (!options.currentStayEndsOn || !options.earliestMoveInDate || !validBookingDate(options.currentStayEndsOn)) return false;
  const next = new Date(`${options.currentStayEndsOn}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10) === options.earliestMoveInDate;
}

export type BookingBed = { exitRequestId: string | null; checkoutDate: string | null; earliest: string; latest: string };

/** The beds in a room that a request can name, each with the dates it takes. A free bed first. */
export function bookingRoomBeds(options: BookingFormOptions, room: BookingFormRoom | undefined): BookingBed[] {
  if (!room?.available) return [];
  const beds: BookingBed[] = [];
  const now = bookingBedWindow(options, room, null);
  if (now) beds.push({ exitRequestId: null, checkoutDate: null, ...now });
  const vacating: BookingBed[] = [];
  for (const bed of room.futureBeds) {
    const later = bookingBedWindow(options, room, bed.exitRequestId);
    if (later) vacating.push({ exitRequestId: bed.exitRequestId, checkoutDate: bed.checkoutDate ?? null, ...later });
  }
  // The soonest first, so the room's own line names the first day a bed is free.
  return [...beds, ...vacating.sort((a, b) => a.earliest.localeCompare(b.earliest))];
}

export type BookingRoomStatus = { tone: "success" | "warning" | "neutral"; label: string; note: string | null; selectable: boolean };

/** What a room's card says: a bed free now, the first day one is free, or why none can be asked for. */
export function bookingRoomStatus(options: BookingFormOptions, room: BookingFormRoom): BookingRoomStatus {
  const beds = bookingRoomBeds(options, room);
  const count = (number: number) => `${number} bed${number === 1 ? "" : "s"}`;
  if (beds[0]?.exitRequestId === null) return { tone: "success", label: `${count(room.freeBeds)} available now`, note: null, selectable: true };
  if (beds[0]) return { tone: "warning", label: `${count(beds.length)} from ${bookingDayLabel(beds[0].earliest)}`, note: beds[0].checkoutDate ? `Confirmed move-out: ${bookingDayLabel(beds[0].checkoutDate)}` : null, selectable: true };
  if (room.unavailableReason === "MAINTENANCE") return { tone: "neutral", label: "Under maintenance", note: null, selectable: false };
  return { tone: "neutral", label: "No vacancy", note: room.available ? "No bed inside your move-in dates" : "No eligible future bed", selectable: false };
}

/**
 * When an unanswered request ends: seven days after it is sent, or 6 pm in
 * India two days before move-in when that comes first. Shown before sending.
 * The server sets the real time when the request is made.
 */
export function bookingReviewDeadline(sentAt: number, moveInDate: string) {
  const sevenDays = sentAt + 7 * 86_400_000;
  if (!validBookingDate(moveInDate)) return { at: sevenDays, beforeMoveIn: false };
  const [year, month, day] = moveInDate.split("-").map(Number);
  // 18:00 in India is 12:30 UTC.
  const cutoff = Date.UTC(year, month - 1, day - 2, 12, 30);
  return cutoff < sevenDays ? { at: cutoff, beforeMoveIn: true } : { at: sevenDays, beforeMoveIn: false };
}

export function validateBookingStep(step: number, draft: BookingDraft, options: BookingFormOptions, today: string) {
  const errors: Partial<Record<keyof BookingDraft, string>> = {};
  if (step === 0 || step === 3) {
    // These come from the profile, so each line says to fix it there.
    if (!draft.name.trim() || draft.name.trim().length > 120) errors.name = "Add your full name in your profile (up to 120 characters).";
    if (!draft.phone.trim()) errors.phone = "Add your phone number in your profile.";
    // The same three refusals the server gives, said before anything is sent.
    if (!draft.gender || draft.gender === "UNDECLARED") errors.gender = "Add your gender in your profile to continue.";
    else if (options.pgFor === "MALE" && draft.gender !== "MALE") errors.gender = "This property takes men only.";
    else if (options.pgFor === "FEMALE" && draft.gender !== "FEMALE") errors.gender = "This property takes women only.";
    if (!draft.dateOfBirth) errors.dateOfBirth = "Add your date of birth in your profile to continue.";
    else if (!adultOn(draft.dateOfBirth, today)) errors.dateOfBirth = "You must be 18 or older to request a booking.";
  }
  if (step === 1 || step === 3) {
    const room = options.rooms.find((item) => item.roomId === draft.roomId);
    const window = bookingBedWindow(options, room, draft.exitRequestId);
    if (!window) errors.roomId = "Choose a bed with bookable dates.";
    else if (!validBookingDate(draft.moveInDate) || draft.moveInDate < window.earliest || draft.moveInDate > window.latest) errors.moveInDate = `Choose a date from ${bookingRangeLabel(window.earliest, window.latest)}.`;
  }
  if (step === 2 || step === 3) {
    if (draft.negotiate && parseBookingRent(draft.proposedRent) == null) errors.proposedRent = "Enter a monthly rent greater than zero, with up to two decimal places.";
    if (draft.agreementMonths != null && (!Number.isInteger(draft.agreementMonths) || draft.agreementMonths < 1 || draft.agreementMonths > 11)) errors.agreementMonths = "Choose a term from 1 to 11 months.";
  }
  return errors;
}

export function bookingRequestBody(draft: BookingDraft, enquiryId: string, idempotencyKey: string): CreateBookingRequestPayload {
  return { enquiryId, idempotencyKey, roomId: draft.roomId, exitRequestId: draft.exitRequestId, moveInDate: draft.moveInDate, name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() || null, gender: draft.gender!, dateOfBirth: draft.dateOfBirth, proposedRentPaise: draft.negotiate ? parseBookingRent(draft.proposedRent)! : null, agreementMonths: draft.agreementMonths };
}

export function newBookingSubmissionKey() {
  return `booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
