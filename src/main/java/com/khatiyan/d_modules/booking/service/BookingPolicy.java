package com.khatiyan.d_modules.booking.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Objects;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.model.BookingMoveInWindow;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTiming;
import com.khatiyan.d_modules.booking.model.BookingTokenHold;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.d_modules.property.model.PgFor;

/**
 * Server-owned booking limits. Calendar bounds, the request clock and the
 * token clock are deliberately different clocks; none is reset by viewing or
 * negotiation.
 */
@Component
public final class BookingPolicy {

    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    /**
     * Days the property gets after the move-in day to free a booked bed that
     * is still occupied (user, 2026-10-10). Past them, the tenant may leave
     * with the token owed back.
     */
    public static final int BED_NOT_READY_EXTRA_DAYS = 3;

    /**
     * "Did not arrive" opens this many days after the move-in date (user, 2026-10-28, was 2): a 27 Oct
     * move-in can be closed as a no-show from 28 Oct, whether or not its bed was freed.
     */
    public static final int DID_NOT_ARRIVE_AFTER_DAYS = 1;
    /**
     * How far a tenant may push their move-in date, once (user, 2026-10-10).
     * At the longest booking the default allows, 21 days ahead, that makes 28.
     */
    public static final int DATE_PUSH_MAX_DAYS = 7;

    /** The latest day a move-in date first asked for on this day may be pushed to. */
    public static LocalDate latestPushDate(LocalDate originalMoveInDate) {
        return originalMoveInDate.plusDays(DATE_PUSH_MAX_DAYS);
    }

    /** A push goes to a later day, and no further than seven days from the date first asked for. */
    public static void requireDatePush(LocalDate originalMoveInDate, LocalDate requested) {
        if (requested == null || !requested.isAfter(originalMoveInDate)
                || requested.isAfter(latestPushDate(originalMoveInDate))) {
            throw new ValidationException("Choose a later move-in date, up to " + latestPushDate(originalMoveInDate)
                    + ".");
        }
    }
    public static final int POST_VISIT_DAYS = PostVisitBookingWindow.DAYS;
    // PG demand is short notice. Three days still leaves room to agree terms and pay the token.
    public static final int MINIMUM_MOVE_IN_DAYS = 3;
    /** How far ahead a tenant may choose, until the owner sets their own limit. */
    public static final int DEFAULT_MAXIMUM_MOVE_IN_DAYS = 21;
    /** The most an owner may set that limit to. */
    public static final int LONGEST_MAXIMUM_MOVE_IN_DAYS = 90;
    public static final Duration PENDING_LIFETIME = Duration.ofDays(7);
    /**
     * A request still open at six in the evening, two days before its move-in
     * day, is over. Terms agreed any later would leave the tenant less than a
     * full day to pay the token (user's rule, 2026-10-10).
     */
    public static final int PENDING_CUTOFF_DAYS_BEFORE_MOVE_IN = 2;
    public static final LocalTime PENDING_CUTOFF_TIME = LocalTime.of(18, 0);
    /** How long an agreed bed is held while the token is awaited. */
    public static final Duration TOKEN_WINDOW = Duration.ofHours(48);
    /** The least time a tenant gets back after the property refuses a claim. */
    public static final Duration TOKEN_TIME_AFTER_REFUSED_CLAIM = Duration.ofHours(12);
    public static final int MAX_REQUESTS_PER_VISIT = 2;
    /** How long a tenant who walked away from a confirmed bed held for nothing waits before asking there again. */
    public static final Duration TENANT_CANCELLATION_COOLDOWN = Duration.ofDays(30);

    private final Clock clock;

    public BookingPolicy(Clock clock) {
        this.clock = Objects.requireNonNull(clock);
    }

    public BookingTiming newRequestTiming() {
        return timingFor(clock.instant());
    }

    public BookingTiming newRequestTiming(int maximumAdvanceDays) {
        return timingFor(clock.instant(), maximumAdvanceDays);
    }

    public BookingTiming timingFor(Instant submittedAt) {
        return timingFor(submittedAt, DEFAULT_MAXIMUM_MOVE_IN_DAYS);
    }

