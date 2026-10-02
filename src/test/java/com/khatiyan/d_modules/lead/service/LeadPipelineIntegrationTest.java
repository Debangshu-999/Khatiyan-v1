package com.khatiyan.d_modules.lead.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.d_modules.analytics.LargePropertySeeder;
import com.khatiyan.d_modules.analytics.LargePropertySeeder.Seeded;
import com.khatiyan.d_modules.chat.ChatModule;
import com.khatiyan.d_modules.enquiry.api.dto.AssignEnquiryHandlerRequest;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryDetailResponse;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.SettleEnquiryAttemptRequest;
import com.khatiyan.d_modules.enquiry.api.dto.UpdateEnquiryChannelConsentsRequest;
import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.service.EnquiryChannelConsentService;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;
import com.khatiyan.d_modules.lead.api.dto.LeadActivityResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadCountsResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadDetailResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadResponse;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadHandlerSource;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.support.IntegrationTest;
import com.khatiyan.support.PublishedEvents;

/**
 * The pipeline follows its enquiries, through the real events.
 *
 * <p>Nothing here calls the pipeline to say "an enquiry was raised". The
 * enquiry service is used as the app uses it, the events it publishes are
 * delivered by Spring Modulith on their own threads, and each test waits for
 * them to finish before looking. So these also prove the listeners are wired.
 *
 * <p>Expiry is the exception. The sweep that expires enquiries runs under a
 * scheduler lock that would make a second run in the same minute do nothing, so
 * a test expires the enquiry in the database and then prompts the pipeline the
 * way the expiry event would.
 */
