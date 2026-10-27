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

import com.khatiyan.c_shared.concurrency.ExpectedVersion;
import com.khatiyan.c_shared.concurrency.ExpectedVersionHolder;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.BookingTestClock;
import com.khatiyan.d_modules.booking.BookingTestClock.SettableClock;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingTokenLedgerResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingTokenPayDetailsResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingAction;
import com.khatiyan.d_modules.booking.model.BookingActionType;
import com.khatiyan.d_modules.booking.model.BookingClaimAnswer;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenAction;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.support.IntegrationTest;

/**
 * The booking token against the real schema (user's rules, 2026-10-09). The
 * app records it and never collects it: every case here is one side saying
 * what happened to money that moved somewhere else.
 *
 * <p>Sunrise takes a Rs 2,000 token that does not come back when the tenant
 * cancels. Lakeview takes the same token and gives it back. Both take cash
 * and UPI, and neither asks for a cash code: that has its own suite.
 */
@IntegrationTest
@Import(BookingTestClock.class)
class BookingTokenIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingTokenService tokens;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingRequestExpiryScheduler sweep;
    @Autowired private SettableClock clock;

    private BookingFixtures fx;
    private UUID sunrise;
    private UUID sunriseOwner;
    private UUID sunriseRoom;
    private UUID lakeview;
    private UUID lakeviewOwner;
    private UUID lakeviewRoom;
    private UUID tenant;
    private LocalDate today;

    @BeforeEach
    void seed() {
        clock.set(null);
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        sunrise = fx.property();
        sunriseOwner = fx.ownerOf(sunrise);
        jdbc.update("UPDATE property.properties SET standard_deposit_paise = 1000000 WHERE id = ?", sunrise);
        sunriseRoom = fx.room(sunrise, 6, 0);
        fx.paymentDetails(sunrise, true, false);
        settings.create(sunriseOwner, sunrise, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
        lakeview = fx.property();
        lakeviewOwner = fx.ownerOf(lakeview);
        lakeviewRoom = fx.room(lakeview, 6, 0);
        fx.paymentDetails(lakeview, true, false);
        settings.create(lakeviewOwner, lakeview, new SaveBookingSettingsRequest(true, 200_000L, true, 21, true));
        tenant = fx.person();
    }

    @AfterEach
    void remove() {
        clock.set(null);
        fx.remove();
    }

    // ---- The token starts when terms are agreed ------------------------------

    @Test
    void agreeingTermsStartsATokenThatIsOwed() {
        BookingRequestResponse sent = send(tenant, sunrise, sunriseRoom);
        // Nothing is owed while the rent is still being talked about.
        assertThat(sent.token()).isNull();
        assertThat(sent.allowedTokenActions()).isEmpty();
        assertThatThrownBy(() -> tokens.claimPaid(tenant, sent.id(), ManualPaymentMethod.UPI, null, List.of()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("no token");

        BookingRequestResponse agreed = negotiation.acceptForProperty(sunriseOwner, sunrise, sent.id(), 1);
        assertThat(agreed.token().status()).isEqualTo(BookingTokenStatus.DUE);
        assertThat(agreed.token().amountPaise()).isEqualTo(200_000L);
        assertThat(agreed.token().refundableOnTenantCancel()).isFalse();
        assertThat(agreed.token().dueAt()).isEqualTo(agreed.tokenDueAt());
        assertThat(agreed.token().claimWaiting()).isFalse();
        assertThat(agreed.token().claims()).isEmpty();
        assertThat(agreed.token().receiptCode()).isNull();
        // The owner may record it or let it go. The tenant may say they paid.
        assertThat(agreed.allowedTokenActions())
                .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.WAIVE);
        assertThat(bookings.forTenant(tenant, sent.id()).allowedTokenActions())
                .containsExactly(BookingTokenAction.CLAIM_PAID);
    }

    @Test
    void payDetailsAreShownOnlyWhileTheTokenIsOwed() {
        BookingRequestResponse sent = send(tenant, sunrise, sunriseRoom);
        // The property's payment details are not handed to someone who has only asked.
        assertThatThrownBy(() -> tokens.payDetails(tenant, sent.id())).isInstanceOf(ValidationException.class);
        BookingRequestResponse agreed = negotiation.acceptForProperty(sunriseOwner, sunrise, sent.id(), 1);

        BookingTokenPayDetailsResponse pay = tokens.payDetails(tenant, sent.id());
        assertThat(pay.referenceCode()).isEqualTo(sent.referenceCode());
        assertThat(pay.amountPaise()).isEqualTo(200_000L);
        assertThat(pay.refundableOnTenantCancel()).isFalse();
        assertThat(pay.dueAt()).isEqualTo(agreed.tokenDueAt());
        assertThat(pay.payee().upiVpa()).isEqualTo("sunrise@upi");
        assertThat(pay.acceptedMethods()).contains(ManualPaymentMethod.CASH, ManualPaymentMethod.UPI);
        // Nobody else can read them through this booking.
        assertThatThrownBy(() -> tokens.payDetails(fx.person(), sent.id())).isInstanceOf(NotFoundException.class);

        tokens.claimPaid(tenant, sent.id(), ManualPaymentMethod.UPI, "UTR 1", null);
        assertThatThrownBy(() -> tokens.payDetails(tenant, sent.id())).isInstanceOf(ValidationException.class);
        tokens.markReceived(sunriseOwner, sunrise, sent.id(), null, null, null);
        assertThatThrownBy(() -> tokens.payDetails(tenant, sent.id())).isInstanceOf(ValidationException.class);
    }

    @Test
    void aTokenIsPaidToItsOwnDetailsWhereThePropertyGaveSome() {
        // Sunrise takes bills in cash and by UPI, and booking tokens into a bank account of their own.
        fx.tokenBankDetails(sunrise, "998877665544", "ICIC0000123", "Sunrise Tokens");
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);

        BookingTokenPayDetailsResponse pay = tokens.payDetails(tenant, agreed.id());
        assertThat(pay.payee().bankAccountNumber()).isEqualTo("998877665544");
        assertThat(pay.payee().bankIfsc()).isEqualTo("ICIC0000123");
        assertThat(pay.payee().payeeName()).isEqualTo("Sunrise Tokens");
        assertThat(pay.payee().upiVpa()).isNull();
        // What a person may record, and what the property still takes at its desk.
        assertThat(pay.acceptedMethods())
                .containsExactly(ManualPaymentMethod.CASH, ManualPaymentMethod.BANK_TRANSFER);

        // The bill's UPI is not where a token goes.
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("does not take");
        tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.BANK_TRANSFER, "UTR 9", null);
        // Received, though bills take no bank transfer here.
        BookingRequestResponse confirmed = tokens.markReceived(sunriseOwner, sunrise, agreed.id(), null, null, null);
        assertThat(confirmed.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(confirmed.token().receivedMethod()).isEqualTo(ManualPaymentMethod.BANK_TRANSFER);
        assertThat(confirmed.token().receivedReference()).isEqualTo("UTR 9");
    }

    @Test
    void aTokenPaidAtTheDeskIsRecordedByTheTenantAndAnsweredByTheProperty() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        // What the pay sheet offers under "Paid at desk": all four, though Sunrise's bills take only cash and UPI.
        assertThat(tokens.payDetails(tenant, agreed.id()).deskMethods()).containsExactly(
                ManualPaymentMethod.CASH, ManualPaymentMethod.CARD, ManualPaymentMethod.UPI,
                ManualPaymentMethod.CHEQUE);

        BookingRequestResponse claimed = tokens.claimPaid(
                tenant, agreed.id(), ManualPaymentMethod.CASH, true, null, List.of("https://img/receipt"));

        BookingRequestResponse.TokenClaim claim = claimed.token().claims().get(0);
        assertThat(claim.method()).isEqualTo(ManualPaymentMethod.CASH);
        assertThat(claim.paidAtDesk()).isTrue();
        assertThat(claimed.token().status()).isEqualTo(BookingTokenStatus.CLAIMED);
        // Answered like any other payment; receipt is separate from final confirmation.
        assertThat(bookings.forProperty(sunriseOwner, sunrise, agreed.id()).allowedTokenActions())
                .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.MARK_NOT_RECEIVED);
        BookingRequestResponse confirmed = tokens.markReceived(sunriseOwner, sunrise, agreed.id(), null, null, null);
        assertThat(confirmed.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(confirmed.token().receivedMethod()).isEqualTo(ManualPaymentMethod.CASH);
        assertThat(confirmed.token().receiptCode()).isNotBlank();

        // A card at the desk of a property whose bills take no card: recorded, and received as it was claimed.
        UUID withCard = fx.person();
        BookingRequestResponse carded = agree(withCard, sunrise, sunriseRoom);
        tokens.claimPaid(withCard, carded.id(), ManualPaymentMethod.CARD, true, "482913", null);
        BookingRequestResponse cardReceived = tokens.markReceived(sunriseOwner, sunrise, carded.id(), null, null, null);
        assertThat(cardReceived.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(cardReceived.token().receivedMethod()).isEqualTo(ManualPaymentMethod.CARD);
        // The property naming a way itself, with no claim to answer, still has to take it.
        UUID noClaim = fx.person();
        BookingRequestResponse unclaimed = agree(noClaim, sunrise, sunriseRoom);
        assertThatThrownBy(() -> tokens.markReceived(
                sunriseOwner, sunrise, unclaimed.id(), ManualPaymentMethod.CARD, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("does not take");

        // UPI at the desk is told apart from UPI paid from elsewhere.
        UUID other = fx.person();
        BookingRequestResponse second = agree(other, lakeview, lakeviewRoom);
        assertThat(tokens.claimPaid(other, second.id(), ManualPaymentMethod.UPI, true, "UTR 5", null)
                .token().claims().get(0).paidAtDesk()).isTrue();
        UUID third = fx.person();
        BookingRequestResponse elsewhere = agree(third, sunrise, sunriseRoom);
        assertThat(tokens.claimPaid(third, elsewhere.id(), ManualPaymentMethod.UPI, "UTR 6", null)
                .token().claims().get(0).paidAtDesk()).isFalse();
    }

    // ---- The property's side: enough on its own to confirm --------------------

    @Test
    void thePropertyRecordsAReceiptBeforeExplicitlyConfirmingTheBooking() {
        // The person is also waiting on an answer at Lakeview.
        BookingRequestResponse elsewhere = send(tenant, lakeview, lakeviewRoom);
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);

        BookingRequestResponse received = tokens.markReceived(
                sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.CASH, "  Paid at the desk  ", null);
        assertThat(received.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(received.confirmedAt()).isNull();
        assertThat(received.allowedActions()).containsExactlyInAnyOrder(BookingAction.CONFIRM, BookingAction.CANCEL);
        assertThat(received.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .doesNotContain(BookingActionType.CONFIRMED);
        assertThat(bookings.forTenant(tenant, elsewhere.id()).status()).isEqualTo(BookingStatus.AWAITING_HANDLER);
        BookingRequestResponse confirmed = negotiation.confirmForProperty(sunriseOwner, sunrise, agreed.id());
        assertThat(confirmed.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(confirmed.confirmedAt()).isNotNull();
        assertThat(confirmed.token().status()).isEqualTo(BookingTokenStatus.RECEIVED);
        assertThat(confirmed.token().receiptCode()).startsWith("TKN-");
        assertThat(confirmed.token().receivedMethod()).isEqualTo(ManualPaymentMethod.CASH);
        assertThat(confirmed.token().receivedReference()).isEqualTo("Paid at the desk");
        assertThat(confirmed.token().receivedAt()).isBeforeOrEqualTo(confirmed.confirmedAt());
        // Deposit plus the first month, less the token the property now holds.
        assertThat(confirmed.dueAtMoveInPaise()).isEqualTo(1_600_000L);
        assertThat(confirmed.history()).extracting(BookingRequestResponse.HistoryItem::type).containsExactly(
                BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED,
                BookingActionType.TOKEN_RECEIVED, BookingActionType.CONFIRMED);
        assertThat(holdStateOf(agreed.id())).isEqualTo("HELD");
        // Nothing more happens to the token while the booking stands. Either side may still cancel.
        assertThat(confirmed.allowedTokenActions()).isEmpty();
        assertThat(confirmed.allowedActions()).containsExactly(BookingAction.CANCEL);
        BookingRequestResponse tenantsView = bookings.forTenant(tenant, agreed.id());
        assertThat(tenantsView.allowedTokenActions()).isEmpty();
        assertThat(tenantsView.token().receiptCode()).isEqualTo(confirmed.token().receiptCode());
        // It is received once.
        assertThatThrownBy(() -> tokens.markReceived(
                sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.CASH, null, null))
                .isInstanceOf(ValidationException.class);

        // One confirmed booking per person: the request at Lakeview is withdrawn and its bed freed.
        BookingRequestResponse withdrawn = bookings.forProperty(lakeviewOwner, lakeview, elsewhere.id());
        assertThat(withdrawn.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(withdrawn.endCause()).isEqualTo(BookingEndCause.BOOKED_ELSEWHERE);
        assertThat(holdStateOf(elsewhere.id())).isEqualTo("RELEASED");
    }

    @Test
    void aWayOfPayingThePropertyDoesNotTakeIsRefused() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);

        assertThatThrownBy(() -> tokens.markReceived(sunriseOwner, sunrise, agreed.id(), null, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Choose how");
        assertThatThrownBy(() -> tokens.markReceived(
                sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.CHEQUE, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("does not take");
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), null, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Choose how");
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.BANK_TRANSFER, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("does not take");
        // Cash, a card and a cheque change hands at the desk, so they are recorded only as paid there.
        for (ManualPaymentMethod atTheDesk : List.of(
                ManualPaymentMethod.CASH, ManualPaymentMethod.CARD, ManualPaymentMethod.CHEQUE)) {
            assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), atTheDesk, null, null))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("paid at the property's desk");
        }
        // At the desk: never a bank transfer.
        assertThatThrownBy(() -> tokens.claimPaid(
                tenant, agreed.id(), ManualPaymentMethod.BANK_TRANSFER, true, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("At the desk");
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, null,
                List.of("https://img/1", "https://img/2", "https://img/3")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("at most 2");
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, "x".repeat(61), null))
                .isInstanceOf(ValidationException.class);

        BookingRequestResponse read = bookings.forTenant(tenant, agreed.id());
        assertThat(read.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(read.token().status()).isEqualTo(BookingTokenStatus.DUE);
        assertThat(read.token().claims()).isEmpty();
    }

    @Test
    void onlyTheOwnerOrTheHandlerRecordsATokenAndOnlyTheOwnerWaivesIt() {
        UUID anita = fx.manager(sunrise, "Anita");
        UUID bilal = fx.manager(sunrise, "Bilal");
        fx.grantBookings(sunrise, anita);
        fx.grantBookings(sunrise, bilal);
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        fx.assign(agreed.id(), anita);
        BookingRequestResponse anitas = bookings.forProperty(anita, sunrise, agreed.id());

        // The handler may record the token. Giving it away is the owner's alone.
        assertThat(anitas.allowedTokenActions()).containsExactly(BookingTokenAction.MARK_RECEIVED);
        assertThatThrownBy(() -> tokens.waive(anita, sunrise, agreed.id())).isInstanceOf(ForbiddenException.class);
        // Another manager on the list may look and no more.
        assertThat(bookings.forProperty(bilal, sunrise, agreed.id()).allowedTokenActions()).isEmpty();
        assertThatThrownBy(() -> tokens.markReceived(bilal, sunrise, agreed.id(), ManualPaymentMethod.CASH, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Someone else is handling");
        assertThatThrownBy(() -> tokens.markReceived(
                fx.person(), sunrise, agreed.id(), ManualPaymentMethod.CASH, null, null))
                .isInstanceOf(ForbiddenException.class);
        // Another property's owner cannot reach it, and another tenant cannot claim on it.
        assertThatThrownBy(() -> tokens.markReceived(
                lakeviewOwner, lakeview, agreed.id(), ManualPaymentMethod.CASH, null, null))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> tokens.claimPaid(fx.person(), agreed.id(), ManualPaymentMethod.UPI, null, null))
                .isInstanceOf(NotFoundException.class);
        assertThat(bookings.forTenant(tenant, agreed.id()).token().status()).isEqualTo(BookingTokenStatus.DUE);

        BookingRequestResponse waived = tokens.waive(sunriseOwner, sunrise, agreed.id());
        assertThat(waived.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(waived.token().status()).isEqualTo(BookingTokenStatus.NOT_REQUIRED);
        assertThat(waived.token().waivedAt()).isEqualTo(waived.confirmedAt());
        assertThat(waived.token().receiptCode()).isNull();
        // Nothing was paid, so nothing comes off what is due on the day.
        assertThat(waived.tokenPaise()).isZero();
        assertThat(waived.dueAtMoveInPaise()).isEqualTo(1_800_000L);
        // The owner's own answer made the owner its handler. Anita was put on it by the fixture, which writes no step.
        assertThat(waived.history()).extracting(BookingRequestResponse.HistoryItem::type).containsExactly(
                BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED,
                BookingActionType.TOKEN_WAIVED, BookingActionType.CONFIRMED);
        assertThat(waived.allowedTokenActions()).isEmpty();

        // A waived token is a bed held for nothing: walking away from it is the one cancellation that costs.
        negotiation.cancel(tenant, agreed.id());
        assertThat(cooldownOf(agreed.id())).isNotNull();
        assertThat(windowClosedAt(agreed.id())).isNotNull();
    }

    // ---- The tenant's side: "I've paid" --------------------------------------

    @Test
    void nonCashClaimsRequireEvidenceWithoutChangingTheBookingWhenItIsMissing() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        long version = storedVersion(agreed.id());
        for (String blank : new String[]{null, "", " \t\n "}) {
            assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI,
                    blank, List.of(" ", "\t")))
                    .isInstanceOf(ValidationException.class).hasMessageContaining("reference or upload");
            for (ManualPaymentMethod deskMethod : List.of(
                    ManualPaymentMethod.UPI, ManualPaymentMethod.CARD, ManualPaymentMethod.CHEQUE)) {
                assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), deskMethod, true, blank, null))
                        .isInstanceOf(ValidationException.class).hasMessageContaining("reference or upload");
            }
        }
        fx.tokenBankDetails(sunrise, "998877665544", "ICIC0000123", "Sunrise Tokens");
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.BANK_TRANSFER,
                null, java.util.Arrays.asList(null, " ")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("reference or upload");

        BookingRequestResponse unchanged = bookings.forTenant(tenant, agreed.id());
        assertThat(unchanged.token().status()).isEqualTo(BookingTokenStatus.DUE);
        assertThat(unchanged.token().claimWaiting()).isFalse();
        assertThat(unchanged.token().claims()).isEmpty();
        assertThat(unchanged.tokenDueAt()).isEqualTo(agreed.tokenDueAt());
        assertThat(unchanged.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .doesNotContain(BookingActionType.TOKEN_CLAIMED);
        assertThat(storedVersion(agreed.id())).isEqualTo(version);
        assertThat(holdStateOf(agreed.id())).isEqualTo("HELD");
    }

    @Test
    void nonCashClaimsAcceptEitherAReferenceOrAPhoto() {
        fx.tokenBankDetails(lakeview, "998877665544", "ICIC0000123", "Lakeview Tokens");
        for (ManualPaymentMethod method : List.of(ManualPaymentMethod.UPI, ManualPaymentMethod.BANK_TRANSFER,
                ManualPaymentMethod.CARD, ManualPaymentMethod.CHEQUE)) {
            for (boolean photoOnly : new boolean[]{false, true}) {
                UUID person = fx.person();
                boolean bank = method == ManualPaymentMethod.BANK_TRANSFER;
                boolean atDesk = method == ManualPaymentMethod.CARD || method == ManualPaymentMethod.CHEQUE;
                BookingRequestResponse agreed = agree(person, bank ? lakeview : sunrise,
                        bank ? lakeviewRoom : sunriseRoom);
                BookingRequestResponse claimed = tokens.claimPaid(person, agreed.id(), method, atDesk,
                        photoOnly ? null : " REF 1 ", photoOnly ? List.of(" https://img/proof ") : List.of());
                BookingRequestResponse.TokenClaim proof = claimed.token().claims().get(0);
                assertThat(claimed.token().status()).isEqualTo(BookingTokenStatus.CLAIMED);
                assertThat(proof.method()).isEqualTo(method);
                assertThat(proof.paidAtDesk()).isEqualTo(atDesk);
                assertThat(proof.reference()).isEqualTo(photoOnly ? null : "REF 1");
                assertThat(proof.proofImageUrls()).isEqualTo(photoOnly ? List.of("https://img/proof") : List.of());
            }
        }
    }

    @Test
    void cashAtDeskCanStillBeClaimedWithoutAReceipt() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        BookingRequestResponse claimed = tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.CASH,
                true, null, List.of());
        BookingRequestResponse.TokenClaim proof = claimed.token().claims().get(0);
        assertThat(claimed.token().status()).isEqualTo(BookingTokenStatus.CLAIMED);
        assertThat(proof.paidAtDesk()).isTrue();
        assertThat(proof.reference()).isNull();
        assertThat(proof.proofImageUrls()).isEmpty();
    }

    @Test
    void aClaimStopsTheClockUntilThePropertyAnswers() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);

        BookingRequestResponse claimed = tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI,
                " UTR 4821 ", List.of("https://img/1", " ", "https://img/2"));
        assertThat(claimed.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(claimed.token().status()).isEqualTo(BookingTokenStatus.CLAIMED);
        assertThat(claimed.token().claimWaiting()).isTrue();
        assertThat(claimed.token().claims()).hasSize(1);
        BookingRequestResponse.TokenClaim claim = claimed.token().claims().get(0);
        assertThat(claim.sequence()).isEqualTo(1);
        assertThat(claim.method()).isEqualTo(ManualPaymentMethod.UPI);
        assertThat(claim.reference()).isEqualTo("UTR 4821");
        assertThat(claim.proofImageUrls()).containsExactly("https://img/1", "https://img/2");
        assertThat(claim.answer()).isNull();
        // The tenant has said their piece. The property answers it one way or the other.
        assertThat(claimed.allowedTokenActions()).isEmpty();
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, null, null))
                .isInstanceOf(ValidationException.class);
        assertThat(bookings.forProperty(sunriseOwner, sunrise, agreed.id()).allowedTokenActions())
                .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.MARK_NOT_RECEIVED);
        assertThatThrownBy(() -> tokens.waive(sunriseOwner, sunrise, agreed.id()))
                .isInstanceOf(ValidationException.class);

        // Days past the deadline the bed is still theirs: a slow answer never costs the tenant the bed.
        clock.set(agreed.tokenDueAt().plus(3, ChronoUnit.DAYS));
        assertThat(sweep.expireDue()).isZero();
        assertThat(bookings.forTenant(tenant, agreed.id()).status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(bookings.pageForProperty(sunriseOwner, sunrise, BookingListFilter.OPEN, 0, 20).items()).hasSize(1);
        assertThat(holdStateOf(agreed.id())).isEqualTo("HELD");

        // "Received" answers the claim, and takes how it was paid from it.
        BookingRequestResponse confirmed = tokens.markReceived(sunriseOwner, sunrise, agreed.id(), null, null, null);
        assertThat(confirmed.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(confirmed.token().status()).isEqualTo(BookingTokenStatus.RECEIVED);
        assertThat(confirmed.token().claimWaiting()).isFalse();
        assertThat(confirmed.token().receivedMethod()).isEqualTo(ManualPaymentMethod.UPI);
        assertThat(confirmed.token().receivedReference()).isEqualTo("UTR 4821");
        assertThat(confirmed.token().claims().get(0).answer()).isEqualTo(BookingClaimAnswer.RECEIVED);
        assertThat(confirmed.history()).extracting(BookingRequestResponse.HistoryItem::type).containsExactly(
                BookingActionType.SUBMITTED, BookingActionType.ASSIGNED, BookingActionType.AGREED,
                BookingActionType.TOKEN_CLAIMED, BookingActionType.TOKEN_RECEIVED);
    }

    @Test
    void aRefusedClaimGivesTheTimeBackAndTheTokenCanStillLapse() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        Instant agreedAt = agreed.agreedAt();
        // Claimed with eight of the forty-eight hours left, refused twenty hours later.
        clock.set(agreedAt.plus(40, ChronoUnit.HOURS));
        tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, "UTR 1", null);
        clock.set(agreedAt.plus(60, ChronoUnit.HOURS));
        for (String blank : new String[]{null, "", "   "}) {
            assertThatThrownBy(() -> tokens.markNotReceived(sunriseOwner, sunrise, agreed.id(), blank))
                    .isInstanceOf(ValidationException.class);
        }

        BookingRequestResponse refused = tokens.markNotReceived(
                sunriseOwner, sunrise, agreed.id(), "  Nothing has reached the account.  ");
        assertThat(refused.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(refused.token().status()).isEqualTo(BookingTokenStatus.NOT_RECEIVED);
        assertThat(refused.token().claimWaiting()).isFalse();
        // Eight hours were left, and a refused claim never leaves less than twelve.
        Instant newDeadline = agreedAt.plus(72, ChronoUnit.HOURS);
        assertThat(refused.tokenDueAt()).isEqualTo(newDeadline);
        assertThat(refused.token().dueAt()).isEqualTo(newDeadline);
        BookingRequestResponse tenantsView = bookings.forTenant(tenant, agreed.id());
        assertThat(tenantsView.token().claims().get(0).answer()).isEqualTo(BookingClaimAnswer.NOT_RECEIVED);
        assertThat(tenantsView.token().claims().get(0).answerReason()).isEqualTo("Nothing has reached the account.");
        // It is still owed: the tenant may say again that they paid, the property may record it or waive it.
        assertThat(tenantsView.allowedTokenActions()).containsExactly(BookingTokenAction.CLAIM_PAID);
        assertThat(refused.allowedTokenActions())
                .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.WAIVE);
        assertThat(refused.history()).extracting(BookingRequestResponse.HistoryItem::type).endsWith(
                BookingActionType.TOKEN_CLAIMED, BookingActionType.TOKEN_NOT_RECEIVED);

        clock.set(newDeadline.minusNanos(1_000));
        assertThat(sweep.expireDue()).isZero();
        assertThat(bookings.forTenant(tenant, agreed.id()).status()).isEqualTo(BookingStatus.AWAITING_TOKEN);

        // At the new deadline it has lapsed, whether or not the sweep has written it yet.
        clock.set(newDeadline);
        assertThat(bookings.forTenant(tenant, agreed.id()).status()).isEqualTo(BookingStatus.EXPIRED);
        assertThat(bookings.forTenant(tenant, agreed.id()).allowedTokenActions()).isEmpty();
        assertThatThrownBy(() -> tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, "UTR 2", null))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> tokens.markReceived(
                sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.CASH, null, null))
                .isInstanceOf(ValidationException.class);
        assertThat(sweep.expireDue()).isEqualTo(1);
        BookingRequestResponse lapsed = bookings.forProperty(sunriseOwner, sunrise, agreed.id());
        assertThat(lapsed.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .endsWith(BookingActionType.TOKEN_LAPSED);
        assertThat(lapsed.token().status()).isEqualTo(BookingTokenStatus.NOT_RECEIVED);
        assertThat(lapsed.token().claims()).hasSize(1);
        assertThat(lapsed.allowedTokenActions()).isEmpty();
        assertThat(holdStateOf(agreed.id())).isEqualTo("RELEASED");
    }

    @Test
    void aTokenRecordedJustInTimeConfirmsAndOneAtTheDeadlineIsTooLate() {
        BookingRequestResponse inTime = agree(tenant, sunrise, sunriseRoom);
        clock.set(inTime.tokenDueAt().minusNanos(1_000));
        assertThat(tokens.markReceived(sunriseOwner, sunrise, inTime.id(), ManualPaymentMethod.UPI, null, null).status())
                .isEqualTo(BookingStatus.TOKEN_RECEIVED);
        // A confirmed booking has no clock left to run out.
        clock.set(inTime.tokenDueAt().plus(30, ChronoUnit.DAYS));
        assertThat(sweep.expireDue()).isZero();
        assertThat(bookings.forTenant(tenant, inTime.id()).status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);

        clock.set(null);
        UUID late = fx.person();
        BookingRequestResponse tooLate = agree(late, sunrise, sunriseRoom);
        clock.set(tooLate.tokenDueAt());
        // The clock decides, not whether the sweep has come round.
        assertThatThrownBy(() -> tokens.markReceived(
                sunriseOwner, sunrise, tooLate.id(), ManualPaymentMethod.UPI, null, null))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> tokens.waive(sunriseOwner, sunrise, tooLate.id()))
                .isInstanceOf(ValidationException.class);
        assertThat(sweep.expireDue()).isEqualTo(1);
        assertThat(holdStateOf(tooLate.id())).isEqualTo("RELEASED");
        assertThat(bookings.forTenant(late, tooLate.id()).token().status()).isEqualTo(BookingTokenStatus.DUE);
    }

    // ---- A claim outlives the booking ----------------------------------------

    @Test
    void aClaimStillWaitingWhenTheTenantCancelsIsAnsweredAndSettlesByTheOwnersRule() {
        // Sunrise keeps a token when the tenant walks away. Lakeview gives it back.
        BookingRequestResponse kept = agree(tenant, sunrise, sunriseRoom);
        tokens.claimPaid(tenant, kept.id(), ManualPaymentMethod.UPI, "UTR 7", null);
        BookingRequestResponse cancelled = negotiation.cancel(tenant, kept.id());
        assertThat(cancelled.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(holdStateOf(kept.id())).isEqualTo("RELEASED");
        // The booking is over and the claim is still an open question: the money may have moved.
        assertThat(cancelled.token().status()).isEqualTo(BookingTokenStatus.CLAIMED);
        assertThat(cancelled.allowedTokenActions()).isEmpty();
        assertThat(bookings.forProperty(sunriseOwner, sunrise, kept.id()).allowedTokenActions())
                .containsExactlyInAnyOrder(BookingTokenAction.MARK_RECEIVED, BookingTokenAction.MARK_NOT_RECEIVED);

        BookingRequestResponse settled = tokens.markReceived(sunriseOwner, sunrise, kept.id(), null, null, null);
        // Receiving it now confirms nothing. It settles at once.
        assertThat(settled.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(settled.token().status()).isEqualTo(BookingTokenStatus.KEPT);
        assertThat(settled.token().receiptCode()).startsWith("TKN-");
        assertThat(settled.token().refundDueSince()).isNull();
        assertThat(settled.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .endsWith(BookingActionType.CANCELLED, BookingActionType.TOKEN_RECEIVED);
        assertThat(settled.allowedTokenActions()).isEmpty();
        assertThat(holdStateOf(kept.id())).isEqualTo("RELEASED");
        // Kept from the moment it was received, so it is income from then.
        assertThat(incomeAt(sunrise)).containsExactly("Booking token kept=200000");

        UUID other = fx.person();
        BookingRequestResponse givenBack = agree(other, lakeview, lakeviewRoom);
        tokens.claimPaid(other, givenBack.id(), ManualPaymentMethod.UPI, "UTR 7", null);
        negotiation.cancel(other, givenBack.id());
        BookingRequestResponse owed = tokens.markReceived(lakeviewOwner, lakeview, givenBack.id(), null, null, null);
        assertThat(owed.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(owed.token().refundDueSince()).isEqualTo(owed.token().receivedAt());
        // Refundable, and that is the end of it: the app does not follow refunds (user, 2026-10-28).
        assertThat(owed.allowedTokenActions()).isEmpty();
    }

    @Test
    void aClaimStillWaitingWhenThePropertyCancelsIsAlwaysOwedBackOnceReceived() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, "UTR 8", null);
        negotiation.cancelForProperty(sunriseOwner, sunrise, agreed.id(), "The room has a leak.");

        // Sunrise keeps tokens, but not when it was the one that pulled out.
        BookingRequestResponse owed = tokens.markReceived(sunriseOwner, sunrise, agreed.id(), null, null, null);
        assertThat(owed.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(owed.token().refundDueSince()).isNotNull();

        // And a claim refused after the booking ended is simply closed.
        UUID other = fx.person();
        BookingRequestResponse second = agree(other, sunrise, sunriseRoom);
        tokens.claimPaid(other, second.id(), ManualPaymentMethod.UPI, "UTR 9", null);
        negotiation.cancel(other, second.id());
        BookingRequestResponse refused = tokens.markNotReceived(
                sunriseOwner, sunrise, second.id(), "No such payment in the account.");
        assertThat(refused.token().status()).isEqualTo(BookingTokenStatus.NOT_RECEIVED);
        assertThat(refused.token().claimWaiting()).isFalse();
        assertThat(refused.allowedTokenActions()).isEmpty();
        assertThat(bookings.forTenant(other, second.id()).allowedTokenActions()).isEmpty();
    }

    // ---- A token the property holds, when the booking ends ---------------------

    @Test
    void cancellingAConfirmedBookingSettlesTheTokenByWhoWalkedAway() {
        // The tenant walks away from Sunrise, which keeps tokens.
        BookingRequestResponse kept = confirm(tenant, sunrise, sunriseOwner, sunriseRoom);
        BookingRequestResponse keptAfter = negotiation.cancel(tenant, kept.id());
        assertThat(keptAfter.token().status()).isEqualTo(BookingTokenStatus.KEPT);
        assertThat(keptAfter.allowedTokenActions()).isEmpty();
        assertThat(holdStateOf(kept.id())).isEqualTo("RELEASED");
        // Where a token was taken, the token is the consequence. No cooldown, and the visit stays open.
        assertThat(cooldownOf(kept.id())).isNull();
        assertThat(windowClosedAt(kept.id())).isNull();

        // The tenant walks away from Lakeview, which gives them back.
        UUID second = fx.person();
        BookingRequestResponse givenBack = confirm(second, lakeview, lakeviewOwner, lakeviewRoom);
        BookingRequestResponse givenBackAfter = negotiation.cancel(second, givenBack.id());
        assertThat(givenBackAfter.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(givenBackAfter.token().refundDueSince()).isEqualTo(givenBackAfter.closedAt());
        assertThat(cooldownOf(givenBack.id())).isNull();

        // Sunrise pulls out itself: owed back whatever its rule says.
        UUID third = fx.person();
        BookingRequestResponse pulled = confirm(third, sunrise, sunriseOwner, sunriseRoom);
        BookingRequestResponse pulledAfter = negotiation.cancelForProperty(
                sunriseOwner, sunrise, pulled.id(), "The property is closing for repairs.");
        assertThat(pulledAfter.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(pulledAfter.allowedTokenActions()).isEmpty();
        assertThat(bookings.forTenant(third, pulled.id()).allowedTokenActions()).isEmpty();

        // The owner's ledger: every token Sunrise received, newest first, and what became of each.
        BookingTokenLedgerResponse ledger = tokens.ledgerForProperty(sunriseOwner, sunrise, 0, 20);
        assertThat(ledger.summary().count()).isEqualTo(2);
        assertThat(ledger.summary().collectedPaise()).isEqualTo(400_000L);
        assertThat(ledger.summary().keptPaise()).isEqualTo(200_000L);
        assertThat(ledger.summary().refundDuePaise()).isEqualTo(200_000L);
        assertThat(ledger.summary().heldPaise()).isZero();
        assertThat(ledger.summary().adjustedPaise()).isZero();
        assertThat(ledger.tokens().items()).extracting(BookingTokenLedgerResponse.Item::bookingReferenceCode)
                .containsExactly(pulled.referenceCode(), kept.referenceCode());
        assertThat(ledger.tokens().items()).extracting(BookingTokenLedgerResponse.Item::status)
                .containsExactly(BookingTokenStatus.REFUND_DUE, BookingTokenStatus.KEPT);
        BookingTokenLedgerResponse.Item keptRow = ledger.tokens().items().get(1);
        assertThat(keptRow.receiptCode()).startsWith("TKN-");
        assertThat(keptRow.amountPaise()).isEqualTo(200_000L);
        assertThat(keptRow.endCause()).isEqualTo(BookingEndCause.TENANT_CANCELLED);
        assertThat(keptRow.receivedMethod()).isEqualTo(ManualPaymentMethod.UPI);
        // Lakeview has its own, and nobody outside a property reads its ledger.
        assertThat(tokens.ledgerForProperty(lakeviewOwner, lakeview, 0, 20).summary().refundDuePaise())
                .isEqualTo(200_000L);
        assertThatThrownBy(() -> tokens.ledgerForProperty(fx.person(), sunrise, 0, 20))
                .isInstanceOf(ForbiddenException.class);

        // Money the owner keeps is income. Money owed back is not.
        assertThat(incomeAt(sunrise)).containsExactly("Booking token kept=200000");
        assertThat(incomeAt(lakeview)).isEmpty();

        // The Tokens screen (user, 2026-10-11). A row says whether the reader may refund or keep it, which
        // only a no-show's token waits on (2026-10-28), and carries the booking's version for that step.
        BookingTokenLedgerResponse.Item owedRow = ledger.tokens().items().get(0);
        assertThat(owedRow.canDecide()).isFalse();
        assertThat(keptRow.canDecide()).isFalse();
        assertThat(owedRow.version()).isEqualTo(bookings.forProperty(sunriseOwner, sunrise, pulled.id()).version());
        // A manager who may read the bookings and handles neither of these may look, and no more.
        UUID anita = fx.manager(sunrise, "Anita");
        fx.grantBookings(sunrise, anita);
        assertThat(tokens.ledgerForProperty(anita, sunrise, 0, 20).tokens().items())
                .extracting(BookingTokenLedgerResponse.Item::canDecide).containsExactly(false, false);

        // Narrowed on the server: by what the token is now.
        assertThat(codes(tokens.ledgerForProperty(sunriseOwner, sunrise, BookingTokenStatus.REFUND_DUE, null, 0, 20)))
                .containsExactly(pulled.referenceCode());
        assertThat(codes(tokens.ledgerForProperty(sunriseOwner, sunrise, BookingTokenStatus.KEPT, "  ", 0, 20)))
                .containsExactly(kept.referenceCode());
        assertThat(tokens.ledgerForProperty(sunriseOwner, sunrise, BookingTokenStatus.DECISION_PENDING, null, 0, 20)
                .tokens().totalElements()).isZero();
        // A token still owed never arrived, so it is in no list here, even when asked for by name.
        assertThat(codes(tokens.ledgerForProperty(sunriseOwner, sunrise, BookingTokenStatus.DUE, null, 0, 20))).isEmpty();
        // And by the token's own code or its booking's, in any case, with the page count of what was asked for.
        BookingTokenLedgerResponse byToken = tokens.ledgerForProperty(
                sunriseOwner, sunrise, null, keptRow.receiptCode().toLowerCase(), 0, 20);
        assertThat(codes(byToken)).containsExactly(kept.referenceCode());
        assertThat(byToken.tokens().totalElements()).isEqualTo(1);
        assertThat(codes(tokens.ledgerForProperty(sunriseOwner, sunrise, null, pulled.referenceCode(), 0, 20)))
                .containsExactly(pulled.referenceCode());
        assertThat(codes(tokens.ledgerForProperty(sunriseOwner, sunrise, BookingTokenStatus.KEPT,
                pulled.referenceCode(), 0, 20))).isEmpty();
        assertThat(codes(tokens.ledgerForProperty(sunriseOwner, sunrise, null, "TKN-0000-NOPE", 0, 20))).isEmpty();
        // A wildcard typed into the search is not one: it matches nothing by itself, and so narrows nothing.
        assertThat(codes(tokens.ledgerForProperty(sunriseOwner, sunrise, null, "%_", 0, 20))).hasSize(2);
        // The totals stay those of every token, whatever the page was narrowed to.
        assertThat(byToken.summary().count()).isEqualTo(2);
        assertThat(byToken.summary().collectedPaise()).isEqualTo(400_000L);
    }

    private static List<String> codes(BookingTokenLedgerResponse ledger) {
        return ledger.tokens().items().stream().map(BookingTokenLedgerResponse.Item::bookingReferenceCode).toList();
    }

    /**
     * A refund owed is recorded, never followed (user, 2026-10-28): nothing more can be done to it, and an old
     * one no longer stops the property agreeing new bookings.
     */
    @Test
    void aRefundOwedIsRecordedNotFollowedAndNeverStopsNewBookings() {
        BookingRequestResponse confirmed = confirm(tenant, lakeview, lakeviewOwner, lakeviewRoom);
        BookingRequestResponse owed = negotiation.cancel(tenant, confirmed.id());
        assertThat(owed.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(owed.allowedTokenActions()).isEmpty();
        assertThat(bookings.forProperty(lakeviewOwner, lakeview, confirmed.id()).allowedTokenActions()).isEmpty();
        assertThatThrownBy(() -> tokens.decideToken(lakeviewOwner, lakeview, confirmed.id(), false))
                .isInstanceOf(ValidationException.class);

        // Owed for a month, long past the seven days that used to stop new bookings.
        jdbc.update("UPDATE booking.tokens SET refund_due_since = ? WHERE request_id = ?",
                Timestamp.from(owed.token().refundDueSince().minus(30, ChronoUnit.DAYS)), confirmed.id());
        UUID next = fx.person();
        assertThat(agree(next, lakeview, lakeviewRoom).status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
    }

    // ---- A screen that has fallen behind --------------------------------------

    /** What an action answers with is what the next action is checked against, so the screen need not read again. */
    @Test
    void everyAnswerCarriesTheVersionTheBookingNowHas() {
        // Asked below the listed rent, so there is a counter to follow it with.
        BookingRequestResponse sent = bookings.create(tenant, BookingFixtures.askAt(
                fx.attendedEnquiry(sunrise, tenant, today.minusDays(1)), sunriseRoom, today.plusDays(10), 700_000L));
        assertThat(sent.version()).isEqualTo(storedVersion(sent.id()));
        BookingRequestResponse countered = negotiation.offer(sunriseOwner, sunrise, sent.id(), 1, 780_000L, true);
        assertThat(countered.version()).isEqualTo(storedVersion(sent.id()));
        BookingRequestResponse agreed = negotiation.accept(tenant, sent.id(), 2);
        assertThat(agreed.version()).isEqualTo(storedVersion(sent.id()));
        BookingRequestResponse claimed = tokens.claimPaid(tenant, sent.id(), ManualPaymentMethod.UPI, "UTR 10", null);
        assertThat(claimed.version()).isEqualTo(storedVersion(sent.id()));
        BookingRequestResponse refused = tokens.markNotReceived(sunriseOwner, sunrise, sent.id(), "Not in the account.");
        assertThat(refused.version()).isEqualTo(storedVersion(sent.id()));
        BookingRequestResponse confirmed = tokens.markReceived(
                sunriseOwner, sunrise, sent.id(), ManualPaymentMethod.CASH, null, null);
        assertThat(confirmed.version()).isEqualTo(storedVersion(sent.id()));
        // Once the token is received only the property may cancel (user, 2026-10-27).
        BookingRequestResponse cancelled = negotiation.cancelForProperty(
                sunriseOwner, sunrise, sent.id(), "The room has a leak.");
        assertThat(cancelled.version()).isEqualTo(storedVersion(sent.id()));
        // Sunrise keeps a token when the tenant walks away, but the property cancelling must refund it.
        assertThat(cancelled.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        // Each of those changed the booking, so each moved its version on.
        assertThat(List.of(sent.version(), countered.version(), agreed.version(), claimed.version(),
                refused.version(), confirmed.version(), cancelled.version())).isSorted().doesNotHaveDuplicates();
    }

    @Test
    void anActionBuiltOnAnOlderVersionOfTheBookingIsRefusedAndChangesNothing() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        long loaded = agreed.version();
        // The owner's screen is open on it when the tenant says they have paid.
        tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, "UTR 8", null);
        try {
            ExpectedVersionHolder.set(ExpectedVersion.of(loaded));
            assertThatThrownBy(() -> tokens.markReceived(
                    sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.CASH, null, null))
                    .isInstanceOf(StaleVersionException.class);
            ExpectedVersionHolder.set(ExpectedVersion.of(loaded));
            assertThatThrownBy(() -> tokens.markNotReceived(sunriseOwner, sunrise, agreed.id(), "Not received."))
                    .isInstanceOf(StaleVersionException.class);
            ExpectedVersionHolder.set(ExpectedVersion.of(loaded));
            assertThatThrownBy(() -> negotiation.cancelForProperty(sunriseOwner, sunrise, agreed.id(), "Changed plans."))
                    .isInstanceOf(StaleVersionException.class);

            BookingRequestResponse current = bookings.forProperty(sunriseOwner, sunrise, agreed.id());
            assertThat(current.status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
            assertThat(current.token().status()).isEqualTo(BookingTokenStatus.CLAIMED);
            assertThat(current.token().claims().get(0).answer()).isNull();
            assertThat(holdStateOf(agreed.id())).isEqualTo("HELD");

            // On the version the screen shows after refreshing, the same answer goes through.
            ExpectedVersionHolder.set(ExpectedVersion.of(current.version()));
            assertThat(tokens.markReceived(sunriseOwner, sunrise, agreed.id(), null, null, null).status())
                    .isEqualTo(BookingStatus.TOKEN_RECEIVED);
        } finally {
            ExpectedVersionHolder.clear();
        }
    }

    // ---- At the same moment --------------------------------------------------

    @Test
    void twoPeopleRecordingOneTokenAtTheSameMomentWriteOneReceipt() throws Exception {
        UUID anita = fx.manager(sunrise, "Anita");
        fx.grantBookings(sunrise, anita);
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        fx.assign(agreed.id(), anita);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        try {
            var owners = threads.submit(together(() -> tokens.markReceived(
                    sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.CASH, null, null), ready, go));
            var handlers = threads.submit(together(() -> tokens.markReceived(
                    anita, sunrise, agreed.id(), ManualPaymentMethod.UPI, null, null), ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(List.of(owners.get(30, TimeUnit.SECONDS), handlers.get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        } finally {
            go.countDown();
            threads.shutdownNow();
        }
        BookingRequestResponse read = bookings.forTenant(tenant, agreed.id());
        assertThat(read.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(read.token().status()).isEqualTo(BookingTokenStatus.RECEIVED);
        assertThat(read.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsOnlyOnce(BookingActionType.TOKEN_RECEIVED).doesNotContain(BookingActionType.CONFIRMED);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM booking.tokens WHERE request_id = ?",
                Integer.class, agreed.id())).isEqualTo(1);
    }

    @Test
    void theTenantClaimingAsThePropertyRecordsItEndsTokenReceivedWithOneReceipt() throws Exception {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        boolean claimed;
        try {
            var claims = threads.submit(together(() -> tokens.claimPaid(
                    tenant, agreed.id(), ManualPaymentMethod.UPI, "UTR 3", null), ready, go));
            var receives = threads.submit(together(() -> tokens.markReceived(
                    sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.UPI, null, null), ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            claimed = claims.get(30, TimeUnit.SECONDS);
            // The property may record it before a claim or in answer to one, so its record lands either way.
            assertThat(receives.get(30, TimeUnit.SECONDS)).isTrue();
        } finally {
            go.countDown();
            threads.shutdownNow();
        }
        BookingRequestResponse read = bookings.forTenant(tenant, agreed.id());
        assertThat(read.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(read.token().status()).isEqualTo(BookingTokenStatus.RECEIVED);
        assertThat(read.token().claimWaiting()).isFalse();
        assertThat(read.token().claims()).hasSize(claimed ? 1 : 0);
        if (claimed) {
            assertThat(read.token().claims().get(0).answer()).isEqualTo(BookingClaimAnswer.RECEIVED);
        }
    }

    @Test
    void aReceivedTokenKeepsItsBedWithoutAClockAndOnlyFinalConfirmationWritesConfirmed() {
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        assertThatThrownBy(() -> negotiation.confirmForProperty(sunriseOwner, sunrise, agreed.id()))
                .isInstanceOf(ValidationException.class);
        BookingRequestResponse received = tokens.markReceived(sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.UPI, "UTR 11", null);
        assertThat(received.confirmedAt()).isNull();
        clock.set(agreed.tokenDueAt().plusSeconds(86400));
        assertThat(sweep.expireDue()).isZero();
        assertThat(bookings.forTenant(tenant, received.id()).status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        // The tenant may no longer cancel it (user, 2026-10-27).
        assertThat(bookings.forTenant(tenant, received.id()).allowedActions()).isEmpty();
        assertThatThrownBy(() -> negotiation.cancel(tenant, received.id())).isInstanceOf(ValidationException.class);
        assertThat(bookings.countsForProperty(sunriseOwner, sunrise).tokenReceived()).isEqualTo(1);
        assertThat(bookings.pageForProperty(sunriseOwner, sunrise, BookingListFilter.OPEN, 0, 20).items()).hasSize(1);
        assertThat(holdStateOf(received.id())).isEqualTo("HELD");
        BookingRequestResponse confirmed = negotiation.confirmForProperty(sunriseOwner, sunrise, received.id());
        assertThat(confirmed.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(confirmed.token().receiptCode()).isEqualTo(received.token().receiptCode());
        assertThat(confirmed.agreedRentPaise()).isEqualTo(received.agreedRentPaise());
        assertThat(confirmed.confirmedAt()).isAfter(received.token().receivedAt());
        assertThat(confirmed.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsOnlyOnce(BookingActionType.TOKEN_RECEIVED, BookingActionType.CONFIRMED);
        assertThatThrownBy(() -> negotiation.confirmForProperty(sunriseOwner, sunrise, received.id()))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void finalConfirmationIsOnlyForTheOwnerOrAssignedHandlerAndCarriesTheLoadedVersion() {
        UUID handler = fx.manager(sunrise, "Handler");
        UUID onlooker = fx.manager(sunrise, "Onlooker");
        fx.grantBookings(sunrise, handler); fx.grantBookings(sunrise, onlooker);
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom);
        fx.assign(agreed.id(), handler);
        BookingRequestResponse received = tokens.markReceived(handler, sunrise, agreed.id(), ManualPaymentMethod.UPI, null, null);
        assertThatThrownBy(() -> negotiation.confirmForProperty(onlooker, sunrise, received.id())).isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> negotiation.confirmForProperty(tenant, sunrise, received.id())).isInstanceOf(ForbiddenException.class);
        try {
            ExpectedVersionHolder.set(ExpectedVersion.of(received.version() - 1));
            assertThatThrownBy(() -> negotiation.confirmForProperty(handler, sunrise, received.id())).isInstanceOf(StaleVersionException.class);
        } finally { ExpectedVersionHolder.clear(); }
        assertThat(bookings.forTenant(tenant, received.id()).status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(negotiation.confirmForProperty(handler, sunrise, received.id()).status()).isEqualTo(BookingStatus.CONFIRMED);
    }

    @Test
    void finalConfirmationWithdrawsAnotherReceivedTokenAndSettlesItByItsRefundRule() {
        BookingRequestResponse first = agree(tenant, sunrise, sunriseRoom);
        BookingRequestResponse second = agree(tenant, lakeview, lakeviewRoom);
        tokens.markReceived(sunriseOwner, sunrise, first.id(), ManualPaymentMethod.UPI, null, null);
        tokens.markReceived(lakeviewOwner, lakeview, second.id(), ManualPaymentMethod.UPI, null, null);
        assertThat(bookings.forTenant(tenant, second.id()).status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        negotiation.confirmForProperty(sunriseOwner, sunrise, first.id());
        BookingRequestResponse withdrawn = bookings.forTenant(tenant, second.id());
        assertThat(withdrawn.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(withdrawn.token().status()).isEqualTo(BookingTokenStatus.REFUND_DUE);
        assertThat(holdStateOf(second.id())).isEqualTo("RELEASED");
    }

    @Test
    void twoFinalConfirmationsWriteOnlyOneConfirmedEvent() throws Exception {
        UUID handler = fx.manager(sunrise, "Handler"); fx.grantBookings(sunrise, handler);
        BookingRequestResponse agreed = agree(tenant, sunrise, sunriseRoom); fx.assign(agreed.id(), handler);
        tokens.markReceived(sunriseOwner, sunrise, agreed.id(), ManualPaymentMethod.UPI, null, null);
        CountDownLatch ready = new CountDownLatch(2); CountDownLatch go = new CountDownLatch(1);
        var threads = Executors.newFixedThreadPool(2);
        try {
            var owner = threads.submit(together(() -> negotiation.confirmForProperty(sunriseOwner, sunrise, agreed.id()), ready, go));
            var manager = threads.submit(together(() -> negotiation.confirmForProperty(handler, sunrise, agreed.id()), ready, go));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); go.countDown();
            assertThat(List.of(owner.get(30, TimeUnit.SECONDS), manager.get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        } finally { go.countDown(); threads.shutdownNow(); }
        var confirmed = bookings.forTenant(tenant, agreed.id());
        assertThat(confirmed.history()).extracting(BookingRequestResponse.HistoryItem::type)
                .containsOnlyOnce(BookingActionType.CONFIRMED, BookingActionType.TOKEN_RECEIVED);
        assertThat(holdStateOf(agreed.id())).isEqualTo("HELD");
    }

    // ---- Helpers -------------------------------------------------------------

    /** A request for day +10 on a visit made yesterday, at the listed rent. */
    private BookingRequestResponse send(UUID person, UUID atProperty, UUID inRoom) {
        return bookings.create(person, BookingFixtures.ask(
                fx.attendedEnquiry(atProperty, person, today.minusDays(1)), inRoom, today.plusDays(10)));
    }

    /** Terms agreed by the owner at the listed rent, so the token is owed. */
    private BookingRequestResponse agree(UUID person, UUID atProperty, UUID inRoom) {
        BookingRequestResponse sent = send(person, atProperty, inRoom);
        return negotiation.acceptForProperty(fx.ownerOf(atProperty), atProperty, sent.id(), 1);
    }

    /** A receipt is followed by the owner's separate final confirmation. */
    private BookingRequestResponse confirm(UUID person, UUID atProperty, UUID itsOwner, UUID inRoom) {
        BookingRequestResponse agreed = agree(person, atProperty, inRoom);
        tokens.markReceived(itsOwner, atProperty, agreed.id(), ManualPaymentMethod.UPI, null, null);
        return negotiation.confirmForProperty(itsOwner, atProperty, agreed.id());
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

    /** The property's income ledger, as "source=paise", oldest first. */
    private List<String> incomeAt(UUID property) {
        return jdbc.query(
                "SELECT source, amount_paise FROM expense.income_entries WHERE property_id = ? ORDER BY created_at",
                (row, index) -> row.getString("source") + "=" + row.getLong("amount_paise"), property);
    }

    private long storedVersion(UUID request) {
        return jdbc.queryForObject("SELECT version FROM booking.requests WHERE id = ?", Long.class, request);
    }

    private String holdStateOf(UUID request) {
        return jdbc.queryForObject(
                "SELECT state FROM tenancy.bed_holds WHERE owner_kind = 'BOOKING' AND owner_id = ?",
                String.class, request);
    }

    private Instant cooldownOf(UUID request) {
        Timestamp until = jdbc.queryForObject("SELECT cooldown_until FROM booking.requests WHERE id = ?",
                Timestamp.class, request);
        return until == null ? null : until.toInstant();
    }

    private Timestamp windowClosedAt(UUID request) {
        return jdbc.queryForObject("""
                SELECT e.booking_window_closed_at FROM enquiry.enquiries e
                JOIN booking.requests r ON r.enquiry_id = e.id
                WHERE r.id = ?
                """, Timestamp.class, request);
    }
}
