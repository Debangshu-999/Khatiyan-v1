package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingBedOptionResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingFormOptionsResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.support.IntegrationTest;

/**
 * What the screens read before anything is sent (frontend readiness review,
 * 2026-10-10): the booking form, the picker for another bed, and the
 * property's list narrowed on the server.
 *
 * <p>The rule behind every form case here is one sentence: the form never
 * offers what sending would refuse, and never refuses what sending would
 * take. So each case reads the form and, where it can, sends the request the
 * form described.
 *
 * <p>The property is Fixture PG with one room of three beds at Rs 8,000, a
 * Rs 10,000 deposit, and a Rs 2,000 token that does not come back. The tenant
 * visited yesterday.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingFormOptionsIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingInventoryService inventory;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID tenant;
    private UUID enquiry;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerOf(property);
        jdbc.update("UPDATE property.properties SET standard_deposit_paise = 1000000 WHERE id = ?", property);
        room = fx.room(property, 3, 0);
        tenant = fx.person();
        enquiry = fx.attendedEnquiry(property, tenant, today.minusDays(1));
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    // ---- The rooms -------------------------------------------------------------

    @Test
    void theFormShowsEveryActiveRoomAndSaysWhichCannotBeAskedFor() {
        jdbc.update("INSERT INTO property.room_amenities (room_id, amenity) VALUES (?, 'TV'), (?, 'CUPBOARD')",
                room, room);
        jdbc.update("INSERT INTO property.room_custom_amenities (room_id, name) VALUES (?, 'Balcony')", room);
        UUID full = fx.room(property, 1, 1);
        UUID closed = fx.room(property, 2, 0);
        jdbc.update("UPDATE property.rooms SET status = 'MAINTENANCE' WHERE id = ?", closed);
        UUID switchedOff = fx.room(property, 2, 0);
        jdbc.update("UPDATE property.rooms SET is_active = false WHERE id = ?", switchedOff);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isTrue();
        assertThat(form.whyNot()).isNull();
        assertThat(form.enquiryId()).isEqualTo(enquiry);
        assertThat(form.propertyId()).isEqualTo(property);
        assertThat(form.propertyName()).isEqualTo("Fixture PG");
        assertThat(form.requestsLeft()).isEqualTo(2);
        assertThat(form.existingRequestId()).isNull();
        assertThat(form.earliestMoveInDate()).isEqualTo(today.plusDays(3));
        assertThat(form.latestMoveInDate()).isEqualTo(today.plusDays(21));
        assertThat(form.depositPaise()).isEqualTo(1_000_000L);
        assertThat(form.tokenRequired()).isTrue();
        assertThat(form.tokenAmountPaise()).isEqualTo(200_000L);
        assertThat(form.tokenRefundable()).isFalse();

        // A room that is switched off is not this form's to show. One that is full or closed is, as such.
        assertThat(form.rooms()).extracting(BookingFormOptionsResponse.Room::roomId)
                .containsExactlyInAnyOrder(room, full, closed);
        assertThat(roomOn(form, room)).satisfies(shown -> {
            assertThat(shown.roomNumber()).isEqualTo(numberOf(room));
            assertThat(shown.capacity()).isEqualTo(3);
            assertThat(shown.listedRentPaise()).isEqualTo(800_000L);
            assertThat(shown.amenities()).containsExactly("CUPBOARD", "TV");
            assertThat(shown.customAmenities()).containsExactly("Balcony");
            assertThat(shown.freeBeds()).isEqualTo(3);
            assertThat(shown.futureBeds()).isEmpty();
            assertThat(shown.available()).isTrue();
            assertThat(shown.unavailableReason()).isNull();
        });
        assertThat(roomOn(form, full)).satisfies(shown -> {
            assertThat(shown.capacity()).isEqualTo(1);
            assertThat(shown.freeBeds()).isZero();
            assertThat(shown.available()).isFalse();
            assertThat(shown.unavailableReason()).isEqualTo("FULL");
        });
        assertThat(roomOn(form, closed)).satisfies(shown -> {
            assertThat(shown.capacity()).isEqualTo(2);
            assertThat(shown.freeBeds()).isZero();
            assertThat(shown.available()).isFalse();
            assertThat(shown.unavailableReason()).isEqualTo("MAINTENANCE");
        });
    }

    @Test
    void aPropertyWithNothingToBookSaysSoAndStillShowsItsRooms() {
        jdbc.update("UPDATE property.rooms SET occupied_count = 3, status = 'OCCUPIED' WHERE id = ?", room);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        assertThat(form.whyNot()).contains("No bed is free");
        assertThat(form.rooms()).singleElement().satisfies(shown -> {
            assertThat(shown.available()).isFalse();
            assertThat(shown.unavailableReason()).isEqualTo("FULL");
        });
    }

    // ---- Beds being vacated ------------------------------------------------------

    /**
     * The review's own example: a limit of 45 days and a checkout 30 days out.
     *
     * <p>No owner can choose 45 today (user, 2026-10-10: the window is fixed at
     * 3 to 21 days). The limit is still stored, and a later rule for booking
     * further ahead will raise it, so it is written straight to the row here.
     * What is tested is that the form and sending read the same stored limit.
     */
    @Test
    void aBedBeingVacatedIsOfferedInsideTheStoredLimitNotAnAssumedOne() {
        UUID leaving = fx.room(property, 1, 0);
        UUID exit = fx.approvedExit(property, leaving, today.plusDays(30));

        // At 21 days the departure falls after the last day that can be asked for, so the room is simply full.
        BookingFormOptionsResponse short21 = bookings.formOptions(tenant, enquiry);
        assertThat(roomOn(short21, leaving).futureBeds()).isEmpty();
        assertThat(roomOn(short21, leaving).unavailableReason()).isEqualTo("FULL");

        storedLimit(45);
        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.latestMoveInDate()).isEqualTo(today.plusDays(45));
        assertThat(roomOn(form, leaving).freeBeds()).isZero();
        assertThat(roomOn(form, leaving).available()).isTrue();
        assertThat(roomOn(form, leaving).unavailableReason()).isNull();
        assertThat(roomOn(form, leaving).futureBeds()).singleElement().satisfies(bed -> {
            assertThat(bed.exitRequestId()).isEqualTo(exit);
            assertThat(bed.earliestMoveInDate()).isEqualTo(today.plusDays(31));
            assertThat(bed.latestMoveInDate()).isEqualTo(today.plusDays(45));
        });
        // And what the form described is taken when it is sent, at both ends.
        BookingRequestResponse sent = bookings.create(tenant,
                BookingFixtures.ask(enquiry, leaving, exit, today.plusDays(45), "the-last-day-shown"));
        assertThat(sent.futureBed()).isTrue();
        assertThat(sent.latestMoveInDate()).isEqualTo(today.plusDays(45));
    }

    @Test
    void aShorterLimitCutsABedBeingVacatedToTheSameLastDayAsTheForm() {
        storedLimit(10);
        UUID leaving = fx.room(property, 1, 0);
        UUID exit = fx.approvedExit(property, leaving, today.plusDays(6));

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.latestMoveInDate()).isEqualTo(today.plusDays(10));
        assertThat(roomOn(form, leaving).futureBeds()).singleElement().satisfies(bed -> {
            assertThat(bed.exitRequestId()).isEqualTo(exit);
            assertThat(bed.earliestMoveInDate()).isEqualTo(today.plusDays(7));
            assertThat(bed.latestMoveInDate()).isEqualTo(today.plusDays(10));
        });
        assertThatThrownBy(() -> bookings.create(tenant,
                BookingFixtures.ask(enquiry, leaving, exit, today.plusDays(11), "a-day-past-the-form")))
                .isInstanceOf(ValidationException.class);
    }

    /**
     * What the form's own lines are written from (the user's demo screens,
     * 2026-10-10): the day of the visit, where the property is, the day a bed
     * being vacated is left, and the last day of the person's stay elsewhere.
     * That last one is why their first date is later than three days out, and
     * a form that cannot say so leaves them asking why (the user did, the same
     * day).
     */
    @Test
    void theFormCarriesTheVisitThePlaceAndTheDatesItsLinesAreWrittenFrom() {
        jdbc.update("UPDATE property.properties SET area = 'Salt Lake', city = 'Kolkata' WHERE id = ?", property);
        UUID leaving = fx.room(property, 1, 0);
        UUID exit = fx.approvedExit(property, leaving, today.plusDays(8));
        UUID elsewhere = fx.property();
        fx.stay(elsewhere, fx.room(elsewhere, 1, 1), tenant, "ON_NOTICE", today.plusDays(5));

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.visitedOn()).isEqualTo(today.minusDays(1));
        assertThat(form.propertyArea()).isEqualTo("Salt Lake");
        assertThat(form.propertyCity()).isEqualTo("Kolkata");
        assertThat(form.currentStayEndsOn()).isEqualTo(today.plusDays(5));
        assertThat(form.earliestMoveInDate()).isEqualTo(today.plusDays(6));
        assertThat(roomOn(form, leaving).futureBeds()).singleElement().satisfies(bed -> {
            assertThat(bed.exitRequestId()).isEqualTo(exit);
            // The day it is left, as it is. The first day it can be asked for is the form's own first day or later.
            assertThat(bed.checkoutDate()).isEqualTo(today.plusDays(8));
            assertThat(bed.earliestMoveInDate()).isEqualTo(today.plusDays(9));
        });

        // Someone with no stay anywhere has no such date, and starts three days out.
        UUID other = fx.person();
        BookingFormOptionsResponse free = bookings.formOptions(other,
                fx.attendedEnquiry(property, other, today.minusDays(2)));
        assertThat(free.currentStayEndsOn()).isNull();
        assertThat(free.visitedOn()).isEqualTo(today.minusDays(2));
        assertThat(free.earliestMoveInDate()).isEqualTo(today.plusDays(3));
    }

    @Test
    void anOwnerWhoShowsOnlyCurrentVacanciesHasNoBedsBeingVacatedOnTheForm() {
        settings.save(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, false));
        UUID leaving = fx.room(property, 1, 0);
        fx.approvedExit(property, leaving, today.plusDays(6));

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(roomOn(form, leaving).futureBeds()).isEmpty();
        assertThat(roomOn(form, leaving).unavailableReason()).isEqualTo("FULL");
        assertThat(form.canBook()).isTrue();
    }

    // ---- Who may send ------------------------------------------------------------

    @Test
    void anOpenRequestHereIsNamedSoTheFormCanLinkToIt() {
        UUID sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        assertThat(form.whyNot()).contains("already have a booking request");
        assertThat(form.existingRequestId()).isEqualTo(sent);
        assertThat(form.requestsLeft()).isEqualTo(1);
        // The bed it holds is not offered to them a second time.
        assertThat(roomOn(form, room).freeBeds()).isEqualTo(2);
    }

    /** Sending gives an unanswered request's slot back. The form counts the same way, and writes nothing. */
    @Test
    void aRequestThePropertyNeverAnsweredGivesItsSlotBackOnTheFormToo() {
        BookingRequestResponse ignored = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)));
        // Past its seven days, and the hourly sweep has not run.
        clock.set(ignored.expiresAt().plusSeconds(1));

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isTrue();
        assertThat(form.whyNot()).isNull();
        assertThat(form.existingRequestId()).isNull();
        assertThat(form.requestsLeft()).isEqualTo(2);
        // Reading changed nothing: the row is as the sweep will find it.
        assertThat(jdbc.queryForObject("SELECT status FROM booking.requests WHERE id = ?", String.class, ignored.id()))
                .isEqualTo("AWAITING_HANDLER");
        assertThat(jdbc.queryForObject("SELECT visit_slot FROM booking.requests WHERE id = ?", Integer.class,
                ignored.id())).isEqualTo(1);
        // And sending now is taken, as the form said.
        LocalDate later = LocalDate.ofInstant(clock.instant(), IST);
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, later.plusDays(10))).status())
                .isEqualTo(BookingStatus.AWAITING_HANDLER);
    }

    @Test
    void aVisitsTwoRequestsOnceUsedCloseTheForm() {
        negotiation.cancel(tenant, bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id());
        assertThat(bookings.formOptions(tenant, enquiry).requestsLeft()).isEqualTo(1);
        assertThat(bookings.formOptions(tenant, enquiry).canBook()).isTrue();
        negotiation.cancel(tenant, bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id());

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        assertThat(form.requestsLeft()).isZero();
        assertThat(form.whyNot()).contains("both booking requests");
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("both booking requests");
    }

    @Test
    void theCooldownClosesTheFormForAsLongAsItClosesSending() {
        UUID walkedAway = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        jdbc.update("UPDATE booking.requests SET status = 'CANCELLED', closed_at = now(),"
                + " end_cause = 'TENANT_CANCELLED', cooldown_until = ? WHERE id = ?",
                Timestamp.from(Instant.now().plus(30, ChronoUnit.DAYS)), walkedAway);
        inventory.release(walkedAway, property);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);
        assertThat(form.canBook()).isFalse();
        assertThat(form.whyNot()).contains("cancelled a confirmed booking");
        assertThat(form.existingRequestId()).isNull();
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("cancelled a confirmed booking");

        jdbc.update("UPDATE booking.requests SET cooldown_until = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(1)), walkedAway);
        assertThat(bookings.formOptions(tenant, enquiry).canBook()).isTrue();
    }

    @Test
    void aConfirmedBookingAnywhereClosesTheForm() {
        UUID elsewhere = fx.property();
        settings.create(fx.ownerOf(elsewhere), elsewhere, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID confirmed = bookings.create(tenant, BookingFixtures.ask(
                fx.attendedEnquiry(elsewhere, tenant, today), fx.room(elsewhere, 2, 0), today.plusDays(10))).id();
        assertThat(negotiation.acceptForProperty(fx.ownerOf(elsewhere), elsewhere, confirmed, 1).status())
                .isEqualTo(BookingStatus.CONFIRMED);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        assertThat(form.whyNot()).contains("confirmed booking");
        assertThat(form.existingRequestId()).isNull();
    }

    @Test
    void someoneAlreadyStayingHereIsToldSoByTheForm() {
        fx.stay(property, room, tenant, "ACTIVE", null);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        assertThat(form.whyNot()).contains("already stay at this property");
    }

    @Test
    void someoneStayingElsewhereIsOfferedOnlyDatesAfterTheirApprovedCheckout() {
        UUID elsewhere = fx.property();
        UUID stay = fx.stay(elsewhere, fx.room(elsewhere, 1, 1), tenant, "ACTIVE", null);

        BookingFormOptionsResponse noExit = bookings.formOptions(tenant, enquiry);
        assertThat(noExit.canBook()).isFalse();
        assertThat(noExit.whyNot()).contains("no approved move-out date");

        jdbc.update("UPDATE tenancy.tenancies SET status = 'ON_NOTICE', end_date = ? WHERE id = ?",
                today.plusDays(9), stay);
        BookingFormOptionsResponse leaving = bookings.formOptions(tenant, enquiry);
        assertThat(leaving.canBook()).isTrue();
        // The first day the form offers is the first day sending takes.
        assertThat(leaving.earliestMoveInDate()).isEqualTo(today.plusDays(10));
        assertThat(leaving.latestMoveInDate()).isEqualTo(today.plusDays(21));
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(9))))
                .isInstanceOf(ValidationException.class);
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, leaving.earliestMoveInDate()))
                .moveInDate()).isEqualTo(today.plusDays(10));
    }

    /**
     * Found by the user on 2026-10-10: a tenant on a one-month fixed term, with
     * its end known from the day it began, was told their stay had "no approved
     * move-out date yet". A fixed term needs no exit approved. Its last day is
     * the stay's planned end, and the stay's own one rule for when it ends
     * (a notice's date, else the planned end) is the one to read.
     */
    @Test
    void aFixedTermStayEndsOnItsOwnDateWithNoExitToApprove() {
        UUID elsewhere = fx.property();
        UUID stay = fx.stay(elsewhere, fx.room(elsewhere, 1, 1), tenant, "ACTIVE", null);
        // As accepting a fixed-term agreement leaves it: still active, no notice given, the term's end planned.
        jdbc.update("UPDATE tenancy.tenancies SET agreement_validity_months = 1, agreement_end_date = ?,"
                + " planned_end_date = ? WHERE id = ?", today.plusDays(9), today.plusDays(9), stay);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.whyNot()).isNull();
        assertThat(form.canBook()).isTrue();
        assertThat(form.earliestMoveInDate()).isEqualTo(today.plusDays(10));
        assertThat(form.latestMoveInDate()).isEqualTo(today.plusDays(21));
        // Sending agrees with the form: the term's last day is still theirs there, the day after is not.
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(9))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("after " + today.plusDays(9));
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).moveInDate())
                .isEqualTo(today.plusDays(10));
    }

    /** An early exit approved inside a fixed term ends the stay sooner, and that is the date that counts. */
    @Test
    void anApprovedEarlyExitFromAFixedTermCountsBeforeTheTermsOwnEnd() {
        UUID elsewhere = fx.property();
        UUID stay = fx.stay(elsewhere, fx.room(elsewhere, 1, 1), tenant, "ON_PREMATURE_NOTICE", today.plusDays(5));
        jdbc.update("UPDATE tenancy.tenancies SET agreement_validity_months = 3, agreement_end_date = ?,"
                + " planned_end_date = ? WHERE id = ?", today.plusDays(60), today.plusDays(60), stay);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isTrue();
        assertThat(form.earliestMoveInDate()).isEqualTo(today.plusDays(6));
    }

    /** A stay with no fixed term and no notice has no date to book after, as before. */
    @Test
    void anOpenEndedStayWithNoNoticeStillHasNoDateToBookAfter() {
        UUID elsewhere = fx.property();
        fx.stay(elsewhere, fx.room(elsewhere, 1, 1), tenant, "ACTIVE", null);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        assertThat(form.whyNot()).contains("no approved move-out date");
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no approved move-out date");
    }

    @Test
    void aStayThatEndsAfterTheLastBookableDayLeavesNoDateToOffer() {
        UUID elsewhere = fx.property();
        UUID stay = fx.stay(elsewhere, fx.room(elsewhere, 1, 1), tenant, "ON_NOTICE", today.plusDays(25));
        assertThat(stay).isNotNull();

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        // It says when the request can be sent, not only that it cannot be: the day whose
        // twenty-first day out is the day after the stay ends (the user asked what happens, 2026-10-10).
        assertThat(form.whyNot()).isEqualTo("Your current stay ends on " + day(today.plusDays(25))
                + ". Move-in can be at most 21 days ahead, so you can send this request from "
                + day(today.plusDays(5)) + ".");
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(21))))
                .isInstanceOf(ValidationException.class);

        // On that day the form opens, for the one date left: the day after the stay ends.
        clock.set(today.plusDays(5).atStartOfDay(IST).toInstant());
        BookingFormOptionsResponse later = bookings.formOptions(tenant, enquiry);
        assertThat(later.canBook()).isTrue();
        assertThat(later.earliestMoveInDate()).isEqualTo(today.plusDays(26));
        assertThat(later.latestMoveInDate()).isEqualTo(today.plusDays(26));
    }

    /**
     * A stay that ends later than this visit can ever reach: the window is 30
     * days from the visit, and a request sent on its last day asks for at most
     * 21 days on. The form says so and does not name a day that never comes.
     */
    @Test
    void aStayThatEndsBeyondWhatThisVisitCanReachIsToldSo() {
        UUID elsewhere = fx.property();
        fx.stay(elsewhere, fx.room(elsewhere, 1, 1), tenant, "ON_NOTICE", today.plusDays(60));

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(form.canBook()).isFalse();
        assertThat(form.whyNot()).isEqualTo("Your current stay ends on " + day(today.plusDays(60))
                + ". That is too far ahead to book from this visit, whose booking window ends on "
                + day(form.windowEndsOn()) + ".");
    }

    /**
     * A room's photos are its type's, in the order the owner arranged them
     * (user, 2026-10-10: "a carousel of the images for that room type"). A
     * room cut from no type has none.
     */
    @Test
    void aRoomCarriesItsTypesPhotosInTheOwnersOrder() {
        UUID type = UUID.randomUUID();
        jdbc.update("INSERT INTO property.room_molds (id, property_id, sharing_type, conditioning, bed_count,"
                + " base_rent_paise) VALUES (?, ?, 'TRIPLE', 'AC', 3, 800000)", type, property);
        // Written out of order, so only the position can put them right.
        jdbc.update("INSERT INTO property.room_mold_images (mold_id, position, url) VALUES"
                + " (?, 1, 'https://img.example/second.jpg'), (?, 0, 'https://img.example/first.jpg')", type, type);
        jdbc.update("UPDATE property.rooms SET mold_id = ? WHERE id = ?", type, room);
        UUID plain = fx.room(property, 2, 0);

        BookingFormOptionsResponse form = bookings.formOptions(tenant, enquiry);

        assertThat(roomOn(form, room).imageUrls())
                .containsExactly("https://img.example/first.jpg", "https://img.example/second.jpg");
        assertThat(roomOn(form, plain).imageUrls()).isEmpty();
    }

    @Test
    void aVisitThatCannotBookGetsAClosedFormAndAStrangerGetsNothing() {
        UUID stranger = fx.person();
        assertThatThrownBy(() -> bookings.formOptions(stranger, enquiry)).isInstanceOf(NotFoundException.class);

        BookingFormOptionsResponse notVisited = bookings.formOptions(stranger, fx.enquiry(property, stranger));
        assertThat(notVisited.canBook()).isFalse();
        assertThat(notVisited.whyNot()).isNotBlank();
        assertThat(notVisited.rooms()).isEmpty();

        jdbc.update("DELETE FROM booking.settings WHERE property_id = ?", property);
        BookingFormOptionsResponse notSetUp = bookings.formOptions(tenant, enquiry);
        assertThat(notSetUp.canBook()).isFalse();
        assertThat(notSetUp.whyNot()).isEqualTo("This property is not available for booking yet.");
    }

    // ---- Picking another bed -------------------------------------------------------

    /** Handling bookings does not come with the rooms screen, so the picker has a read of its own. */
    @Test
    void whoeverHandlesABookingPicksAnotherBedWithoutRoomsAccess() {
        UUID other = fx.room(property, 2, 0);
        UUID oneLeft = fx.room(property, 3, 2);
        fx.room(property, 1, 1);
        UUID closed = fx.room(property, 2, 0);
        jdbc.update("UPDATE property.rooms SET status = 'MAINTENANCE' WHERE id = ?", closed);
        UUID sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        UUID handler = fx.manager(property, "Ravi Handler");
        fx.grantBookings(property, handler);
        UUID onlooker = fx.manager(property, "Sana Onlooker");
        fx.grantBookings(property, onlooker);
        // Ravi handles this one.
        fx.assign(sent, handler);
        // Bookings is the only grant either of them holds.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM property.manager_permissions"
                + " WHERE property_id = ? AND resource <> 'BOOKINGS'", Integer.class, property)).isZero();

        List<BookingBedOptionResponse> options = bookings.anotherBedOptions(handler, property, sent);

        // Not the room they booked, not a full one, not one that is closed.
        assertThat(options).extracting(BookingBedOptionResponse::roomId).containsExactlyInAnyOrder(other, oneLeft);
        assertThat(options).filteredOn(option -> option.roomId().equals(other)).singleElement().satisfies(option -> {
            assertThat(option.roomNumber()).isEqualTo(numberOf(other));
            assertThat(option.capacity()).isEqualTo(2);
            assertThat(option.freeBeds()).isEqualTo(2);
            assertThat(option.listedRentPaise()).isEqualTo(800_000L);
        });
        assertThat(options).filteredOn(option -> option.roomId().equals(oneLeft)).singleElement()
                .satisfies(option -> assertThat(option.freeBeds()).isEqualTo(1));
        assertThat(bookings.anotherBedOptions(owner, property, sent))
                .extracting(BookingBedOptionResponse::roomId).containsExactlyInAnyOrder(other, oneLeft);

        // Someone with the grant who does not handle this one may look at the booking, and may not offer a bed.
        assertThatThrownBy(() -> bookings.anotherBedOptions(onlooker, property, sent))
                .isInstanceOf(ValidationException.class).hasMessageContaining("whoever handles this booking");
        assertThatThrownBy(() -> bookings.anotherBedOptions(fx.person(), property, sent))
                .isInstanceOf(ForbiddenException.class);
        UUID elsewhere = fx.property();
        assertThatThrownBy(() -> bookings.anotherBedOptions(fx.ownerOf(elsewhere), elsewhere, sent))
                .isInstanceOf(NotFoundException.class);
    }

    // ---- The property's list, narrowed -----------------------------------------------

    @Test
    void thePropertysListIsSearchedAndNarrowedOnTheServer() {
        UUID other = fx.room(property, 2, 0);
        UUID asha = bookings.create(tenant, named("Asha Rao", enquiry, room, 10)).id();
        UUID second = fx.person();
        // Bina asks below the listed rent, so the property has something to answer her with.
        UUID bina = bookings.create(second,
                named("Bina Das", fx.attendedEnquiry(property, second, today), other, 10, 700_000L)).id();
        UUID third = fx.person();
        UUID charu = bookings.create(third,
                named("Charu Sen", fx.attendedEnquiry(property, third, today), other, 10)).id();
        // The property answers Bina, so hers waits on the tenant.
        negotiation.offer(owner, property, bina, 1, 780_000L, true);
        UUID handler = fx.manager(property, "Ravi Handler");
        fx.grantBookings(property, handler);
        fx.assign(charu, handler);

        assertThat(open(owner, null, false, null)).containsExactly(charu, bina, asha);

        // By part of a name, in any case.
        assertThat(open(owner, null, false, "bINa")).containsExactly(bina);
        // By a booking's short code.
        String code = jdbc.queryForObject("SELECT reference_code FROM booking.requests WHERE id = ?", String.class, asha);
        assertThat(open(owner, null, false, code.toLowerCase(Locale.ROOT))).containsExactly(asha);
        // By a room number.
        assertThat(open(owner, null, false, numberOf(other))).containsExactly(charu, bina);
        assertThat(open(owner, null, false, "nobody-by-this-name")).isEmpty();
        // A search of wildcards alone is no search, never a match on everything by accident of the syntax.
        assertThat(open(owner, null, false, " %_ ")).containsExactly(charu, bina, asha);

        // By where it stands.
        assertThat(open(owner, BookingStatus.AWAITING_TENANT, false, null)).containsExactly(bina);
        assertThat(open(owner, BookingStatus.AWAITING_HANDLER, false, null)).containsExactly(charu, asha);
        assertThat(open(owner, BookingStatus.CANCELLED, false, null)).isEmpty();

        // By whose it is, and a filter is not a permission. The owner answered Bina's, which made it the owner's.
        assertThat(open(handler, null, true, null)).containsExactly(charu);
        assertThat(open(owner, null, true, null)).containsExactly(bina);
        // And by nobody's: what is still waiting to be taken (user, 2026-10-11).
        assertThat(bookings.pageForProperty(owner, property, BookingListFilter.OPEN, null, false, true, null, 0, 20)
                .items()).extracting(BookingRequestListItemResponse::id).containsExactly(asha);
        assertThat(open(handler, BookingStatus.AWAITING_HANDLER, true, "charu")).containsExactly(charu);
        assertThat(open(handler, BookingStatus.AWAITING_TENANT, true, null)).isEmpty();

        // The count is of what was asked for, not of a page.
        PageResponse<BookingRequestListItemResponse> narrowed = bookings.pageForProperty(
                owner, property, BookingListFilter.OPEN, null, false, numberOf(other), 0, 1);
        assertThat(narrowed.items()).extracting(BookingRequestListItemResponse::id).containsExactly(charu);
        assertThat(narrowed.totalElements()).isEqualTo(2);
        assertThat(narrowed.hasNext()).isTrue();
    }

    @Test
    void aManagerWhoLostTheGrantHandlesNothingHoweverTheRowReads() {
        UUID sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        UUID viewer = fx.manager(property, "Vik Viewer");
        fx.grantBookings(property, viewer);
        fx.assign(sent, viewer);
        assertThat(open(viewer, null, true, null)).containsExactly(sent);
        // The owner turns their access down to looking. The row still carries their name.
        jdbc.update("UPDATE property.manager_permissions SET access_level = 'VIEW'"
                + " WHERE property_id = ? AND manager_user_id = ? AND resource = 'BOOKINGS'", property, viewer);
        assertThat(jdbc.queryForObject("SELECT handler_user_id FROM booking.requests WHERE id = ?", UUID.class, sent))
                .isEqualTo(viewer);

        assertThat(open(viewer, null, false, null)).containsExactly(sent);
        PageResponse<BookingRequestListItemResponse> mine = bookings.pageForProperty(
                viewer, property, BookingListFilter.OPEN, null, true, null, 0, 20);
        assertThat(mine.items()).isEmpty();
        assertThat(mine.totalElements()).isZero();
    }

    @Test
    void theHistoryNarrowsByHowARequestReadsNotByHowItIsStored() {
        UUID cancelled = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        negotiation.cancel(tenant, cancelled);
        UUID second = fx.person();
        UUID outOfTime = bookings.create(second,
                BookingFixtures.ask(fx.attendedEnquiry(property, second, today), room, today.plusDays(4))).id();
        UUID third = fx.person();
        UUID stillOpen = bookings.create(third,
                BookingFixtures.ask(fx.attendedEnquiry(property, third, today), room, today.plusDays(10))).id();
        // Three days on, the one for day +4 is out of time by its own clock, and nothing has swept it.
        clock.set(today.plusDays(3).atStartOfDay(IST).toInstant());

        assertThat(history(null)).containsExactly(outOfTime, cancelled);
        assertThat(history(BookingStatus.EXPIRED)).containsExactly(outOfTime);
        assertThat(history(BookingStatus.CANCELLED)).containsExactly(cancelled);
        // It is stored as waiting on the property, and it reads as expired. Asking the history for waiting finds none.
        assertThat(history(BookingStatus.AWAITING_HANDLER)).isEmpty();
        assertThat(open(owner, BookingStatus.AWAITING_HANDLER, false, null)).containsExactly(stillOpen);
        assertThat(open(owner, BookingStatus.EXPIRED, false, null)).isEmpty();
    }

    // ---- Helpers ---------------------------------------------------------------------

    private List<UUID> open(UUID actor, BookingStatus status, boolean mine, String search) {
        return bookings.pageForProperty(actor, property, BookingListFilter.OPEN, status, mine, search, 0, 20)
                .items().stream().map(BookingRequestListItemResponse::id).toList();
    }

    private List<UUID> history(BookingStatus status) {
        return bookings.pageForProperty(owner, property, BookingListFilter.HISTORY, status, false, null, 0, 20)
                .items().stream().map(BookingRequestListItemResponse::id).toList();
    }

    private CreateBookingRequest named(String name, UUID theEnquiry, UUID theRoom, int daysAhead) {
        return named(name, theEnquiry, theRoom, daysAhead, null);
    }

    /** With a rent of their own proposed, or null for the listed rent. */
    private CreateBookingRequest named(String name, UUID theEnquiry, UUID theRoom, int daysAhead,
            Long proposedRentPaise) {
        return new CreateBookingRequest(theEnquiry, theRoom, null, today.plusDays(daysAhead), proposedRentPaise, null,
                name, "9007433360", null, Gender.FEMALE, LocalDate.of(2000, 1, 1), UUID.randomUUID().toString());
    }

    /** A date as the form's sentences write it. */
    private static String day(LocalDate date) {
        return java.time.format.DateTimeFormatter.ofPattern("d MMM uuuu", Locale.ENGLISH).format(date);
    }

    private static BookingFormOptionsResponse.Room roomOn(BookingFormOptionsResponse form, UUID theRoom) {
        return form.rooms().stream().filter(shown -> shown.roomId().equals(theRoom)).findFirst().orElseThrow();
    }

    /** A limit no owner can set today, written as a later rule would leave it. */
    private void storedLimit(int days) {
        jdbc.update("UPDATE booking.settings SET maximum_advance_days = ? WHERE property_id = ?", days, property);
    }

    private String numberOf(UUID theRoom) {
        return jdbc.queryForObject("SELECT room_number FROM property.rooms WHERE id = ?", String.class, theRoom);
    }
}
