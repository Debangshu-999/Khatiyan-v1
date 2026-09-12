package com.khatiyan.modulith;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.modulith.events.core.EventSerializer;

import com.khatiyan.d_modules.billing.event.BillingCycleGeneratedEvent;
import com.khatiyan.d_modules.billing.event.PaymentClaimRaisedEvent;
import com.khatiyan.d_modules.property.event.PropertyCreatedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyExitWithdrawalDecidedEvent;
import com.khatiyan.d_modules.tenancy.model.TenancyExitRequestType;
import com.khatiyan.support.IntegrationTest;

/**
 * Event payloads already sitting in the database must still be readable.
 *
 * <p><b>What breaks if they are not.</b> Cross-module events are published
 * through {@code event_publication}, which stores each payload as JSON and
 * keeps the row until its listener completes. A publication that has not
 * completed — the listener threw, or the process died mid-delivery — is
 * retried after restart by deserialising that stored JSON back into the event
 * record. If the new stack cannot read what the old one wrote, those events are
 * not retried, they are dead: a tenancy that never got its bill, a notification
 * nobody ever receives, and no error anywhere pointing at the cause.
 *
 * <p><b>Why now.</b> Hazard #2 of the Spring Boot 4.1 upgrade
 * (see {@code docs/Spring AI/ai-intelligence-platform-spec.md} §6.2), which
 * moves Modulith 1.3 → 2.1 and Jackson 2 → 3. The spec's remedy is to drain
 * incomplete publications before cutover <em>or</em> prove old rows still
 * deserialise. This is that proof, and it is the cheaper half: draining is a
 * one-off that has to be got right on the day, while this fails the build.
 *
 * <p><b>How it works.</b> Each constant below is the exact JSON the current
 * serializer writes, captured on Boot 3.3.5 / Jackson 2 and committed. The
 * tests read those strings back through the real {@link EventSerializer} bean
 * and check the result equals the original record — the same operation a
 * restart performs against a real row. Four events were chosen to cover every
 * type the 49 event records use between them: UUID, String, a null String,
 * enum, boolean, long, boxed Integer, LocalDate, a nested record and a list.
 *
 * <p><b>If this fails after the upgrade,</b> the constants are not the problem.
 * Rows in the live database look exactly like them.
 */
@IntegrationTest
@DisplayName("stored event payloads")
class EventPayloadCompatibilityTest {

    @Autowired private EventSerializer serializer;

    // ---------------------------------------------------------------- fixtures

    private static final UUID ID_A = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID ID_B = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID ID_C = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID ID_D = UUID.fromString("44444444-4444-4444-8444-444444444444");

    /** Boxed Integer, LocalDate, primitive long. */
    private static final BillingCycleGeneratedEvent BILLING_CYCLE = new BillingCycleGeneratedEvent(
            ID_A, ID_B, ID_C, ID_D, 7, LocalDate.of(2026, 9, 23), 13_500_00L);

    /** Enum, primitive boolean, and a LocalDate that is deliberately null. */
    private static final TenancyExitWithdrawalDecidedEvent EXIT_WITHDRAWAL =
            new TenancyExitWithdrawalDecidedEvent(
                    ID_A, "TEX-2026-000001", ID_B, ID_C, ID_D,
                    TenancyExitRequestType.NORMAL_NOTICE, true, null);

    /** A nested record inside a list, plus a null String. */
    private static final PropertyCreatedEvent PROPERTY_CREATED = new PropertyCreatedEvent(
            ID_A, ID_B, "Quiet rooms near the metro", null, "https://img.example/cover.jpg",
            List.of(new PropertyCreatedEvent.ImageRef("https://img.example/1.jpg", "prop/1")));

    /** Text that has to survive escaping, alongside a false boolean. */
    private static final PaymentClaimRaisedEvent PAYMENT_CLAIM = new PaymentClaimRaisedEvent(
            ID_A, ID_B, ID_C, ID_D, "Jane \"JJ\" Smith", "PAY-2026-000001", 12_000_00L,
            "UPI ref 402931 — paid 9pm", false);

    // ------------------------------------------------- the JSON as stored today

