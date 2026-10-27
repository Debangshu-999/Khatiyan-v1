package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

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
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestCountsResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingSettingsResponse;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.RoomAmenity;
import com.khatiyan.d_modules.property.model.RoomConditioning;
import com.khatiyan.support.IntegrationTest;

/**
 * Sending and reading booking requests against the real schema (user's rules,
 * 2026-10-09 and 10): a request holds one bed from the moment it is sent, so a
 * bed is asked for by one person at a time, what the tenant was shown is
 * frozen on it, and who may ask is decided on the server.
 *
 * <p>The property is Fixture PG with one room of three beds at Rs 8,000, a
 * Rs 10,000 deposit, and a Rs 2,000 token that does not come back. The tenant
 * visited yesterday.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingRequestIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingInventoryService inventory;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private PropertyModule properties;
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

    // ---- Sending -------------------------------------------------------------

    @Test
    void aRequestKeepsEverythingTheTenantWasShownAndHoldsOneBed() {
        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)));

        assertThat(sent.referenceCode()).startsWith("BKG-");
        assertThat(sent.status()).isEqualTo(BookingStatus.AWAITING_HANDLER);
        assertThat(sent.propertyName()).isEqualTo("Fixture PG");
        assertThat(sent.roomNumber()).isNotBlank();
        assertThat(sent.roomImageUrls()).isEmpty();
        assertThat(sent.futureBed()).isFalse();
        assertThat(sent.bookingDate()).isEqualTo(today);
        assertThat(sent.earliestMoveInDate()).isEqualTo(today.plusDays(3));
        assertThat(sent.latestMoveInDate()).isEqualTo(today.plusDays(21));
        assertThat(sent.moveInDate()).isEqualTo(today.plusDays(10)).isEqualTo(sent.originalMoveInDate());
        assertThat(sent.expiresAt()).isEqualTo(sent.submittedAt().plus(7, ChronoUnit.DAYS));
        assertThat(sent.agreementMonths()).isNull();
        assertThat(sent.listedRentPaise()).isEqualTo(800_000L).isEqualTo(sent.currentRentPaise());
        assertThat(sent.depositPaise()).isEqualTo(1_000_000L);
        assertThat(sent.tokenRequired()).isTrue();
        assertThat(sent.tokenPaise()).isEqualTo(200_000L);
        assertThat(sent.tokenRefundable()).isFalse();
        // Deposit plus the first month, less the token.
        assertThat(sent.dueAtMoveInPaise()).isEqualTo(1_600_000L);
        assertThat(sent.tenantName()).isEqualTo("Asha Rao");
        assertThat(sent.tenantPhone()).isEqualTo("+919007433360");
        assertThat(sent.tenantGender()).isEqualTo(Gender.FEMALE);
        assertThat(sent.offers()).singleElement().satisfies(offer -> {
            assertThat(offer.sequence()).isEqualTo(1);
            assertThat(offer.madeBy()).isEqualTo(BookingParty.TENANT);
            assertThat(offer.monthlyRentPaise()).isEqualTo(800_000L);
            assertThat(offer.negotiable()).isTrue();
        });
        assertThat(sent.history()).singleElement().satisfies(item -> {
            assertThat(item.type()).isEqualTo(BookingActionType.SUBMITTED);
            assertThat(item.party()).isEqualTo(BookingParty.TENANT);
            assertThat(item.statusAfter()).isEqualTo(BookingStatus.AWAITING_HANDLER);
        });
        // Their own offer is on the table, so all they can do is withdraw. It was made at the listed
        // rent, so the property may take it or decline it and has nothing to counter.
        assertThat(sent.allowedActions()).containsExactly(BookingAction.CANCEL);
        assertThat(bookings.forProperty(owner, property, sent.id()).allowedActions())
                .containsExactlyInAnyOrder(BookingAction.ACCEPT, BookingAction.CANCEL);

        // One bed is theirs from this moment: held, and no longer offered to anybody else.
        assertThat(holdStateOf(sent.id())).isEqualTo("HELD");
        assertThat(heldBeds()).isEqualTo(1);
        assertThat(reservedIn(room)).isEqualTo(1);
        assertThat(properties.getAvailableVacancies(property, room)).isEqualTo(2);
    }

    @Test
    void theTenantsOwnOfferAndAgreementChoiceOpenTheRequest() {
        CreateBookingRequest ask = new CreateBookingRequest(enquiry, room, null, today.plusDays(5), 150_000L, 11,
                "  Asha Rao ", "+91 90074 33360", " ", Gender.FEMALE, LocalDate.of(2000, 1, 1), "key-own-offer");
        BookingRequestResponse sent = bookings.create(tenant, ask);

        assertThat(sent.listedRentPaise()).isEqualTo(800_000L);
        assertThat(sent.currentRentPaise()).isEqualTo(150_000L);
        assertThat(sent.agreementMonths()).isEqualTo(11);
        assertThat(sent.tenantName()).isEqualTo("Asha Rao");
        assertThat(sent.tenantPhone()).isEqualTo("+919007433360");
        assertThat(sent.tenantEmail()).isNull();
        // The token is never more than one month of the rent on the table.
        assertThat(sent.tokenPaise()).isEqualTo(150_000L);
        assertThat(sent.dueAtMoveInPaise()).isEqualTo(1_000_000L);
        // A date five days out ends the request two evenings before it, not at seven days.
        assertThat(sent.expiresAt()).isEqualTo(today.plusDays(3).atTime(18, 0).atZone(IST).toInstant());
    }

    /** One bed, one request (user, 2026-10-10). The next person may ask as soon as it is over. */
    @Test
    void aBedIsAskedForByOnePersonAtATime() {
        UUID single = fx.room(property, 1, 0);
        BookingRequestResponse first = bookings.create(tenant, BookingFixtures.ask(enquiry, single, today.plusDays(10)));
        UUID second = fx.person();
        UUID theirEnquiry = fx.attendedEnquiry(property, second, today);
        assertThatThrownBy(() -> bookings.create(second, BookingFixtures.ask(theirEnquiry, single, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("No bed in this room is free");
        assertThat(properties.getAvailableVacancies(property, single)).isZero();

        // A room of three beds takes three requests, a bed each, and not a fourth.
        for (int i = 0; i < 3; i++) {
            UUID person = fx.person();
            bookings.create(person, BookingFixtures.ask(fx.attendedEnquiry(property, person, today), room, today.plusDays(10)));
        }
        assertThat(reservedIn(room)).isEqualTo(3);
        assertThat(properties.getAvailableVacancies(property, room)).isZero();
        UUID fifth = fx.person();
        UUID fifthEnquiry = fx.attendedEnquiry(property, fifth, today);
        assertThatThrownBy(() -> bookings.create(fifth, BookingFixtures.ask(fifthEnquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("No bed in this room is free");
        assertThat(heldBeds()).isEqualTo(4);

        // The first request runs out. Nothing has swept it, and the bed is the next person's at once.
        clock.set(first.expiresAt().plusSeconds(1));
        LocalDate later = LocalDate.ofInstant(clock.instant(), IST);
        BookingRequestResponse next = bookings.create(second, BookingFixtures.ask(theirEnquiry, single, later.plusDays(10)));
        assertThat(next.status()).isEqualTo(BookingStatus.AWAITING_HANDLER);
        assertThat(holdStateOf(first.id())).isEqualTo("RELEASED");
        assertThat(holdStateOf(next.id())).isEqualTo("HELD");
        assertThat(reservedIn(single)).isEqualTo(1);
        assertThat(bookings.forTenant(tenant, first.id()).status()).isEqualTo(BookingStatus.EXPIRED);
    }

    @Test
    void bookingDetailsShowOnlyTheBookedRoomTypesPhotosInOwnerOrder() {
        UUID type = UUID.randomUUID();
        UUID otherType = UUID.randomUUID();
        jdbc.update("INSERT INTO property.room_molds (id, property_id, sharing_type, conditioning, bed_count,"
                + " base_rent_paise) VALUES (?, ?, 'TRIPLE', 'AC', 3, 800000), (?, ?, 'DOUBLE', 'NON_AC', 2, 800000)",
                type, property, otherType, property);
        jdbc.update("INSERT INTO property.room_mold_images (mold_id, position, url) VALUES"
                + " (?, 1, 'https://img.example/second.jpg'), (?, 0, 'https://img.example/first.jpg'),"
                + " (?, 0, 'https://img.example/another-type.jpg')", type, type, otherType);
        jdbc.update("UPDATE property.rooms SET mold_id = ? WHERE id = ?", type, room);
        jdbc.update("UPDATE property.rooms SET conditioning = 'AC', floor = '1' WHERE id = ?", room);
        jdbc.update("INSERT INTO property.room_amenities (room_id, amenity) VALUES (?, 'CUPBOARD'), (?, 'BEDDING')", room, room);
        jdbc.update("INSERT INTO property.room_custom_amenities (room_id, name) VALUES (?, 'Study table')", room);

        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)));
        assertThat(sent.roomImageUrls()).containsExactly("https://img.example/first.jpg", "https://img.example/second.jpg");
        assertThat(sent.roomConditioning()).isEqualTo(RoomConditioning.AC);
        assertThat(sent.roomCapacity()).isEqualTo(3);
        assertThat(sent.roomFloor()).isEqualTo("1");
        assertThat(sent.roomAmenities()).containsExactlyInAnyOrder(RoomAmenity.CUPBOARD, RoomAmenity.BEDDING);
        assertThat(sent.roomCustomAmenities()).containsExactly("Study table");
        assertThat(bookings.forTenant(tenant, sent.id()).roomImageUrls()).isEqualTo(sent.roomImageUrls());
        assertThat(bookings.forProperty(owner, property, sent.id()).roomImageUrls()).isEqualTo(sent.roomImageUrls());
        assertThatThrownBy(() -> bookings.forTenant(fx.person(), sent.id())).isInstanceOf(NotFoundException.class);

        // Retiring a type does not change what an already-created room is.
        jdbc.update("UPDATE property.room_molds SET is_active = false WHERE id = ?", type);
        assertThat(bookings.forTenant(tenant, sent.id()).roomImageUrls()).isEqualTo(sent.roomImageUrls());
        // A room with no type never borrows a different type's photo.
        jdbc.update("UPDATE property.rooms SET mold_id = null WHERE id = ?", room);
        assertThat(bookings.forTenant(tenant, sent.id()).roomImageUrls()).isEmpty();
    }

    @Test
    void theSameTapOfSendArrivingTwiceIsOneRequest() {
        CreateBookingRequest ask = BookingFixtures.ask(enquiry, room, null, today.plusDays(10), "one-tap");
        BookingRequestResponse first = bookings.create(tenant, ask);
        BookingRequestResponse again = bookings.create(tenant, ask);
        // Even with a different body the key is what names the request.
        BookingRequestResponse changed = bookings.create(tenant,
                BookingFixtures.ask(enquiry, room, null, today.plusDays(4), "one-tap"));

        assertThat(again.id()).isEqualTo(first.id()).isEqualTo(changed.id());
        assertThat(changed.moveInDate()).isEqualTo(today.plusDays(10));
        assertThat(again.expiresAt()).isEqualTo(first.expiresAt());
        assertThat(requestCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM booking.offers WHERE request_id = ?",
                Integer.class, first.id())).isEqualTo(1);
        assertThat(first.history()).hasSize(1);
        assertThat(again.history()).hasSize(1);
        assertThat(heldBeds()).isEqualTo(1);
    }

    @Test
    void twoTapsAtTheSameMomentMakeOneRequest() throws Exception {
        // Different keys: two genuine requests from one person, not a retry of one.
        assertThat(atTheSameMoment(
                () -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))),
                () -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)))))
                .containsExactlyInAnyOrder(true, false);
        assertThat(requestCount()).isEqualTo(1);
        assertThat(heldBeds()).isEqualTo(1);
    }

    @Test
    void twoPeopleAskingForTheLastBedAtTheSameMomentOneGetsIt() throws Exception {
        UUID single = fx.room(property, 1, 0);
        UUID other = fx.person();
        UUID theirEnquiry = fx.attendedEnquiry(property, other, today);

        assertThat(atTheSameMoment(
                () -> bookings.create(tenant, BookingFixtures.ask(enquiry, single, today.plusDays(10))),
                () -> bookings.create(other, BookingFixtures.ask(theirEnquiry, single, today.plusDays(10)))))
                .containsExactlyInAnyOrder(true, false);

        assertThat(reservedIn(single)).isEqualTo(1);
        assertThat(heldBeds()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM booking.requests WHERE room_id = ?", Integer.class, single))
                .isEqualTo(1);
    }

    // ---- Who may ask ---------------------------------------------------------

    @Test
    void onePersonHasOneOpenRequestPerPropertyButMayAskElsewhere() {
        bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)));
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(12))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already have a booking request");
        assertThat(requestCount()).isEqualTo(1);

        UUID elsewhere = fx.property();
        settings.create(fx.ownerOf(elsewhere), elsewhere, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID otherRoom = fx.room(elsewhere, 2, 0);
        BookingRequestResponse second = bookings.create(tenant,
                BookingFixtures.ask(fx.attendedEnquiry(elsewhere, tenant, today), otherRoom, today.plusDays(10)));
        // That property takes no token, so nothing is owed and the full amount falls due at move-in.
        assertThat(second.tokenRequired()).isFalse();
        assertThat(second.tokenPaise()).isZero();
        assertThat(second.dueAtMoveInPaise()).isEqualTo(second.depositPaise() + 800_000L);
    }

    @Test
    void aVisitGivesTwoRequestsAndNoMore() {
        UUID first = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        assertThat(slotOf(first)).isEqualTo(1);
        closeKeepingItsSlot(first);
        UUID second = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        assertThat(slotOf(second)).isEqualTo(2);
        closeKeepingItsSlot(second);

        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("both booking requests");
        assertThat(requestCount()).isEqualTo(2);
    }

    /** Silence from the property must not cost the tenant one of their two requests. */
    @Test
    void aRequestThePropertyNeverAnsweredGivesItsSlotBackAndDoesNotBlockTheNext() {
        BookingRequestResponse ignored = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10)));
        // Past its seven days, and the hourly sweep has not run.
        clock.set(ignored.expiresAt().plusSeconds(1));
        LocalDate later = LocalDate.ofInstant(clock.instant(), IST);

        BookingRequestResponse next = bookings.create(tenant, BookingFixtures.ask(enquiry, room, later.plusDays(10)));

        assertThat(slotOf(next.id())).isEqualTo(1);
        assertThat(slotOf(ignored.id())).isNull();
        BookingRequestResponse old = bookings.forTenant(tenant, ignored.id());
        assertThat(old.status()).isEqualTo(BookingStatus.EXPIRED);
        assertThat(old.closedAt()).isEqualTo(clock.instant());
        assertThat(old.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsExactly(BookingActionType.SUBMITTED, BookingActionType.EXPIRED);
        assertThat(old.history().get(1).party()).isNull();
        assertThat(next.bookingDate()).isEqualTo(later);
        // Its bed went back with it, and the new request holds one of its own.
        assertThat(holdStateOf(ignored.id())).isEqualTo("RELEASED");
        assertThat(holdStateOf(next.id())).isEqualTo("HELD");
        assertThat(reservedIn(room)).isEqualTo(1);
    }

    @Test
    void onlyTheVisitorWhoAttendedMayAsk() {
        UUID stranger = fx.person();
        assertThatThrownBy(() -> bookings.create(stranger, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(NotFoundException.class);

        UUID notVisited = fx.enquiry(property, stranger);
        assertThatThrownBy(() -> bookings.create(stranger, BookingFixtures.ask(notVisited, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("after you have visited");
        assertThat(requestCount()).isZero();
    }

    /** The 30 days belong to the visitor. The property declines requests, it cannot remove the window. */
    @Test
    void closingTheEnquiryAfterTheVisitDoesNotStopARequest() {
        jdbc.update("UPDATE enquiry.enquiries SET ended_at = now(), ended_by_user_id = ?, end_reason = 'NOT_INTERESTED'"
                + " WHERE id = ?", owner, enquiry);
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).status())
                .isEqualTo(BookingStatus.AWAITING_HANDLER);
    }

    @Test
    void aPropertyThatHasNotSetBookingsUpTakesNoRequests() {
        jdbc.update("DELETE FROM booking.settings WHERE property_id = ?", property);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("not available for booking yet");
        assertThat(requestCount()).isZero();
    }

    @Test
    void aPersonWithAConfirmedBookingCannotAskAnywhereElse() {
        UUID elsewhere = fx.property();
        settings.create(fx.ownerOf(elsewhere), elsewhere, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID confirmed = bookings.create(tenant, BookingFixtures.ask(
                fx.attendedEnquiry(elsewhere, tenant, today), fx.room(elsewhere, 2, 0), today.plusDays(10))).id();
        // That property takes no token, so its owner accepting confirms the booking.
        assertThat(negotiation.acceptForProperty(fx.ownerOf(elsewhere), elsewhere, confirmed, 1).status())
                .isEqualTo(BookingStatus.CONFIRMED);

        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("confirmed booking");
    }

    @Test
    void walkingAwayFromABedHeldForNothingClosesThePropertyForAWhile() {
        UUID walkedAway = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        jdbc.update("UPDATE booking.requests SET status = 'CANCELLED', closed_at = now(),"
                + " end_cause = 'TENANT_CANCELLED', cooldown_until = ? WHERE id = ?",
                Timestamp.from(Instant.now().plus(30, ChronoUnit.DAYS)), walkedAway);
        inventory.release(walkedAway, property);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("cancelled a confirmed booking");

        // Once the cooldown is over they may ask again.
        jdbc.update("UPDATE booking.requests SET cooldown_until = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(1)), walkedAway);
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).status())
                .isEqualTo(BookingStatus.AWAITING_HANDLER);
    }

    @Test
    void someoneStayingElsewhereMayAskOnlyForAfterTheirApprovedCheckout() {
        UUID elsewhere = fx.property();
        UUID theirRoom = fx.room(elsewhere, 1, 1);
        UUID stay = fx.stay(elsewhere, theirRoom, tenant, "ACTIVE", null);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no approved move-out date");

        jdbc.update("UPDATE tenancy.tenancies SET status = 'ON_NOTICE', end_date = ? WHERE id = ?", today.plusDays(9), stay);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(9))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("after " + today.plusDays(9));
        assertThat(requestCount()).isZero();
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).moveInDate())
                .isEqualTo(today.plusDays(10));
    }

    @Test
    void someoneAlreadyStayingHereCannotAskForABed() {
        fx.stay(property, room, tenant, "ACTIVE", null);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already stay at this property");
    }

    // ---- What may be asked for -----------------------------------------------

    @Test
    void aMoveInDateOutsideTheBoundsIsRefusedAndNothingIsWritten() {
        for (int days : new int[]{-1, 0, 2, 22}) {
            assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(days))))
                    .as("day +%d", days).isInstanceOf(ValidationException.class);
        }
        assertThat(requestCount()).isZero();
        assertThat(heldBeds()).isZero();
        assertThat(bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(3))).moveInDate())
                .isEqualTo(today.plusDays(3));
    }

    /** User, 2026-10-10: 3 to 21 days is the window, a week's push makes 28, and none of it is the owner's to set. */
    @Test
    void theMoveInWindowIsThreeToTwentyOneDaysAndNotTheOwnersToChange() {
        BookingSettingsResponse now = settings.forOwner(owner, property);
        assertThat(now.minimumAdvanceDays()).isEqualTo(3);
        assertThat(now.maximumAdvanceDays()).isEqualTo(21);
        assertThat(now.datePushMaximumDays()).isEqualTo(7);
        for (int days : new int[]{3, 20, 22, 30, 45, 90}) {
            assertThatThrownBy(() -> settings.save(owner, property,
                    new SaveBookingSettingsRequest(true, 200_000L, false, days, true)))
                    .as("%d days", days).isInstanceOf(ValidationException.class).hasMessageContaining("3 to 21 days");
        }
        assertThat(settings.forOwner(owner, property).version()).isEqualTo(now.version());
        // Sent with no number at all, as the app sends it, everything else is saved and the window stays.
        BookingSettingsResponse saved = settings.save(owner, property,
                new SaveBookingSettingsRequest(true, 250_000L, false, null, true));
        assertThat(saved.maximumAdvanceDays()).isEqualTo(21);
        assertThat(saved.tokenAmountPaise()).isEqualTo(250_000L);
        assertThat(saved.version()).isGreaterThan(now.version());

        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(21)));
        assertThat(sent.earliestMoveInDate()).isEqualTo(today.plusDays(3));
        assertThat(sent.latestMoveInDate()).isEqualTo(today.plusDays(21));
        UUID second = fx.person();
        UUID theirEnquiry = fx.attendedEnquiry(property, second, today);
        assertThatThrownBy(() -> bookings.create(second, BookingFixtures.ask(theirEnquiry, room, today.plusDays(22))))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void whatTheTenantWasShownSurvivesAChangeToTheOwnersSettings() {
        UUID sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(20))).id();
        settings.save(owner, property, new SaveBookingSettingsRequest(true, 500_000L, true, 21, false));
        jdbc.update("UPDATE property.properties SET standard_deposit_paise = 50, name = 'Renamed PG' WHERE id = ?", property);
        jdbc.update("UPDATE property.rooms SET base_rent_paise = 990000, room_number = 'NEW' WHERE id = ?", room);

        BookingRequestResponse still = bookings.forTenant(tenant, sent);
        assertThat(still.tokenPaise()).isEqualTo(200_000L);
        assertThat(still.tokenRefundable()).isFalse();
        assertThat(still.latestMoveInDate()).isEqualTo(today.plusDays(21));
        assertThat(still.moveInDate()).isEqualTo(today.plusDays(20));
        assertThat(still.depositPaise()).isEqualTo(1_000_000L);
        assertThat(still.listedRentPaise()).isEqualTo(800_000L);
        assertThat(still.propertyName()).isEqualTo("Fixture PG");
        assertThat(still.roomNumber()).isNotEqualTo("NEW");

        // A request sent afterwards is shown, and keeps, the new terms.
        UUID second = fx.person();
        BookingRequestResponse after = bookings.create(second,
                BookingFixtures.ask(fx.attendedEnquiry(property, second, today), room, today.plusDays(10)));
        assertThat(after.tokenPaise()).isEqualTo(500_000L);
        assertThat(after.tokenRefundable()).isTrue();
        assertThat(after.latestMoveInDate()).isEqualTo(today.plusDays(21));
        assertThat(after.listedRentPaise()).isEqualTo(990_000L);
    }

    @Test
    void aWomensPgTakesWomenAndEveryoneSaysWhoTheyAre() {
        jdbc.update("UPDATE property.properties SET pg_for = 'FEMALE' WHERE id = ?", property);
        assertThatThrownBy(() -> bookings.create(tenant, asking(Gender.MALE, LocalDate.of(2000, 1, 1), null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("women only");
        assertThatThrownBy(() -> bookings.create(tenant, asking(Gender.UNDECLARED, LocalDate.of(2000, 1, 1), null)))
                .isInstanceOf(ValidationException.class);
        assertThat(requestCount()).isZero();
        assertThat(bookings.create(tenant, asking(Gender.FEMALE, LocalDate.of(2000, 1, 1), null)).tenantGender())
                .isEqualTo(Gender.FEMALE);
    }

    @Test
    void theTenantMustBeAnAdultAndTheAgreementOneToElevenMonths() {
        assertThatThrownBy(() -> bookings.create(tenant, asking(Gender.FEMALE, today.minusYears(18).plusDays(1), null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("18");
        for (int months : new int[]{0, 12}) {
            assertThatThrownBy(() -> bookings.create(tenant, asking(Gender.FEMALE, LocalDate.of(2000, 1, 1), months)))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("1 and 11");
        }
        assertThat(requestCount()).isZero();
        assertThat(bookings.create(tenant, asking(Gender.FEMALE, today.minusYears(18), 1)).agreementMonths()).isEqualTo(1);
    }

    @Test
    void aFullRoomCanBeAskedForOnlyThroughTheBedThatIsBeingVacated() {
        UUID full = fx.room(property, 1, 0);
        UUID exit = fx.approvedExit(property, full, today.plusDays(6));

        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, full, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("No bed in this room is free");
        // The checkout day itself is still theirs.
        assertThatThrownBy(() -> bookings.create(tenant,
                BookingFixtures.ask(enquiry, full, exit, today.plusDays(6), "on-checkout-day")))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> bookings.create(tenant,
                BookingFixtures.ask(enquiry, full, UUID.randomUUID(), today.plusDays(10), "no-such-exit")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no longer becoming free");
        assertThatThrownBy(() -> bookings.create(tenant,
                BookingFixtures.ask(enquiry, room, exit, today.plusDays(10), "wrong-room")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no longer becoming free");
        assertThat(requestCount()).isZero();

        BookingRequestResponse sent = bookings.create(tenant,
                BookingFixtures.ask(enquiry, full, exit, today.plusDays(7), "day-after-checkout"));
        assertThat(sent.futureBed()).isTrue();
        // The bed is promised to them while it is still occupied: a waiting claim, with nothing reserved yet.
        assertThat(holdStateOf(sent.id())).isEqualTo("WAITING");
        assertThat(reservedIn(full)).isZero();
        // And nobody else can ask for the same departure.
        UUID second = fx.person();
        UUID theirEnquiry = fx.attendedEnquiry(property, second, today);
        assertThatThrownBy(() -> bookings.create(second,
                BookingFixtures.ask(theirEnquiry, full, exit, today.plusDays(8), "same-departure")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no longer becoming free");
        assertThat(heldBeds()).isEqualTo(1);
    }

    @Test
    void anOwnerWhoShowsOnlyCurrentVacanciesTakesNoRequestsForBedsBeingVacated() {
        settings.save(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, false));
        UUID full = fx.room(property, 1, 0);
        UUID exit = fx.approvedExit(property, full, today.plusDays(6));
        assertThatThrownBy(() -> bookings.create(tenant,
                BookingFixtures.ask(enquiry, full, exit, today.plusDays(10), "future-hidden")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("free today");
    }

    @Test
    void aRoomUnderMaintenanceOrSwitchedOffCannotBeAskedFor() {
        UUID closed = fx.room(property, 2, 0);
        jdbc.update("UPDATE property.rooms SET status = 'MAINTENANCE' WHERE id = ?", closed);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, closed, today.plusDays(10))))
                .isInstanceOf(ValidationException.class).hasMessageContaining("maintenance");

        jdbc.update("UPDATE property.rooms SET status = 'VACANT', is_active = false WHERE id = ?", closed);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, closed, today.plusDays(10))))
                .isInstanceOfAny(NotFoundException.class, ValidationException.class);
        // A room of another property cannot be named through this enquiry either.
        UUID elsewhere = fx.property();
        UUID theirs = fx.room(elsewhere, 2, 0);
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, theirs, today.plusDays(10))))
                .isInstanceOfAny(NotFoundException.class, ValidationException.class);
        assertThat(requestCount()).isZero();
    }

    // ---- Reading -------------------------------------------------------------

    @Test
    void aTenantSeesOnlyTheirOwnRequestsNewestFirst() {
        UUID elsewhere = fx.property();
        settings.create(fx.ownerOf(elsewhere), elsewhere, new SaveBookingSettingsRequest(false, null, null, 21, true));
        UUID first = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        UUID second = bookings.create(tenant, BookingFixtures.ask(
                fx.attendedEnquiry(elsewhere, tenant, today), fx.room(elsewhere, 2, 0), today.plusDays(12))).id();
        UUID other = fx.person();
        UUID theirs = bookings.create(other,
                BookingFixtures.ask(fx.attendedEnquiry(property, other, today), room, today.plusDays(10))).id();

        PageResponse<BookingRequestListItemResponse> mine = bookings.pageForTenant(tenant, 0, 20);
        assertThat(mine.items()).extracting(BookingRequestListItemResponse::id).containsExactly(second, first);
        assertThat(mine.totalElements()).isEqualTo(2);
        assertThat(bookings.pageForTenant(tenant, 0, 1).items()).extracting(BookingRequestListItemResponse::id)
                .containsExactly(second);
        assertThat(bookings.pageForTenant(tenant, 1, 1).items()).extracting(BookingRequestListItemResponse::id)
                .containsExactly(first);
        // Not found, not forbidden: nobody learns that someone else's request exists.
        assertThatThrownBy(() -> bookings.forTenant(tenant, theirs)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> bookings.forTenant(tenant, UUID.randomUUID())).isInstanceOf(NotFoundException.class);
    }

    @Test
    void thePropertysListsSplitWhatIsStillGoingFromWhatIsOver() {
        UUID open = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        UUID second = fx.person();
        UUID over = bookings.create(second,
                BookingFixtures.ask(fx.attendedEnquiry(property, second, today), room, today.plusDays(10))).id();
        closeKeepingItsSlot(over);
        UUID third = fx.person();
        UUID outOfTime = bookings.create(third,
                BookingFixtures.ask(fx.attendedEnquiry(property, third, today), room, today.plusDays(4))).id();
        // Three days on, the one for day +4 is out of time by its own clock, and nothing has swept it.
        clock.set(today.plusDays(3).atStartOfDay(IST).toInstant());

        assertThat(bookings.pageForProperty(owner, property, BookingListFilter.OPEN, 0, 20).items())
                .extracting(BookingRequestListItemResponse::id).containsExactly(open);
        List<BookingRequestListItemResponse> history =
                bookings.pageForProperty(owner, property, BookingListFilter.HISTORY, 0, 20).items();
        assertThat(history).extracting(BookingRequestListItemResponse::id).containsExactly(outOfTime, over);
        assertThat(history).extracting(BookingRequestListItemResponse::status)
                .containsExactly(BookingStatus.EXPIRED, BookingStatus.CANCELLED);

        BookingRequestCountsResponse counts = bookings.countsForProperty(owner, property);
        assertThat(counts.awaitingHandler()).isEqualTo(1);
        assertThat(counts.open()).isEqualTo(1);
        // Read as expired, it offers nothing to anybody.
        assertThat(bookings.forProperty(owner, property, outOfTime).allowedActions()).isEmpty();
        assertThat(bookings.forTenant(third, outOfTime).allowedActions()).isEmpty();
    }

    @Test
    void onlyTheOwnerReadsThePropertysBookingsAndSettings() {
        UUID sent = bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(10))).id();
        UUID stranger = fx.person();
        UUID elsewhere = fx.property();

        assertThatThrownBy(() -> bookings.pageForProperty(stranger, property, BookingListFilter.OPEN, 0, 20))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> bookings.countsForProperty(tenant, property)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> bookings.forProperty(stranger, property, sent)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> settings.forOwner(stranger, property)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> settings.save(stranger, property,
                new SaveBookingSettingsRequest(false, null, null, 21, true))).isInstanceOf(ForbiddenException.class);
        // Another owner cannot reach it through their own property.
        assertThatThrownBy(() -> bookings.forProperty(fx.ownerOf(elsewhere), elsewhere, sent))
                .isInstanceOf(NotFoundException.class);
    }

    // ---- The owner's settings ------------------------------------------------

    @Test
    void bookingSettingsAreSetUpOnceThenChangedAndATokenNeedsItsAmountAndRefundAnswer() {
        UUID fresh = fx.property();
        UUID itsOwner = fx.ownerOf(fresh);
        BookingSettingsResponse before = settings.forOwner(itsOwner, fresh);
        assertThat(before.configured()).isFalse();
        assertThat(before.tokenRequired()).isTrue();
        assertThat(before.tokenAmountPaise()).isNull();
        assertThat(before.tokenRefundable()).isNull();
        assertThat(before.maximumAdvanceDays()).isEqualTo(21);
        assertThat(before.showFutureVacancies()).isTrue();
        assertThat(before.version()).isNull();

        // The token is on by default, and a token that is on has an amount and a refund answer.
        assertThatThrownBy(() -> settings.create(itsOwner, fresh, new SaveBookingSettingsRequest(true, null, false, 21, true)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("token amount");
        assertThatThrownBy(() -> settings.create(itsOwner, fresh, new SaveBookingSettingsRequest(true, 200_000L, null, 21, true)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("refundable");
        for (int days : new int[]{2, 91}) {
            assertThatThrownBy(() -> settings.create(itsOwner, fresh, new SaveBookingSettingsRequest(false, null, null, days, true)))
                    .isInstanceOf(ValidationException.class);
        }
        assertThatThrownBy(() -> settings.save(itsOwner, fresh, new SaveBookingSettingsRequest(false, null, null, 21, true)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Set up bookings");

        BookingSettingsResponse created = settings.create(itsOwner, fresh,
                new SaveBookingSettingsRequest(true, 300_000L, true, 21, false));
        assertThat(created.configured()).isTrue();
        assertThat(created.tokenAmountPaise()).isEqualTo(300_000L);
        assertThat(created.tokenRefundable()).isTrue();
        assertThat(created.maximumAdvanceDays()).isEqualTo(21);
        assertThat(created.showFutureVacancies()).isFalse();
        assertThatThrownBy(() -> settings.create(itsOwner, fresh, new SaveBookingSettingsRequest(false, null, null, 21, true)))
                .isInstanceOf(StaleVersionException.class);

        // Switching the token off keeps what was set, so switching it back on restores it.
        BookingSettingsResponse off = settings.save(itsOwner, fresh, new SaveBookingSettingsRequest(false, null, null, 21, true));
        assertThat(off.tokenRequired()).isFalse();
        assertThat(off.tokenAmountPaise()).isEqualTo(300_000L);
        assertThat(off.tokenRefundable()).isTrue();
        BookingSettingsResponse on = settings.save(itsOwner, fresh, new SaveBookingSettingsRequest(true, null, null, 21, true));
        assertThat(on.tokenRequired()).isTrue();
        assertThat(on.tokenAmountPaise()).isEqualTo(300_000L);
    }

    /** The 28 days a booking can reach is enough for v1 (user, 2026-10-18): nothing further ahead can be asked for. */
    @Test
    void aMoveInFurtherAheadThanTheWindowIsRefused() {
        assertThatThrownBy(() -> bookings.create(tenant, BookingFixtures.ask(enquiry, room, today.plusDays(28))))
                .isInstanceOf(ValidationException.class);
    }

    // ---- Helpers -------------------------------------------------------------

    private CreateBookingRequest asking(Gender gender, LocalDate dateOfBirth, Integer agreementMonths) {
        return new CreateBookingRequest(enquiry, room, null, today.plusDays(10), null, agreementMonths,
                "Asha Rao", "9007433360", null, gender, dateOfBirth, UUID.randomUUID().toString());
    }

    /** Withdrawn by whoever sent it: over, its bed given back, and still counted against the visit. */
    private void closeKeepingItsSlot(UUID request) {
        UUID sender = jdbc.queryForObject("SELECT prospect_user_id FROM booking.requests WHERE id = ?",
                UUID.class, request);
        negotiation.cancel(sender, request);
    }

    /** Two calls released together. True for each that went through, false for each that was refused. */
    private List<Boolean> atTheSameMoment(Runnable first, Runnable second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        try {
            var a = threads.submit(together(first, ready, go));
            var b = threads.submit(together(second, ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            return List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
        } finally {
            go.countDown();
            threads.shutdownNow();
        }
    }

    private static Callable<Boolean> together(Runnable call, CountDownLatch ready, CountDownLatch go) {
        return () -> {
            ready.countDown();
            if (!go.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("start timeout");
            }
            try {
                call.run();
                return true;
            } catch (ValidationException refused) {
                return false;
            }
        };
    }

    /** Beds this property's bookings hold, or are promised. */
    private int heldBeds() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM tenancy.bed_holds WHERE property_id = ? AND state IN ('HELD', 'WAITING')",
                Integer.class, property);
    }

    private String holdStateOf(UUID request) {
        return jdbc.queryForObject(
                "SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'BOOKING' AND owner_id = ?",
                String.class, request);
    }

    private int reservedIn(UUID theRoom) {
        return jdbc.queryForObject("SELECT reserved_count FROM property.rooms WHERE id = ?", Integer.class, theRoom);
    }

    private Integer slotOf(UUID request) {
        return jdbc.queryForObject("SELECT visit_slot FROM booking.requests WHERE id = ?", Integer.class, request);
    }

    private int requestCount() {
        return jdbc.queryForObject("SELECT count(*) FROM booking.requests WHERE prospect_user_id = ?", Integer.class, tenant);
    }
}