    /**
     * The bounds a room picker works inside, before a move-in date is chosen.
     * Its expiry is the longest a request can last, see the form that takes
     * the chosen date.
     *
     * @param maximumAdvanceDays the owner's limit as it stood at submission
     */
    public BookingTiming timingFor(Instant submittedAt, int maximumAdvanceDays) {
        Objects.requireNonNull(submittedAt);
        requireMaximumAdvanceDays(maximumAdvanceDays);
        LocalDate bookingDate = submittedAt.atZone(ZONE).toLocalDate();
        return new BookingTiming(submittedAt, bookingDate,
                bookingDate.plusDays(MINIMUM_MOVE_IN_DAYS),
                bookingDate.plusDays(maximumAdvanceDays),
                submittedAt.plus(PENDING_LIFETIME));
    }

    public BookingTiming timingFor(Instant submittedAt, LocalDate moveInDate) {
        return timingFor(submittedAt, DEFAULT_MAXIMUM_MOVE_IN_DAYS, moveInDate);
    }

    /**
     * The request's own clock once its move-in date is chosen, and the value
     * to persist: seven days, or the cut-off two evenings before move-in when
     * that comes first.
     */
    public BookingTiming timingFor(Instant submittedAt, int maximumAdvanceDays, LocalDate moveInDate) {
        BookingTiming open = timingFor(submittedAt, maximumAdvanceDays);
        requireMoveInDate(liveMoveInWindow(open), moveInDate);
        Instant cutoff = moveInDate.minusDays(PENDING_CUTOFF_DAYS_BEFORE_MOVE_IN)
                .atTime(PENDING_CUTOFF_TIME).atZone(ZONE).toInstant();
        return new BookingTiming(open.submittedAt(), open.bookingDate(),
                open.earliestMoveInDate(), open.latestMoveInDate(),
                cutoff.isBefore(open.expiresAt()) ? cutoff : open.expiresAt());
    }

    /** Never fewer than the notice a request needs, and never further out than an owner may promise a bed. */
    public static int requireMaximumAdvanceDays(Integer days) {
        if (days == null || days < MINIMUM_MOVE_IN_DAYS || days > LONGEST_MAXIMUM_MOVE_IN_DAYS) {
            throw new ValidationException("Maximum advance booking must be between "
                    + MINIMUM_MOVE_IN_DAYS + " and " + LONGEST_MAXIMUM_MOVE_IN_DAYS + " days.");
        }
        return days;
    }

    public BookingMoveInWindow liveMoveInWindow(BookingTiming timing) {
        return new BookingMoveInWindow(timing.earliestMoveInDate(), timing.latestMoveInDate());
    }

    /**
     * Apply only to a bed backed by an already-confirmed, irreversible exit.
     * Checking that source and reserving its bed are inventory work, not date
     * arithmetic, and are required before a public booking endpoint is added.
     *
     * <p>An early checkout never replaces the +3 floor or obliges the tenant
     * to arrive the very next day. ANY later date through the limit is valid.
     */
    public Optional<BookingMoveInWindow> futureMoveInWindow(BookingTiming timing, LocalDate confirmedMoveOutDate) {
        Objects.requireNonNull(confirmedMoveOutDate);
        LocalDate availableFrom = confirmedMoveOutDate.plusDays(1);
        LocalDate earliest = availableFrom.isAfter(timing.earliestMoveInDate())
                ? availableFrom : timing.earliestMoveInDate();
        if (earliest.isAfter(timing.latestMoveInDate())) {
            return Optional.empty();
        }
        return Optional.of(new BookingMoveInWindow(earliest, timing.latestMoveInDate()));
    }

    public void requireMoveInDate(BookingMoveInWindow window, LocalDate moveInDate) {
        if (!window.contains(moveInDate)) {
            throw new ValidationException("Choose a move-in date between " + window.earliest()
                    + " and " + window.latest() + ", inclusive.");
        }
    }

    /**
     * When the hold taken at agreement lapses without a token: forty-eight
     * hours, and never into the move-in day itself.
     */
    public static Instant tokenDueAt(Instant agreedAt, LocalDate moveInDate) {
        Objects.requireNonNull(agreedAt);
        Instant moveInDay = Objects.requireNonNull(moveInDate).atStartOfDay(ZONE).toInstant();
        if (!agreedAt.isBefore(moveInDay)) {
            throw new ValidationException("The move-in day has begun, so these terms can no longer be agreed.");
        }
        Instant window = agreedAt.plus(TOKEN_WINDOW);
        return moveInDay.isBefore(window) ? moveInDay : window;
    }