    private static final String BILLING_CYCLE_JSON =
            "{\"billingCycleId\":\"11111111-1111-4111-8111-111111111111\","
                    + "\"tenancyId\":\"22222222-2222-4222-8222-222222222222\","
                    + "\"tenantUserId\":\"33333333-3333-4333-8333-333333333333\","
                    + "\"propertyId\":\"44444444-4444-4444-8444-444444444444\","
                    + "\"cycleNumber\":7,\"rentDueDate\":\"2026-09-23\",\"totalAmountPaise\":1350000}";

    private static final String EXIT_WITHDRAWAL_JSON =
            "{\"requestId\":\"11111111-1111-4111-8111-111111111111\","
                    + "\"requestReferenceCode\":\"TEX-2026-000001\","
                    + "\"tenancyId\":\"22222222-2222-4222-8222-222222222222\","
                    + "\"tenantUserId\":\"33333333-3333-4333-8333-333333333333\","
                    + "\"propertyId\":\"44444444-4444-4444-8444-444444444444\","
                    + "\"type\":\"NORMAL_NOTICE\",\"approved\":true,\"approvedCheckoutDate\":null}";
    private static final String PROPERTY_CREATED_JSON =
            "{\"propertyId\":\"11111111-1111-4111-8111-111111111111\","
                    + "\"ownerId\":\"22222222-2222-4222-8222-222222222222\","
                    + "\"discoveryHeadline\":\"Quiet rooms near the metro\","
                    + "\"discoveryDescription\":null,"
                    + "\"discoveryProfileImageUrl\":\"https://img.example/cover.jpg\","
                    + "\"discoveryImages\":[{\"url\":\"https://img.example/1.jpg\","
                    + "\"publicId\":\"prop/1\"}]}";
    private static final String PAYMENT_CLAIM_JSON =
            "{\"paymentIntentId\":\"11111111-1111-4111-8111-111111111111\","
                    + "\"billingCycleId\":\"22222222-2222-4222-8222-222222222222\","
                    + "\"propertyId\":\"33333333-3333-4333-8333-333333333333\","
                    + "\"tenantUserId\":\"44444444-4444-4444-8444-444444444444\","
                    + "\"tenantName\":\"Jane \\\"JJ\\\" Smith\",\"referenceCode\":\"PAY-2026-000001\","
                    + "\"amountPaise\":1200000,\"tenantReferenceText\":\"UPI ref 402931 — paid 9pm\","
                    + "\"hasProof\":false}";

    // -------------------------------------------------------------------- tests

    @Test
    @DisplayName("with dates and numbers read back unchanged")
    void billingCycleEvent() {
        assertRoundTrip(BILLING_CYCLE, BILLING_CYCLE_JSON, BillingCycleGeneratedEvent.class);
    }

    @Test
    @DisplayName("with an enum and a null date read back unchanged")
    void exitWithdrawalEvent() {
        assertRoundTrip(
                EXIT_WITHDRAWAL, EXIT_WITHDRAWAL_JSON, TenancyExitWithdrawalDecidedEvent.class);
    }

    @Test
    @DisplayName("with a nested record list read back unchanged")
    void propertyCreatedEvent() {
        assertRoundTrip(PROPERTY_CREATED, PROPERTY_CREATED_JSON, PropertyCreatedEvent.class);
    }

    @Test
    @DisplayName("with escaped text and a boolean read back unchanged")
    void paymentClaimEvent() {
        assertRoundTrip(PAYMENT_CLAIM, PAYMENT_CLAIM_JSON, PaymentClaimRaisedEvent.class);
    }

    /**
     * Both directions, because they fail differently.
     *
     * <p>Reading the committed JSON is the one that matters: it is what a
     * restart does to a row written months ago. Serialising as well catches the
     * case where the new stack writes a shape it can read but the old one
     * cannot — which matters during a rollback, when the previous version has
     * to pick up rows the new one left behind.
     */
    private <T> void assertRoundTrip(T event, String storedJson, Class<T> type) {
        assertThat(serializer.serialize(event))
                .as("The serialised shape has moved, so a rollback could not read "
                        + "what this version wrote.")
                .hasToString(storedJson);

        assertThat(serializer.<T>deserialize(storedJson, type))
                .as("A payload already in event_publication no longer reads back. "
                        + "Rows in the live database look exactly like this one.")
                .isEqualTo(event);
    }
}
