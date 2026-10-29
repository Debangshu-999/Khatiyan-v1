package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingConversionResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingConvertibleResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.ConvertBookingRequest;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingMoveInAction;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.TenantDetailsInput;
import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.compliance.model.LegalStatement;
import com.khatiyan.d_modules.compliance.model.MainClauseType;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.IdDocumentType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.support.IntegrationTest;

/**
 * A confirmed booking becoming a stay, against the real schema and through
 * real onboarding: the agreement is written, the bed is taken and the stay's
 * outcome is carried back, with nothing replaced (user's rules, 2026-10-10).
 *
 * <p>Sunrise takes a Rs 2,000 token that does not come back when the tenant
 * walks away. Lakeview gives it back. Every booking is for three days from
 * now, the soonest the rules allow, and the clock is moved to that morning.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingConversionIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingTokenService tokens;
    @Autowired private BookingConversionService conversion;
    @Autowired private BookingBedNoticeScheduler bedNotices;
    @Autowired private BookingSettingsService settings;
    @Autowired private TenancyModule tenancies;
    @Autowired private SettableClock clock;
    @Autowired private BookingTenantNotices tenantNotices;

    private BookingFixtures fx;
    private UUID sunrise;
    private UUID sunriseOwner;
    private UUID sunriseRoom;
    private UUID lakeview;
    private UUID lakeviewOwner;
    private UUID lakeviewRoom;
    private UUID tenant;
    private LocalDate today;
    private LocalDate moveIn;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        moveIn = today.plusDays(3);
        fx = new BookingFixtures(jdbc);
        sunrise = fx.property();
        sunriseOwner = fx.ownerAccount(sunrise);
        jdbc.update("UPDATE property.properties SET standard_deposit_paise = 1000000 WHERE id = ?", sunrise);
        sunriseRoom = fx.room(sunrise, 6, 0);
        fx.paymentDetails(sunrise, true, false);
        settings.create(sunriseOwner, sunrise, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
        lakeview = fx.property();
        lakeviewOwner = fx.ownerAccount(lakeview);
        lakeviewRoom = fx.room(lakeview, 6, 0);
        fx.paymentDetails(lakeview, true, false);
        settings.create(lakeviewOwner, lakeview, new SaveBookingSettingsRequest(true, 200_000L, true, 21, true));
        tenant = fx.appUser();
    }

    @AfterEach
    void remove() throws InterruptedException {
        clock.set(null);
        // Onboarding tells other modules what happened after it commits. Let them finish before the rows go.
        for (int waited = 0; waited < 50 && unfinishedEvents() > 0; waited++) {
            Thread.sleep(100);
        }
        fx.remove();
    }

    // ---- Converting ----------------------------------------------------------

    @Test
    void aTenantWhoArrivesIsOnboardedIntoTheBedTheyBookedAtTheTermsAgreed() {
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, 750_000L);
        String phone = fx.phoneOf(tenant);

        // Before the day there is a booking to show, and nothing to do about it yet.
        BookingConvertibleResponse early = conversion.convertibleFor(sunriseOwner, sunrise, phone).orElseThrow();
        assertThat(early.requestId()).isEqualTo(booked.id());
        assertThat(early.canConvertNow()).isFalse();
        assertThat(early.whyNot()).contains(moveIn.toString());
        assertThatThrownBy(() -> convert(sunriseOwner, sunrise, booked.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining(moveIn.toString());
        assertThat(bookings.forProperty(sunriseOwner, sunrise, booked.id()).bedReady()).isNull();

        clock.set(morningOf(moveIn));
        BookingConvertibleResponse due = conversion.convertibleFor(sunriseOwner, sunrise, phone).orElseThrow();
        assertThat(due.canConvertNow()).isTrue();
        assertThat(due.whyNot()).isNull();
        // The form is shown what was agreed, not what the room lists today.
        assertThat(due.agreedRentPaise()).isEqualTo(750_000L);
        assertThat(due.depositPaise()).isEqualTo(1_000_000L);
        assertThat(due.roomId()).isEqualTo(sunriseRoom);
        BookingRequestResponse onTheDay = bookings.forProperty(sunriseOwner, sunrise, booked.id());
        assertThat(onTheDay.bedReady()).isTrue();
        assertThat(onTheDay.allowedMoveInActions()).containsExactly(BookingMoveInAction.CONVERT);
        assertThat(bookings.forTenant(tenant, booked.id()).allowedMoveInActions()).isEmpty();
        assertThat(reservedIn(sunriseRoom)).isEqualTo(1);
        assertThat(occupiedIn(sunriseRoom)).isZero();
        // The bed is free, so nobody is told to free it.
        assertThat(bedNotices.notifyDue()).isZero();

        BookingConversionResponse converted = convert(sunriseOwner, sunrise, booked.id());
        TenancyResponse stay = converted.stay().tenancy();
        assertThat(converted.referenceCode()).isEqualTo(booked.referenceCode());
        assertThat(stay.userId()).isEqualTo(tenant);
        assertThat(stay.propertyId()).isEqualTo(sunrise);
        assertThat(stay.roomId()).isEqualTo(sunriseRoom);
        assertThat(stay.rentAmountPaise()).isEqualTo(750_000L);
        assertThat(stay.depositAmountPaise()).isEqualTo(1_000_000L);
        assertThat(stay.startDate()).isEqualTo(moveIn);
        // Ordinary onboarding: an agreement to sign, and no stay until it is.
        assertThat(stay.status()).isEqualTo(TenancyStatus.PENDING_ACCEPTANCE);
        assertThat(converted.stay().agreement()).isNotNull();

        // The bed went from the booking to the stay without ever being free.
        assertThat(holdStateOf(booked.id())).isEqualTo("CONSUMED");
        assertThat(reservedIn(sunriseRoom)).isZero();
        assertThat(occupiedIn(sunriseRoom)).isEqualTo(1);
        BookingRequestResponse after = bookings.forProperty(sunriseOwner, sunrise, booked.id());
        assertThat(after.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(after.tenancyId()).isEqualTo(stay.id());
        assertThat(after.convertedAt()).isEqualTo(morningOf(moveIn));
        // Onboarded: the token is non refundable, and the property's income from now (user, 2026-10-28).
        assertThat(after.token().status()).isEqualTo(BookingTokenStatus.KEPT);
        assertThat(after.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .endsWith(BookingActionType.CONFIRMED, BookingActionType.CONVERTED);
        // From here the way out is the agreement's own decline or withdrawal, not the booking's cancel.
        assertThat(after.allowedActions()).isEmpty();
        assertThat(after.allowedMoveInActions()).isEmpty();
        assertThat(bookings.forTenant(tenant, booked.id()).allowedActions()).isEmpty();
        assertThatThrownBy(() -> negotiation.cancel(tenant, booked.id())).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> negotiation.cancelForProperty(sunriseOwner, sunrise, booked.id(), "Changed plans."))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> convert(sunriseOwner, sunrise, booked.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already been converted");
        assertThat(conversion.convertibleFor(sunriseOwner, sunrise, phone)).isEmpty();

        // The tenant signs and the stay starts. The booking is over, and it ended well.
        tenancies.acceptTermsAndActivate(stay.id(), tenant);
        BookingRequestResponse movedIn = bookings.forTenant(tenant, booked.id());
        assertThat(movedIn.status()).isEqualTo(BookingStatus.MOVED_IN);
        assertThat(movedIn.endCause()).isEqualTo(BookingEndCause.MOVED_IN);
        assertThat(movedIn.closedAt()).isNotNull();
        assertThat(movedIn.cancelledBy()).isNull();
        assertThat(movedIn.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .endsWith(BookingActionType.CONVERTED, BookingActionType.MOVED_IN);
        assertThat(movedIn.allowedActions()).isEmpty();
        assertThat(movedIn.allowedTokenActions()).isEmpty();
        assertThat(occupiedIn(sunriseRoom)).isEqualTo(1);

        // The token the property already holds comes off the first bill, as a line of its own.
        assertThat(movedIn.token().status()).isEqualTo(BookingTokenStatus.ADJUSTED);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM billing.billing_cycle_line_items
                WHERE tenancy_id = ? AND type = 'BOOKING_TOKEN' AND amount_paise = 200000
                  AND label = 'Booking token received' AND description = ?
                """, Integer.class, stay.id(), "Receipt " + movedIn.token().receiptCode())).isEqualTo(1);
        long charged = jdbc.queryForObject("""
                SELECT COALESCE(SUM(amount_paise), 0) FROM billing.billing_cycle_line_items
                WHERE tenancy_id = ? AND type IN ('RENT', 'DEPOSIT')
                """, Long.class, stay.id());
        assertThat(charged).isGreaterThan(200_000L);
        // The tenant pays the balance, and the owner's discount figure is not touched: this is money received.
        assertThat(jdbc.queryForMap("""
                SELECT total_amount_paise, booking_token_credit_paise, discount_amount_paise
                FROM billing.billing_cycles WHERE tenancy_id = ?
                """, stay.id())).containsEntry("total_amount_paise", charged - 200_000L)
                .containsEntry("booking_token_credit_paise", 200_000L)
                .containsEntry("discount_amount_paise", 0L);
        // The bill is smaller by the token, so the token is counted as income beside it: once, at onboarding.
        assertThat(jdbc.query(
                "SELECT source, amount_paise FROM expense.income_entries WHERE property_id = ?",
                (row, index) -> row.getString("source") + "=" + row.getLong("amount_paise"), sunrise))
                .containsExactly("Booking token non refundable=200000");
        assertThat(bookings.pageForProperty(sunriseOwner, sunrise, BookingListFilter.OPEN, 0, 20).items()).isEmpty();
        assertThat(bookings.pageForProperty(sunriseOwner, sunrise, BookingListFilter.HISTORY, 0, 20).items())
                .extracting(BookingRequestListItemResponse::status).containsExactly(BookingStatus.MOVED_IN);

        // The stay being active is what converts their lead (user, 2026-10-11). Nothing told it but the booking.
        com.khatiyan.support.PublishedEvents.awaitHandled(jdbc, "LeadBookingEventListener", sunrise);
        assertThat(jdbc.queryForMap(
                "SELECT stage, state, close_reason, converted_tenancy_id FROM lead.leads WHERE property_id = ?"
                        + " AND prospect_user_id = ?", sunrise, tenant))
                .containsEntry("stage", "MOVED_IN").containsEntry("state", "CLOSED")
                .containsEntry("close_reason", "CONVERTED").containsEntry("converted_tenancy_id", stay.id());
    }

    // "Why should clauses be read only, agreement is not decided during booking" (user, 2026-10-28):
    // the booking fixes the money and the term, the clauses are chosen on arrival as on any onboarding.
    @Test
    void theClausesChosenOnArrivalAreTheOnesTheAgreementCarries() {
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        clock.set(morningOf(moveIn));
        ConvertBookingRequest withoutInspection = withTemplate(onArrival(),
                new AgreementTemplate(Set.of(MainClauseType.INSPECTION), List.of(), List.of(), null, ""));

        BookingConversionResponse converted = conversion.convert(sunriseOwner, sunrise, booked.id(),
                withoutInspection, "10.0.0.7", UUID.randomUUID());

        assertThat(converted.stay().agreement().clauses()).extracting(AgreementClause::getMainType)
                .doesNotContain(MainClauseType.INSPECTION)
                .contains(MainClauseType.RENT);
    }

    @Test
    void anyoneWhoMayOnboardConvertsNotOnlyTheBookingsHandler() {
        UUID anita = fx.manager(sunrise, "Anita");
        UUID chitra = fx.manager(sunrise, "Chitra");
        fx.grantBookings(sunrise, anita);
        // Chitra onboards tenants. She is not on the bookings access list at all.
        fx.grant(sunrise, chitra, "TENANCY_CREATE");
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        fx.assign(booked.id(), anita);
        clock.set(morningOf(moveIn));

        assertThatThrownBy(() -> convert(fx.person(), sunrise, booked.id())).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> conversion.convertibleFor(fx.person(), sunrise, fx.phoneOf(tenant)))
                .isInstanceOf(ForbiddenException.class);
        // Another property's owner cannot reach it through their own property.
        assertThatThrownBy(() -> convert(lakeviewOwner, lakeview, booked.id())).isInstanceOf(RuntimeException.class);
        assertThat(holdStateOf(booked.id())).isEqualTo("HELD");

        assertThat(conversion.convertibleFor(chitra, sunrise, fx.phoneOf(tenant))).isPresent();
        BookingConversionResponse converted = convert(chitra, sunrise, booked.id());
        assertThat(converted.stay().tenancy().userId()).isEqualTo(tenant);
        assertThat(bookings.forProperty(sunriseOwner, sunrise, booked.id()).tenancyId())
                .isEqualTo(converted.stay().tenancy().id());
    }

    @Test
    void aLateArrivalStartsTheStayOnTheDayTheyCome() {
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        clock.set(morningOf(moveIn.plusDays(2)));

        BookingConversionResponse converted = convert(sunriseOwner, sunrise, booked.id());
        // Never backdated to the day they booked for.
        assertThat(converted.stay().tenancy().startDate()).isEqualTo(moveIn.plusDays(2));
        // And the booking still says what was booked.
        assertThat(bookings.forTenant(tenant, booked.id()).moveInDate()).isEqualTo(moveIn);
    }

    @Test
    void whatOnboardingRefusesLeavesTheBookingAndItsBedAsTheyWere() {
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        clock.set(morningOf(moveIn));
        ConvertBookingRequest good = onArrival();

        // Nobody established who the tenant is.
        assertThatThrownBy(() -> conversion.convert(sunriseOwner, sunrise, booked.id(), new ConvertBookingRequest(
                null, null, null, null, good.tenant(), null, null), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("identity");
        // No address for the agreement to name them by.
        assertThatThrownBy(() -> conversion.convert(sunriseOwner, sunrise, booked.id(), new ConvertBookingRequest(
                good.idCheck(), good.idCheckStatementText(), null, null, null, null, null), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> conversion.convert(sunriseOwner, sunrise, booked.id(), null, "10.0.0.7",
                UUID.randomUUID())).isInstanceOf(ValidationException.class);
        // A declaration the app no longer shows. Onboarding itself refuses this one, after the bed was passed on.
        assertThatThrownBy(() -> conversion.convert(sunriseOwner, sunrise, booked.id(), new ConvertBookingRequest(
                good.idCheck(), "I looked at something.", null, null, good.tenant(), null, null), "10.0.0.7",
                UUID.randomUUID())).isInstanceOf(ValidationException.class).hasMessageContaining("declaration");

        // Nothing stuck: no stay, the booking unconverted, and the bed still held for it.
        BookingRequestResponse read = bookings.forProperty(sunriseOwner, sunrise, booked.id());
        assertThat(read.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(read.tenancyId()).isNull();
        assertThat(read.allowedMoveInActions()).containsExactly(BookingMoveInAction.CONVERT);
        assertThat(holdStateOf(booked.id())).isEqualTo("HELD");
        assertThat(reservedIn(sunriseRoom)).isEqualTo(1);
        assertThat(occupiedIn(sunriseRoom)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tenancy.tenancies WHERE property_id = ?",
                Integer.class, sunrise)).isZero();
        // And it still converts.
        assertThat(convert(sunriseOwner, sunrise, booked.id()).stay().tenancy().userId()).isEqualTo(tenant);
    }

    // ---- Before the day: the one date push ---------------------------------------

    @Test
    void aTenantPushesTheMoveInDateOnceToALaterDayAndOnlyBeforeTheDay() {
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        assertThat(bookings.forTenant(tenant, booked.id()).allowedMoveInActions())
                .containsExactly(BookingMoveInAction.PUSH_DATE);
        assertThat(booked.latestPushDate()).isEqualTo(moveIn.plusDays(7));
        // The property never moves the tenant's date.
        assertThat(booked.allowedMoveInActions()).isEmpty();

        // Later, and by seven days at most.
        for (LocalDate refused : new LocalDate[]{null, moveIn.minusDays(1), moveIn, moveIn.plusDays(8)}) {
            assertThatThrownBy(() -> conversion.pushMoveInDate(tenant, booked.id(), refused))
                    .isInstanceOf(ValidationException.class).hasMessageContaining(moveIn.plusDays(7).toString());
        }
        assertThatThrownBy(() -> conversion.pushMoveInDate(fx.person(), booked.id(), moveIn.plusDays(2)))
                .isInstanceOf(RuntimeException.class);

        BookingRequestResponse pushed = conversion.pushMoveInDate(tenant, booked.id(), moveIn.plusDays(7));
        assertThat(pushed.moveInDate()).isEqualTo(moveIn.plusDays(7));
        // The date first asked for stays on record, and nothing else about the terms moves.
        assertThat(pushed.originalMoveInDate()).isEqualTo(moveIn);
        assertThat(pushed.moveInDatePushed()).isTrue();
        assertThat(pushed.agreedRentPaise()).isEqualTo(booked.agreedRentPaise());
        assertThat(pushed.latestMoveInDate()).isEqualTo(booked.latestMoveInDate());
        assertThat(pushed.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(pushed.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .endsWith(BookingActionType.CONFIRMED, BookingActionType.DATE_PUSHED);
        // The same bed is kept, for the new day.
        assertThat(holdStateOf(booked.id())).isEqualTo("HELD");
        assertThat(jdbc.queryForObject(
                "SELECT move_in_date FROM tenancy.bed_holds WHERE owner_kind = 'BOOKING' AND owner_id = ?",
                LocalDate.class, booked.id())).isEqualTo(moveIn.plusDays(7));
        assertThat(reservedIn(sunriseRoom)).isEqualTo(1);

        // Once only.
        assertThat(pushed.allowedMoveInActions()).isEmpty();
        assertThatThrownBy(() -> conversion.pushMoveInDate(tenant, booked.id(), moveIn.plusDays(3)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("once already");
        // And the booking is now for the new day: it does not convert on the old one.
        clock.set(morningOf(moveIn));
        assertThatThrownBy(() -> convert(sunriseOwner, sunrise, booked.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining(moveIn.plusDays(7).toString());
        clock.set(morningOf(moveIn.plusDays(7)));
        assertThat(convert(sunriseOwner, sunrise, booked.id()).stay().tenancy().startDate())
                .isEqualTo(moveIn.plusDays(7));
    }

    @Test
    void theLastMomentForADatePushIsTheEndOfTheDayBeforeMoveIn() {
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        // Terms agreed and the token still awaited: nothing is confirmed, so there is no date to push.
        UUID second = fx.appUser();
        UUID enquiry = fx.attendedEnquiry(sunrise, second, today.minusDays(1));
        BookingRequestResponse agreedOnly = bookings.create(second, BookingFixtures.ask(enquiry, sunriseRoom, moveIn));
        negotiation.acceptForProperty(sunriseOwner, sunrise, agreedOnly.id(), 1);
        assertThatThrownBy(() -> conversion.pushMoveInDate(second, agreedOnly.id(), moveIn.plusDays(2)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("not confirmed yet");

        // On the day itself it is too late.
        clock.set(moveIn.atStartOfDay(IST).toInstant());
        assertThat(bookings.forTenant(tenant, booked.id()).allowedMoveInActions()).isEmpty();
        assertThatThrownBy(() -> conversion.pushMoveInDate(tenant, booked.id(), moveIn.plusDays(2)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("until the day before");

        // A minute before midnight the night before, it is not.
        clock.set(moveIn.atStartOfDay(IST).toInstant().minusSeconds(60));
        assertThat(conversion.pushMoveInDate(tenant, booked.id(), moveIn.plusDays(2)).moveInDate())
                .isEqualTo(moveIn.plusDays(2));
    }

    // ---- The stay falls through ------------------------------------------------

    @Test
    void anAgreementLeftUnsignedOrDeclinedCancelsTheBookingAndTheTokenStaysNonRefundable() {
        // Left unsigned at Sunrise, which keeps tokens.
        BookingRequestResponse unsigned = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        // Declined at Lakeview, which gives them back to a tenant who walks away before onboarding.
        UUID second = fx.appUser();
        BookingRequestResponse declined = confirmed(second, lakeview, lakeviewOwner, lakeviewRoom, null);
        clock.set(morningOf(moveIn));
        UUID unsignedStay = convert(sunriseOwner, sunrise, unsigned.id()).stay().tenancy().id();
        UUID declinedStay = convert(lakeviewOwner, lakeview, declined.id()).stay().tenancy().id();

        tenancies.cancelPendingTenancyBySystem(unsignedStay, "The agreement was not signed in time.");
        BookingRequestResponse afterExpiry = bookings.forProperty(sunriseOwner, sunrise, unsigned.id());
        assertThat(afterExpiry.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(afterExpiry.endCause()).isEqualTo(BookingEndCause.TENANT_DID_NOT_SIGN);
        // Nobody cancelled it. A clock did.
        assertThat(afterExpiry.cancelledBy()).isNull();
        assertThat(afterExpiry.token().status()).isEqualTo(BookingTokenStatus.KEPT);
        assertThat(afterExpiry.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .endsWith(BookingActionType.CONVERTED, BookingActionType.CANCELLED);
        // The stay's own cancellation freed the bed. The booking had already given it up.
        assertThat(holdStateOf(unsigned.id())).isEqualTo("CONSUMED");
        assertThat(reservedIn(sunriseRoom)).isZero();
        assertThat(occupiedIn(sunriseRoom)).isZero();
        // Not signing costs nothing more: no cooldown, and the visit stays open.
        assertThat(cooldownOf(unsigned.id())).isNull();

        tenancies.declinePendingTenancy(declinedStay, second, "I found another place.");
        BookingRequestResponse afterDecline = bookings.forTenant(second, declined.id());
        assertThat(afterDecline.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(afterDecline.endCause()).isEqualTo(BookingEndCause.TENANT_CANCELLED);
        assertThat(afterDecline.cancelledBy()).isEqualTo(BookingParty.TENANT);
        // Onboarded first, so the token was the property's from then, whatever its rule (user, 2026-10-28).
        assertThat(afterDecline.token().status()).isEqualTo(BookingTokenStatus.KEPT);
        assertThat(cooldownOf(declined.id())).isNull();
        assertThat(occupiedIn(lakeviewRoom)).isZero();
    }

    @Test
    void thePropertyCannotRemoveAStayOnboardedFromABooking() {
        // Otherwise a booking could be onboarded and removed at once, the token kept (user, 2026-10-29).
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        clock.set(morningOf(moveIn));
        UUID stay = convert(sunriseOwner, sunrise, booked.id()).stay().tenancy().id();
        assertThat(tenancies.findById(stay).orElseThrow().fromBooking()).isTrue();

        assertThatThrownBy(() -> tenancies.cancelPendingTenancyByManager(sunriseOwner, stay, "Changed my mind."))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("onboarded from a booking");
        assertThat(tenancies.findById(stay).orElseThrow().status()).isEqualTo(TenancyStatus.PENDING_ACCEPTANCE);
        assertThat(bookings.forTenant(tenant, booked.id()).status()).isNotEqualTo(BookingStatus.CANCELLED);
    }

    // ---- What the tenant is told (user, 2026-10-18) -----------------------------

    @Test
    void theTenantIsToldWhenTheBookingIsConfirmedWhenTheDateMovesAndTheDayBeforeTheyMoveIn() {
        verifiedEmail(tenant);
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);

        assertThat(told(booked.id(), "TENANT_CONFIRMED")).isTrue();
        assertThat(notificationFor(booked.id(), "confirmed your booking")).isTrue();
        assertThat(mailKinds(tenant)).containsExactly("BOOKING_CONFIRMED");
        String confirmedMail = mailText(tenant, "BOOKING_CONFIRMED");
        // The deposit and the first month, less the token: the screen's own sum.
        assertThat(confirmedMail).contains("Room " + booked.roomNumber()).contains(booked.referenceCode())
                .contains("Due on the day: " + rupees(booked.dueAtMoveInPaise()))
                .contains("Token paid: ₹2,000");
        // The id rides only in the Open in app link, which is how the app finds the booking. The words never show it.
        assertThat(confirmedMail.replaceAll("https?://\\S+", "")).doesNotContain(booked.id().toString());

        conversion.pushMoveInDate(tenant, booked.id(), moveIn.plusDays(2));
        assertThat(told(booked.id(), "TENANT_DATE_MOVED")).isTrue();
        assertThat(mailKinds(tenant)).containsExactly("BOOKING_CONFIRMED", "BOOKING_DATE_MOVED");

        // 10 am the day before the new date. Once.
        clock.set(moveIn.plusDays(1).atTime(10, 0).atZone(IST).toInstant());
        assertThat(tenantNotices.remindMoveInsDue()).isEqualTo(1);
        assertThat(tenantNotices.remindMoveInsDue()).isZero();
        assertThat(mailKinds(tenant)).containsExactly("BOOKING_CONFIRMED", "BOOKING_DATE_MOVED", "BOOKING_MOVE_IN_TOMORROW");
        // A second delivery of the same change says nothing new.
        tenantNotices.changed(booked.id());
        assertThat(mailKinds(tenant)).hasSize(3);
    }

    @Test
    void aTenantWithNoVerifiedEmailGetsThePushButNoMail() {
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);
        assertThat(told(booked.id(), "TENANT_CONFIRMED")).isTrue();
        assertThat(notificationFor(booked.id(), "confirmed your booking")).isTrue();
        assertThat(mailKinds(tenant)).isEmpty();
    }

    private void verifiedEmail(UUID user) {
        jdbc.update("UPDATE auth.users SET email = ?, is_email_verified = true WHERE id = ?",
                "tenant-" + user + "@example.test", user);
    }

    /** Whether the tenant was told this, which happens after the change commits. */
    private boolean told(UUID request, String kind) {
        for (int waited = 0; waited < 50; waited++) {
            Integer found = jdbc.queryForObject(
                    "SELECT count(*) FROM booking.notices WHERE request_id = ? AND kind = ?", Integer.class, request, kind);
            if (found != null && found == 1) {
                return true;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private List<String> mailKinds(UUID user) {
        return jdbc.queryForList("SELECT kind FROM mail.outbox WHERE user_id = ? ORDER BY created_at", String.class, user);
    }

    private String mailText(UUID user, String kind) {
        return jdbc.queryForObject("SELECT text_body FROM mail.outbox WHERE user_id = ? AND kind = ?", String.class, user, kind);
    }

    private static String rupees(long paise) {
        return BookingMails.rupees(paise);
    }

    // ---- Nobody comes, or the bed is not there ---------------------------------

    @Test
    void aNoShowIsClosedFromTheDayAfterAndTheHandlerDecidesTheToken() {
        UUID bilal = fx.manager(sunrise, "Bilal");
        fx.grantBookings(sunrise, bilal);
        BookingRequestResponse booked = confirmed(tenant, sunrise, sunriseOwner, sunriseRoom, null);

        // The tenant has the move-in day (user, 2026-10-28).
        clock.set(morningOf(moveIn));
        assertThatThrownBy(() -> conversion.closeAsDidNotArrive(sunriseOwner, sunrise, booked.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining(moveIn.plusDays(1).toString());

        clock.set(morningOf(moveIn.plusDays(2)));
        assertThat(bookings.forProperty(sunriseOwner, sunrise, booked.id()).allowedMoveInActions())
                .containsExactlyInAnyOrder(BookingMoveInAction.CONVERT, BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
        // A manager who does not handle it cannot call it a no-show.
        assertThatThrownBy(() -> conversion.closeAsDidNotArrive(bilal, sunrise, booked.id()))
                .isInstanceOf(ValidationException.class);

        // A token was received: it waits as "Action pending" for the handler (user, 2026-10-28).
        BookingRequestResponse closed = conversion.closeAsDidNotArrive(sunriseOwner, sunrise, booked.id());
        assertThat(closed.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(closed.endCause()).isEqualTo(BookingEndCause.TENANT_DID_NOT_ARRIVE);
        assertThat(closed.cancelledBy()).isEqualTo(BookingParty.MANAGEMENT);
        assertThat(closed.token().status()).isEqualTo(BookingTokenStatus.DECISION_PENDING);
        // Refunded, though Sunrise's own rule would keep it: the handler decides, from the token's record.
        assertThat(tokens.decideToken(sunriseOwner, sunrise, booked.id(), true).token().status())
                .isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThatThrownBy(() -> tokens.decideToken(sunriseOwner, sunrise, booked.id(), false))
                .isInstanceOf(ValidationException.class);
        assertThat(holdStateOf(booked.id())).isEqualTo("RELEASED");
        assertThat(reservedIn(sunriseRoom)).isZero();
        assertThat(cooldownOf(booked.id())).isNull();
        assertThat(slotOf(booked.id())).isEqualTo(1);
        assertThat(closed.allowedMoveInActions()).isEmpty();
    }

    @Test
    void aBedStillOccupiedIsThePropertysToFixAndTheTenantMayLeaveAfterThreeMoreDays() {
        // A full room whose one occupant has an approved exit. The booking is for the day after they leave.
        UUID full = fx.room(sunrise, 1, 0);
        LocalDate checkout = today.plusDays(4);
        LocalDate booksFor = checkout.plusDays(1);
        UUID exit = fx.approvedExit(sunrise, full, checkout);
        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.ask(
                fx.attendedEnquiry(sunrise, tenant, today.minusDays(1)), full, exit, booksFor,
                UUID.randomUUID().toString()));
        negotiation.acceptForProperty(sunriseOwner, sunrise, sent.id(), 1);
        tokens.markReceived(sunriseOwner, sunrise, sent.id(), ManualPaymentMethod.UPI, null, null);
        negotiation.confirmForProperty(sunriseOwner, sunrise, sent.id());
        assertThat(holdStateOf(sent.id())).isEqualTo("WAITING");

        // The day comes and the person leaving has not gone.
        clock.set(morningOf(booksFor));
        BookingRequestResponse ownersView = bookings.forProperty(sunriseOwner, sunrise, sent.id());
        assertThat(ownersView.bedReady()).isFalse();
        // The handler can move them to a free bed from the day itself (user, 2026-10-27).
        assertThat(ownersView.allowedMoveInActions()).containsExactly(BookingMoveInAction.MOVE_TO_ANOTHER_BED);
        BookingConvertibleResponse offered = conversion.convertibleFor(sunriseOwner, sunrise, fx.phoneOf(tenant))
                .orElseThrow();
        assertThat(offered.canConvertNow()).isFalse();
        assertThat(offered.whyNot()).contains("not free yet");
        assertThatThrownBy(() -> convert(sunriseOwner, sunrise, sent.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("not free yet");

        // The property is told, once, that this bed must be freed today for this booking to start.
        assertThat(bedNotices.notifyDue()).isEqualTo(1);
        assertThat(bedNotices.notifyDue()).isZero();
        assertThat(noticesFor(sent.id())).isEqualTo(1);
        // The tenant is told too, once, on the first day (2026-10-18).
        assertThat(told(sent.id(), "TENANT_BED_NOT_READY")).isTrue();
        assertThat(notificationFor(sent.id(), "is still occupied. The property has been asked to free it")).isTrue();
        assertThat(notificationFor(sent.id(), "needs to be freed today to start Asha Rao's booking "
                + sent.referenceCode())).isTrue();

        // Two days on, a no-show can be closed even with the bed still occupied (user, 2026-10-27).
        clock.set(morningOf(booksFor.plusDays(2)));
        // Told again on a later day, in other words: it is no longer "today".
        assertThat(bedNotices.notifyDue()).isEqualTo(1);
        assertThat(noticesFor(sent.id())).isEqualTo(2);
        assertThat(notificationFor(sent.id(), "is still occupied")).isTrue();
        assertThat(bookings.forProperty(sunriseOwner, sunrise, sent.id()).allowedMoveInActions())
                .containsExactlyInAnyOrder(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE, BookingMoveInAction.MOVE_TO_ANOTHER_BED);

        // The move-in day and three more are the property's.
        clock.set(morningOf(booksFor.plusDays(3)));
        assertThat(bookings.forTenant(tenant, sent.id()).allowedMoveInActions()).isEmpty();
        assertThatThrownBy(() -> conversion.leaveBecauseBedNotReady(tenant, sent.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining(booksFor.plusDays(3).toString());

        clock.set(morningOf(booksFor.plusDays(4)));
        // The property's days are over. It is the tenant's choice now, and the daily telling stops.
        assertThat(bedNotices.notifyDue()).isZero();
        assertThat(bookings.forTenant(tenant, sent.id()).allowedMoveInActions())
                .containsExactly(BookingMoveInAction.LEAVE_BED_NOT_READY);
        // Someone else cannot leave for them.
        assertThatThrownBy(() -> conversion.leaveBecauseBedNotReady(fx.person(), sent.id()))
                .isInstanceOf(RuntimeException.class);

        BookingRequestResponse left = conversion.leaveBecauseBedNotReady(tenant, sent.id());
        assertThat(left.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(left.endCause()).isEqualTo(BookingEndCause.BED_NOT_READY);
        assertThat(left.cancelledBy()).isEqualTo(BookingParty.TENANT);
        // Sunrise keeps tokens when a tenant walks away. This tenant did not: the bed was never there.
        assertThat(left.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(holdStateOf(sent.id())).isEqualTo("RELEASED");
        assertThat(cooldownOf(sent.id())).isNull();
        assertThat(slotOf(sent.id())).isNull();
    }

    @Test
    void anOccupiedBedIsSwappedByTheHandlerAtTheDeskAndTheBookingCanThenBeOnboarded() {
        UUID full = fx.room(sunrise, 1, 0);
        LocalDate checkout = today.plusDays(4);
        LocalDate booksFor = checkout.plusDays(1);
        UUID exit = fx.approvedExit(sunrise, full, checkout);
        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.ask(
                fx.attendedEnquiry(sunrise, tenant, today.minusDays(1)), full, exit, booksFor,
                UUID.randomUUID().toString()));
        negotiation.acceptForProperty(sunriseOwner, sunrise, sent.id(), 1);
        tokens.markReceived(sunriseOwner, sunrise, sent.id(), ManualPaymentMethod.UPI, null, null);
        BookingRequestResponse confirmed = negotiation.confirmForProperty(sunriseOwner, sunrise, sent.id());

        // Not before the day.
        assertThatThrownBy(() -> conversion.moveToAnotherBed(sunriseOwner, sunrise, sent.id(), sunriseRoom))
                .isInstanceOf(ValidationException.class);
        clock.set(morningOf(booksFor));
        assertThatThrownBy(() -> conversion.moveToAnotherBed(sunriseOwner, sunrise, sent.id(), full))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already booked");

        BookingRequestResponse moved = conversion.moveToAnotherBed(sunriseOwner, sunrise, sent.id(), sunriseRoom);
        assertThat(moved.roomId()).isEqualTo(sunriseRoom);
        assertThat(moved.bedReady()).isTrue();
        // The agreed rent and the token stay as they were.
        assertThat(moved.agreedRentPaise()).isEqualTo(confirmed.agreedRentPaise());
        assertThat(moved.token().status()).isEqualTo(BookingTokenStatus.RECEIVED);
        assertThat(moved.history()).extracting(BookingRequestResponse.HistoryItem::type).endsWith(BookingActionType.BED_MOVED);
        // Ready to onboard now, and nothing more to move.
        assertThat(moved.allowedMoveInActions()).containsExactly(BookingMoveInAction.CONVERT);
        assertThat(reservedIn(sunriseRoom)).isOne();
    }

    @Test
    void aTenantWhoseBedIsNotReadyMayTakeAnotherBedThePropertyOffers() {
        UUID full = fx.room(sunrise, 1, 0);
        UUID alsoFull = fx.room(sunrise, 1, 1);
        LocalDate checkout = today.plusDays(4);
        LocalDate booksFor = checkout.plusDays(1);
        UUID exit = fx.approvedExit(sunrise, full, checkout);
        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.ask(
                fx.attendedEnquiry(sunrise, tenant, today.minusDays(1)), full, exit, booksFor,
                UUID.randomUUID().toString()));
        negotiation.acceptForProperty(sunriseOwner, sunrise, sent.id(), 1);
        tokens.markReceived(sunriseOwner, sunrise, sent.id(), ManualPaymentMethod.UPI, null, null);
        negotiation.confirmForProperty(sunriseOwner, sunrise, sent.id());

        // The property's own days come first.
        clock.set(morningOf(booksFor.plusDays(3)));
        assertThat(bookings.forProperty(sunriseOwner, sunrise, sent.id()).allowedMoveInActions())
                .containsExactlyInAnyOrder(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE, BookingMoveInAction.MOVE_TO_ANOTHER_BED);
        assertThatThrownBy(() -> conversion.offerAnotherBed(sunriseOwner, sunrise, sent.id(), sunriseRoom, 820_000L))
                .isInstanceOf(ValidationException.class).hasMessageContaining(booksFor.plusDays(3).toString());

        clock.set(morningOf(booksFor.plusDays(4)));
        assertThat(bookings.forProperty(sunriseOwner, sunrise, sent.id()).allowedMoveInActions())
                .containsExactlyInAnyOrder(BookingMoveInAction.OFFER_ANOTHER_BED,
                        BookingMoveInAction.CLOSE_DID_NOT_ARRIVE, BookingMoveInAction.MOVE_TO_ANOTHER_BED);
        assertThat(bookings.forTenant(tenant, sent.id()).allowedMoveInActions())
                .containsExactly(BookingMoveInAction.LEAVE_BED_NOT_READY);
        // Nothing has been offered, so there is nothing to take.
        assertThatThrownBy(() -> conversion.acceptAnotherBed(tenant, sent.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("not offered another bed");
        // Not the bed that is the problem, and not a room with nothing free.
        assertThatThrownBy(() -> conversion.offerAnotherBed(sunriseOwner, sunrise, sent.id(), full, 820_000L))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already booked");
        assertThatThrownBy(() -> conversion.offerAnotherBed(sunriseOwner, sunrise, sent.id(), alsoFull, 820_000L))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no bed free");
        assertThatThrownBy(() -> conversion.offerAnotherBed(sunriseOwner, sunrise, sent.id(), sunriseRoom, null))
                .isInstanceOf(ValidationException.class);

        BookingRequestResponse offered = conversion.offerAnotherBed(sunriseOwner, sunrise, sent.id(), sunriseRoom,
                900_000L);
        assertThat(offered.bedOffer().roomId()).isEqualTo(sunriseRoom);
        assertThat(offered.bedOffer().monthlyRentPaise()).isEqualTo(900_000L);
        // Offering holds nothing. The booking is still on the bed it was promised.
        assertThat(reservedIn(sunriseRoom)).isZero();
        assertThat(offered.roomId()).isEqualTo(full);
        assertThat(bookings.forTenant(tenant, sent.id()).allowedMoveInActions()).containsExactlyInAnyOrder(
                BookingMoveInAction.LEAVE_BED_NOT_READY, BookingMoveInAction.ACCEPT_ANOTHER_BED,
                BookingMoveInAction.DECLINE_ANOTHER_BED);

        // The tenant says no, and the property comes back with a better rent, twice.
        BookingRequestResponse declined = conversion.declineAnotherBed(tenant, sent.id());
        assertThat(declined.bedOffer()).isNull();
        assertThat(declined.allowedMoveInActions()).containsExactly(BookingMoveInAction.LEAVE_BED_NOT_READY);
        conversion.offerAnotherBed(sunriseOwner, sunrise, sent.id(), sunriseRoom, 850_000L);
        BookingRequestResponse replaced = conversion.offerAnotherBed(sunriseOwner, sunrise, sent.id(), sunriseRoom,
                820_000L);
        assertThat(replaced.bedOffer().sequence()).isEqualTo(3);
        assertThat(replaced.bedOffer().monthlyRentPaise()).isEqualTo(820_000L);

        BookingRequestResponse taken = conversion.acceptAnotherBed(tenant, sent.id());
        assertThat(taken.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(taken.roomId()).isEqualTo(sunriseRoom);
        assertThat(taken.agreedRentPaise()).isEqualTo(820_000L);
        assertThat(taken.futureBed()).isFalse();
        assertThat(taken.bedOffer()).isNull();
        assertThat(taken.bedReady()).isTrue();
        // The token already paid carries over, and the deposit is as it was.
        assertThat(taken.token().status()).isEqualTo(BookingTokenStatus.RECEIVED);
        assertThat(taken.token().amountPaise()).isEqualTo(200_000L);
        assertThat(taken.depositPaise()).isEqualTo(1_000_000L);
        assertThat(taken.history()).extracting(BookingRequestResponse.HistoryItem::type).endsWith(
                BookingActionType.BED_OFFERED, BookingActionType.BED_OFFER_DECLINED, BookingActionType.BED_OFFERED,
                BookingActionType.BED_OFFERED, BookingActionType.BED_OFFER_ACCEPTED);
        // The new bed is held for them from this moment. The old room is untouched: its occupant is still there.
        assertThat(holdStateOf(sent.id())).isEqualTo("HELD");
        assertThat(reservedIn(sunriseRoom)).isEqualTo(1);
        assertThat(occupiedIn(full)).isEqualTo(1);
        // A bed that is ready is no reason to leave with the token owed back.
        assertThat(taken.allowedMoveInActions()).isEmpty();
        assertThatThrownBy(() -> conversion.leaveBecauseBedNotReady(tenant, sent.id()))
                .isInstanceOf(ValidationException.class);

        // And they can move in straight away, into the new room at the new rent.
        BookingConversionResponse converted = convert(sunriseOwner, sunrise, sent.id());
        assertThat(converted.stay().tenancy().roomId()).isEqualTo(sunriseRoom);
        assertThat(converted.stay().tenancy().rentAmountPaise()).isEqualTo(820_000L);
        assertThat(occupiedIn(sunriseRoom)).isEqualTo(1);
        assertThat(reservedIn(sunriseRoom)).isZero();
    }

    // ---- Helpers -------------------------------------------------------------

    /** A booking for the move-in day, agreed by the owner and confirmed by a token recorded as paid by UPI. */
    private BookingRequestResponse confirmed(UUID person, UUID atProperty, UUID itsOwner, UUID inRoom,
            Long proposedRentPaise) {
        UUID enquiry = fx.attendedEnquiry(atProperty, person, today.minusDays(1));
        BookingRequestResponse sent = bookings.create(person, new CreateBookingRequest(enquiry, inRoom, null, moveIn,
                proposedRentPaise, null, "Asha Rao", "9007433360", null, Gender.FEMALE, LocalDate.of(2000, 1, 1),
                UUID.randomUUID().toString()));
        negotiation.acceptForProperty(itsOwner, atProperty, sent.id(), 1);
        tokens.markReceived(itsOwner, atProperty, sent.id(), ManualPaymentMethod.UPI, null, null);
        return negotiation.confirmForProperty(itsOwner, atProperty, sent.id());
    }

    /** What the person at the desk takes from the tenant: their ID, checked, and their home address. */
    private static ConvertBookingRequest onArrival() {
        return new ConvertBookingRequest(
                new IdCheckDeclarationInput(true, IdDocumentType.AADHAAR, "4821", Gender.FEMALE,
                        LocalDate.of(2000, 1, 1)),
                LegalStatement.TENANT_ID_DECLARATION.text(), null, null,
                new TenantDetailsInput("14 Park Street, Kolkata", "700016", LocalDate.of(2000, 1, 1), Gender.FEMALE),
                null, null);
    }

    private static ConvertBookingRequest withTemplate(ConvertBookingRequest input, AgreementTemplate template) {
        return new ConvertBookingRequest(input.idCheck(), input.idCheckStatementText(), input.verification(),
                input.device(), input.tenant(), input.earlyExitRule(), template);
    }

    private BookingConversionResponse convert(UUID actor, UUID atProperty, UUID request) {
        return conversion.convert(actor, atProperty, request, onArrival(), "10.0.0.7", UUID.randomUUID());
    }

    private static Instant morningOf(LocalDate day) {
        return day.atTime(10, 0).atZone(IST).toInstant();
    }

    private int noticesFor(UUID request) {
        return jdbc.queryForObject("SELECT count(*) FROM booking.notices WHERE request_id = ? AND kind = 'BED_NOT_FREE'",
                Integer.class, request);
    }

    /** Whether a notification about this booking, saying this, has been written. It is written after commit. */
    private boolean notificationFor(UUID request, String saying) {
        for (int waited = 0; waited < 50; waited++) {
            Integer found = jdbc.queryForObject(
                    "SELECT count(*) FROM notification.notifications WHERE source_id = ? AND body LIKE ?",
                    Integer.class, request, "%" + saying + "%");
            if (found != null && found > 0) {
                return true;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private int unfinishedEvents() {
        try {
            return jdbc.queryForObject("SELECT count(*) FROM event_publication WHERE completion_date IS NULL",
                    Integer.class);
        } catch (RuntimeException unreadable) {
            return 0;
        }
    }

    private String holdStateOf(UUID request) {
        return jdbc.queryForObject(
                "SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'BOOKING' AND owner_id = ?",
                String.class, request);
    }

    private int reservedIn(UUID room) {
        return jdbc.queryForObject("SELECT reserved_count FROM property.rooms WHERE id = ?", Integer.class, room);
    }

    private int occupiedIn(UUID room) {
        return jdbc.queryForObject("SELECT occupied_count FROM property.rooms WHERE id = ?", Integer.class, room);
    }

    private Integer slotOf(UUID request) {
        return jdbc.queryForObject("SELECT visit_slot FROM booking.requests WHERE id = ?", Integer.class, request);
    }

    private Instant cooldownOf(UUID request) {
        Timestamp until = jdbc.queryForObject("SELECT cooldown_until FROM booking.requests WHERE id = ?",
                Timestamp.class, request);
        return until == null ? null : until.toInstant();
    }
}