@IntegrationTest
class LeadPipelineIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private EnquiryService enquiryService;
    @Autowired private EnquiryChannelConsentService consentService;
    @Autowired private LeadPipelineService pipeline;
    @Autowired private LeadQueryService leads;

    // The same two mocks as the enquiry flow test, so both share one context.
    @MockitoBean private NotificationModule notifications;
    @MockitoBean private ChatModule chat;

    private Seeded seeded;
    private UUID property;
    private UUID owner;
    private UUID managerA;
    private UUID managerB;
    private List<UUID> prospects;

    @BeforeEach
    void seed() {
        seeded = LargePropertySeeder.seed(jdbc, LocalDate.now(IST), 8, 1, 51L);
        property = seeded.propertyId();
        owner = seeded.ownerId();
        prospects = seeded.userIds().stream().filter(id -> !id.equals(owner)).limit(3).toList();
        assertThat(prospects).hasSize(3);
        managerA = manager("Manager A");
        managerB = manager("Manager B");
        when(chat.openEnquiryThread(any(), any(), any(), any())).thenReturn(UUID.randomUUID());
    }

    @AfterEach
    void remove() {
        awaitListeners();
        jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", property);
        jdbc.update("DELETE FROM enquiry.enquiries WHERE property_id = ?", property);
        for (UUID prospect : prospects) {
            jdbc.update("DELETE FROM enquiry.enquiry_channel_consents WHERE user_id = ?", prospect);
        }
        jdbc.update("DELETE FROM property.property_managers WHERE property_id = ?", property);
        LargePropertySeeder.remove(jdbc, seeded);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", managerA, managerB);
    }

    @Test
    void anEnquiryOpensALeadAtEnquired() {
        UUID prospect = prospects.get(0);
        UUID enquiry = raise(prospect);

        LeadResponse lead = onlyLead();

        assertThat(lead.referenceCode()).startsWith("LEAD-");
        assertThat(lead.prospectUserId()).isEqualTo(prospect);
        assertThat(lead.prospectName()).isNotBlank();
        assertThat(lead.enquiryId()).isEqualTo(enquiry);
        assertThat(lead.stage()).isEqualTo(LeadStage.ENQUIRED);
        assertThat(lead.state()).isEqualTo(LeadState.OPEN);
        assertThat(lead.enquiredAt()).isNotNull();
        assertThat(lead.handlerUserId()).isNull();
        assertThat(types(lead.id())).containsExactly(LeadActivityType.ENQUIRY_RAISED);

        // Hearing of the same enquiry again opens nothing and records nothing.
        pipeline.syncFromEnquiry(enquiry, property, prospect);
        pipeline.syncFromEnquiry(enquiry, property, prospect);

        assertThat(onlyLead().id()).isEqualTo(lead.id());
        assertThat(types(lead.id())).containsExactly(LeadActivityType.ENQUIRY_RAISED);
    }

    @Test
    void theLeadFollowsItsEnquirysHandlerAndFirstAnswer() {
        UUID enquiry = raise(prospects.get(0));

        // The first attempt makes its author the handler, of the enquiry and so of the lead.
        EnquiryDetailResponse called = act(() -> enquiryService.respond(
                managerA, enquiry, new RespondToEnquiryRequest(EnquiryResponseChannel.CALL_BACK, null)));

        LeadResponse handled = onlyLead();
        assertThat(handled.handlerUserId()).isEqualTo(managerA);
        assertThat(handled.handlerName()).isEqualTo("Manager A");
        assertThat(handled.handlerAssignedBy()).isEqualTo(LeadHandlerSource.FIRST_RESPONSE);
        assertThat(handled.respondedAt()).isNull();

        // An attempt is not an answer. The lead is answered when the call is settled as a success.
        act(() -> enquiryService.settleAttempt(managerA, enquiry, called.callToSettleId(),
                new SettleEnquiryAttemptRequest(EnquiryAttemptOutcome.SUCCEEDED, null)));

        LeadResponse answered = onlyLead();
        assertThat(answered.respondedAt()).isNotNull();
        assertThat(answered.stage()).isEqualTo(LeadStage.ENQUIRED);

        // The owner moves the enquiry on. The lead moves with it.
        act(() -> enquiryService.assign(owner, enquiry, new AssignEnquiryHandlerRequest(managerB)));

        LeadResponse moved = onlyLead();
        assertThat(moved.handlerUserId()).isEqualTo(managerB);
        assertThat(moved.handlerAssignedBy()).isEqualTo(LeadHandlerSource.OWNER);

        LeadDetailResponse detail = leads.detail(owner, moved.id());
        assertThat(detail.timeline()).extracting(LeadActivityResponse::type).containsExactly(
                LeadActivityType.HANDLER_ASSIGNED,
                LeadActivityType.RESPONDED,
                LeadActivityType.HANDLER_ASSIGNED,
                LeadActivityType.ENQUIRY_RAISED);
        assertThat(detail.timeline().get(0).subjectName()).isEqualTo("Manager B");
        assertThat(detail.timeline().get(0).detail()).isEqualTo("OWNER");
    }

    @Test
    void anEnquiryNobodyAnsweredClosesItsLeadWhenItExpires() {
        UUID prospect = prospects.get(0);
        UUID enquiry = raise(prospect);

        expire(enquiry, prospect);

        LeadResponse closed = onlyLead();
        assertThat(closed.state()).isEqualTo(LeadState.CLOSED);
        assertThat(closed.closeReason()).isEqualTo(LeadCloseReason.NO_REPLY);
        assertThat(closed.closedAt()).isNotNull();
        // It keeps the stage it reached.
        assertThat(closed.stage()).isEqualTo(LeadStage.ENQUIRED);
        assertThat(types(closed.id())).contains(LeadActivityType.CLOSED);

        // Asking again starts a new record. The closed one stays as history.
        raise(prospect);

        assertThat(page(null, null).items()).hasSize(2);
        assertThat(page(LeadState.OPEN, null).items()).hasSize(1);
        assertThat(page(LeadState.CLOSED, null).items()).extracting(LeadResponse::id).containsExactly(closed.id());
    }

    @Test
    void aSecondEnquiryFromTheSamePersonJoinsTheirOpenLead() {
        UUID prospect = prospects.get(0);
        UUID first = raise(prospect);
        EnquiryDetailResponse called = act(() -> enquiryService.respond(
                managerA, first, new RespondToEnquiryRequest(EnquiryResponseChannel.CALL_BACK, null)));
        act(() -> enquiryService.settleAttempt(managerA, first, called.callToSettleId(),
                new SettleEnquiryAttemptRequest(EnquiryAttemptOutcome.SUCCEEDED, null)));

        // Answered, so they may ask again. It is the same person at the same property: one record.
        UUID second = raise(prospect);

        LeadResponse lead = onlyLead();
        assertThat(lead.enquiryId()).isEqualTo(first);
        assertThat(types(lead.id())).contains(LeadActivityType.ENQUIRY_JOINED);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM lead.lead_enquiries WHERE lead_id = ?", Long.class, lead.id())).isEqualTo(2);

        // The second one expiring unanswered does not close a lead that was already reached.
        expire(second, prospect);

        assertThat(onlyLead().state()).isEqualTo(LeadState.OPEN);
    }

    /**
     * The person asks again the moment their first enquiry expires, and the new
     * enquiry is heard of before the old one's expiry is. The late expiry must
     * not close a lead whose new enquiry is still waiting.
     */
    @Test
    void aLateExpiryDoesNotCloseALeadWhoseNewEnquiryStillWaits() {
        UUID prospect = prospects.get(0);
        UUID first = raise(prospect);
        // Expired in the database, with the pipeline not yet told.
        markExpired(first);

        UUID second = raise(prospect);
        assertThat(onlyLead().state()).isEqualTo(LeadState.OPEN);

        pipeline.syncFromEnquiry(first, property, prospect);

        LeadResponse stillOpen = onlyLead();
        assertThat(stillOpen.state()).isEqualTo(LeadState.OPEN);

        // When the second one expires too, nothing is waiting any more.
        expire(second, prospect);

        assertThat(onlyLead().closeReason()).isEqualTo(LeadCloseReason.NO_REPLY);
    }

    @Test
    void theCountsAndFiltersFollowTheRecords() {
        raise(prospects.get(0));
        raise(prospects.get(1));
        UUID toExpire = raise(prospects.get(2));
        expire(toExpire, prospects.get(2));

        assertThat(leads.countsForProperty(managerA, property))
                .isEqualTo(new LeadCountsResponse(2, 0, 0, 0, 0, 1));
        assertThat(page(LeadState.OPEN, LeadStage.ENQUIRED).totalElements()).isEqualTo(2);
        assertThat(page(null, LeadStage.ENQUIRED).totalElements()).isEqualTo(3);
        assertThat(page(LeadState.OPEN, LeadStage.BOOKED).items()).isEmpty();

        // Newest first, a page at a time.
        PageResponse<LeadResponse> firstPage = leads.pageForProperty(owner, property, null, null, 0, 2);
        assertThat(firstPage.items()).hasSize(2);
        assertThat(firstPage.hasNext()).isTrue();
        assertThat(firstPage.items().get(0).prospectUserId()).isEqualTo(prospects.get(2));
    }

    @Test
    void onlyThePropertysManagementReadsItsLeads() {
        raise(prospects.get(0));
        UUID lead = onlyLead().id();
        UUID outsider = prospects.get(1);

        assertThatThrownBy(() -> leads.pageForProperty(outsider, property, null, null, 0, 20))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> leads.countsForProperty(outsider, property))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> leads.detail(outsider, lead))
                .isInstanceOf(RuntimeException.class);
        assertThat(leads.detail(managerB, lead).lead().id()).isEqualTo(lead);
    }

    // ---- Helpers ---------------------------------------------------------

    /** Raises an enquiry and waits for the pipeline to hear of it. */
    private UUID raise(UUID prospect) {
        consentService.replace(prospect,
                new UpdateEnquiryChannelConsentsRequest(Set.of(EnquiryResponseChannel.CALL_BACK), true));
        return act(() -> enquiryService
                .raise(prospect, property, new RaiseEnquiryRequest("Is a single room free?"))
                .enquiryId());
    }

    /** Runs something on the enquiry, then waits for every event it published to be handled. */
    private <T> T act(java.util.function.Supplier<T> action) {
        T result = action.get();
        awaitListeners();
        return result;
    }

    private void markExpired(UUID enquiry) {
        awaitListeners();
        jdbc.update("UPDATE enquiry.enquiries SET status = 'EXPIRED', expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), enquiry);
    }

    /** Expires an enquiry and prompts the pipeline, as the expiry event would. */
    private void expire(UUID enquiry, UUID prospect) {
        markExpired(enquiry);
        pipeline.syncFromEnquiry(enquiry, property, prospect);
    }

    /** Waits until the pipeline has handled every event published about this property. */
    private void awaitListeners() {
        PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
    }

    private PageResponse<LeadResponse> page(LeadState state, LeadStage stage) {
        return leads.pageForProperty(owner, property, state, stage, 0, 20);
    }

    private LeadResponse onlyLead() {
        List<LeadResponse> all = page(null, null).items();
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    /** A lead's timeline, oldest first. */
    private List<LeadActivityType> types(UUID lead) {
        List<LeadActivityType> newestFirst =
                leads.detail(owner, lead).timeline().stream().map(LeadActivityResponse::type).toList();
        return newestFirst.reversed();
    }

    private UUID manager(String name) {
        UUID id = UUID.randomUUID();
        String phone = "+9196" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, ?, 'USER', true, true, 0, 'MALE', DATE '1990-01-01', now(), now())
                """, id, phone, name);
        jdbc.update("""
                INSERT INTO property.property_managers (id, property_id, manager_user_id, assigned_by_user_id,
                    is_active, reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, true, ?, now(), now())
                """, UUID.randomUUID(), property, id, owner, "MGR-T-" + id.toString().substring(0, 12));
        return id;
    }
}
