package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.service.OtpDeliveryService;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.api.dto.BookingCashCodeResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.support.IntegrationTest;

/**
 * A booking token handed over in cash, at a property that asks the payer for a
 * code. The code is real: issued, stored and checked by the OTP service. Only
 * its delivery is replaced, so the test can read what the tenant's phone
 * would have received.
 */
@IntegrationTest
class BookingTokenCashCodeIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingTokenService tokens;
    @Autowired private BookingSettingsService settings;
    @MockitoBean private OtpDeliveryService delivery;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID tenant;
    private LocalDate today;

    @BeforeEach
    void seed() {
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerOf(property);
        room = fx.room(property, 4, 0);
        // Takes cash and UPI, and asks for the payer's code on cash.
        fx.paymentDetails(property, true, true);
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
        tenant = fx.person();
    }

    @AfterEach
    void remove() {
        fx.remove();
    }

    @Test
    void cashIsRecordedOnlyWithTheCodeTheTenantWasSent() {
        BookingRequestResponse agreed = agree(tenant, property, room);

        // No code, and a code nobody was sent.
        assertThatThrownBy(() -> tokens.markReceived(owner, property, agreed.id(), ManualPaymentMethod.CASH, null, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Ask the tenant for the code");
        assertThatThrownBy(() -> tokens.markReceived(
                owner, property, agreed.id(), ManualPaymentMethod.CASH, null, "123456"))
                .isInstanceOf(ValidationException.class).hasMessageContaining("No active code");
        verifyNoInteractions(delivery);

        BookingCashCodeResponse sent = tokens.sendCashCode(owner, property, agreed.id(), "10.0.0.7");
        String phone = fx.phoneOf(tenant);
        assertThat(sent.amountPaise()).isEqualTo(200_000L);
        assertThat(sent.sentTo()).isEqualTo(phone.substring(phone.length() - 4));
        assertThat(sent.expiresAt()).isAfter(Instant.now());
        // It went to the account's own number, for this purpose alone, saying what it confirms.
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(delivery).deliverOtp(eq(phone), isNull(), code.capture(), eq(OtpPurpose.BOOKING_TOKEN_CASH), any(),
                detail.capture());
        assertThat(detail.getValue()).contains(agreed.referenceCode()).contains("booking token").contains("2,000");
        // Sending a code changes nothing about the booking.
        assertThat(bookings.forTenant(tenant, agreed.id()).token().status()).isEqualTo(BookingTokenStatus.DUE);

        String wrong = code.getValue().equals("000000") ? "000001" : "000000";
        assertThatThrownBy(() -> tokens.markReceived(owner, property, agreed.id(), ManualPaymentMethod.CASH, null, wrong))
                .isInstanceOf(ValidationException.class);
        assertThat(bookings.forTenant(tenant, agreed.id()).status()).isEqualTo(BookingStatus.AWAITING_TOKEN);
        assertThat(codeUsedAt(agreed.id())).isNull();

        BookingRequestResponse confirmed = tokens.markReceived(
                owner, property, agreed.id(), ManualPaymentMethod.CASH, null, " " + code.getValue() + " ");
        assertThat(confirmed.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(confirmed.token().status()).isEqualTo(BookingTokenStatus.RECEIVED);
        assertThat(confirmed.token().receivedMethod()).isEqualTo(ManualPaymentMethod.CASH);
        assertThat(confirmed.token().receiptCode()).startsWith("TKN-");
        assertThat(codeUsedAt(agreed.id())).isNotNull();
    }

    @Test
    void anotherWayOfPayingNeedsNoCode() {
        BookingRequestResponse agreed = agree(tenant, property, room);

        BookingRequestResponse confirmed = tokens.markReceived(
                owner, property, agreed.id(), ManualPaymentMethod.UPI, "UTR 77", null);
        assertThat(confirmed.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(confirmed.token().receivedMethod()).isEqualTo(ManualPaymentMethod.UPI);
        verifyNoInteractions(delivery);
        // Nothing is left to send a code for.
        assertThatThrownBy(() -> tokens.sendCashCode(owner, property, agreed.id(), "10.0.0.7"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void aClaimedTokenIsAnsweredNotPaidAgainInCash() {
        BookingRequestResponse agreed = agree(tenant, property, room);
        tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.UPI, "UTR 1", null);

        assertThatThrownBy(() -> tokens.sendCashCode(owner, property, agreed.id(), "10.0.0.7"))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Answer that first");
        verifyNoInteractions(delivery);
    }

    @Test
    void cashTheTenantRecordedThemselvesIsReceivedWithoutACode() {
        // The code is the payer's word that cash changed hands. Recording it from their own account is that word.
        BookingRequestResponse agreed = agree(tenant, property, room);
        tokens.claimPaid(tenant, agreed.id(), ManualPaymentMethod.CASH, true, null, null);

        BookingRequestResponse confirmed = tokens.markReceived(owner, property, agreed.id(), null, null, null);

        assertThat(confirmed.status()).isEqualTo(BookingStatus.TOKEN_RECEIVED);
        assertThat(confirmed.token().receivedMethod()).isEqualTo(ManualPaymentMethod.CASH);
        verifyNoInteractions(delivery);
    }

    @Test
    void aPropertyThatAsksForNoCodeRecordsCashWithoutOne() {
        UUID plain = fx.property();
        UUID plainOwner = fx.ownerOf(plain);
        UUID plainRoom = fx.room(plain, 2, 0);
        fx.paymentDetails(plain, false, false);
        settings.create(plainOwner, plain, new SaveBookingSettingsRequest(true, 200_000L, false, 21, true));
        BookingRequestResponse agreed = agree(tenant, plain, plainRoom);

        assertThatThrownBy(() -> tokens.sendCashCode(plainOwner, plain, agreed.id(), "10.0.0.7"))
                .isInstanceOf(ValidationException.class).hasMessageContaining("does not ask for a cash code");
        verifyNoInteractions(delivery);
        assertThat(tokens.markReceived(plainOwner, plain, agreed.id(), ManualPaymentMethod.CASH, null, null).status())
                .isEqualTo(BookingStatus.TOKEN_RECEIVED);
    }

    @Test
    void onlyTheOwnerOrTheHandlerSendsACode() {
        UUID bilal = fx.manager(property, "Bilal");
        fx.grantBookings(property, bilal);
        BookingRequestResponse agreed = agree(tenant, property, room);

        // On the access list, but the owner answered it first, so it is the owner's and not his to collect on.
        assertThatThrownBy(() -> tokens.sendCashCode(bilal, property, agreed.id(), "10.0.0.7"))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Someone else is handling");
        verifyNoInteractions(delivery);
    }

    private BookingRequestResponse agree(UUID person, UUID atProperty, UUID inRoom) {
        BookingRequestResponse sent = bookings.create(person, BookingFixtures.ask(
                fx.attendedEnquiry(atProperty, person, today.minusDays(1)), inRoom, today.plusDays(10)));
        return negotiation.acceptForProperty(fx.ownerOf(atProperty), atProperty, sent.id(), 1);
    }

    /** When the last code sent for this booking was used, or null while it has not been. */
    private Timestamp codeUsedAt(UUID request) {
        return jdbc.queryForObject("""
                SELECT c.consumed_at FROM booking.token_cash_codes c
                JOIN booking.tokens t ON t.id = c.token_id
                WHERE t.request_id = ?
                ORDER BY c.requested_at DESC LIMIT 1
                """, Timestamp.class, request);
    }
}