    /**
     * A claim stops the token clock. A refused one gives back the time that
     * was left when it was raised, and never less than twelve hours. The
     * move-in day does not cap this: a booking still waiting on its token
     * simply does not convert yet.
     */
    public static Instant tokenDueAfterRefusedClaim(Instant dueAt, Instant claimedAt, Instant refusedAt) {
        Objects.requireNonNull(dueAt);
        Objects.requireNonNull(claimedAt);
        Objects.requireNonNull(refusedAt);
        if (refusedAt.isBefore(claimedAt)) {
            throw new IllegalArgumentException("A claim cannot be refused before it was raised");
        }
        Duration left = Duration.between(claimedAt, dueAt);
        return refusedAt.plus(left.compareTo(TOKEN_TIME_AFTER_REFUSED_CLAIM) > 0
                ? left : TOKEN_TIME_AFTER_REFUSED_CLAIM);
    }

    public LocalDate postVisitWindowEndsOn(LocalDate visitedOn) {
        return PostVisitBookingWindow.endsOn(visitedOn);
    }

    /** Exclusive midnight after the last eligible local date, not 30 x 24 hours. */
    public Instant postVisitWindowExpiresAt(LocalDate visitedOn) {
        return PostVisitBookingWindow.expiresAt(visitedOn);
    }

    /** The date alone is not proof of attendance or ownership; eligibility must verify both. */
    public boolean isWithinPostVisitWindow(LocalDate attendedVisitDate) {
        if (attendedVisitDate == null) {
            return false;
        }
        Instant now = clock.instant();
        return !now.atZone(ZONE).toLocalDate().isBefore(attendedVisitDate)
                && now.isBefore(postVisitWindowExpiresAt(attendedVisitDate));
    }

    public void requirePostVisitWindow(LocalDate attendedVisitDate) {
        if (!isWithinPostVisitWindow(attendedVisitDate)) {
            throw new ValidationException("Request a booking within 30 days of your attended visit.");
        }
    }

    /** Validate against the original request date, without claiming ID verification. */
    public void requireAdult(LocalDate dateOfBirth, BookingTiming timing) {
        if (dateOfBirth == null || !dateOfBirth.isBefore(timing.bookingDate())) {
            throw new ValidationException("Enter a valid date of birth.");
        }
        // Same eighteenth-birthday calculation used by tenancy's ID-check rule.
        if (dateOfBirth.plusYears(18).isAfter(timing.bookingDate())) {
            throw new ValidationException("You must be 18 or older to request a booking.");
        }
    }

    /**
     * A men's PG takes men and a women's PG takes women. One open to anyone
     * takes everyone, but the person still says who they are: the agreement
     * and the ID check on arrival both need it.
     */
    public static void requireGenderFits(PgFor pgFor, Gender gender) {
        if (gender == null || gender == Gender.UNDECLARED) {
            throw new ValidationException("Select your gender.");
        }
        if (pgFor == PgFor.MALE && gender != Gender.MALE) {
            throw new ValidationException("This property takes men only.");
        }
        if (pgFor == PgFor.FEMALE && gender != Gender.FEMALE) {
            throw new ValidationException("This property takes women only.");
        }
    }

    /** Null is indefinite, matching compliance's existing agreement template shape. */
    public void requireAgreementValidity(Integer months) {
        if (months != null && (months < 1 || months > 11)) {
            throw new ValidationException("Agreement term must be between 1 and 11 months.");
        }
    }

    public BookingStatus effectiveStatus(BookingStatus storedStatus, BookingTiming timing, BookingTokenHold tokenHold) {
        return effectiveStatusAt(storedStatus, timing, tokenHold, clock.instant());
    }

    /**
     * Read/action guards cannot wait for the expiry sweep. A request lapses on
     * its own clock, an agreed booking on its token clock unless a claim is
     * waiting, and a confirmed booking never does.
     */
    public static BookingStatus effectiveStatusAt(
            BookingStatus storedStatus, BookingTiming timing, BookingTokenHold tokenHold, Instant now) {
        Objects.requireNonNull(storedStatus);
        Objects.requireNonNull(timing);
        Objects.requireNonNull(tokenHold);
        Objects.requireNonNull(now);
        if (storedStatus.isPending() && !now.isBefore(timing.expiresAt())) {
            return BookingStatus.EXPIRED;
        }
        if (storedStatus == BookingStatus.AWAITING_TOKEN) {
            if (!tokenHold.isRunning()) {
                throw new IllegalArgumentException("A booking awaiting its token must carry the token deadline");
            }
            if (tokenHold.lapsedAt(now)) {
                return BookingStatus.EXPIRED;
            }
        }
        return storedStatus;
    }
}
