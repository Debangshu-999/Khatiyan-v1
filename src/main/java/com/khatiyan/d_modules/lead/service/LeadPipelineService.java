package com.khatiyan.d_modules.lead.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadEnquiry;
import com.khatiyan.d_modules.lead.model.LeadHandlerSource;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.repository.LeadActivityRepository;
import com.khatiyan.d_modules.lead.repository.LeadEnquiryRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Keeps the pipeline level with the enquiries that feed it.
 *
 * <p><b>One operation: bring the lead level with its enquiry.</b> Every enquiry
 * event (raised, handler assigned, responded, expired) leads here, and none of
 * them is trusted for what it carries. Each is only a prompt to read the
 * enquiry as it stands now and make the lead agree with it.
 *
 * <p>That is deliberate. Events are delivered at least once, and not always in
 * the order they happened: a "responded" can be heard before the "raised" it
 * followed, and either can be heard twice. Reading the current state gives the
 * same answer whichever event prompted it, so a repeat changes nothing and a
 * late event cannot undo a newer one.
 *
 * <p>Two prompts for the same person at the same property can also arrive at
 * the same moment, on two threads. They are made to take turns
 * ({@link #takeTurnFor}), or both would open a lead and the database would
 * refuse the second.
 */
@Slf4j
@Service
public class LeadPipelineService {

    private final LeadRepository leadRepository;
    private final LeadEnquiryRepository leadEnquiryRepository;
    private final LeadActivityRepository leadActivityRepository;
    private final EnquiryModule enquiryModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final JdbcTemplate jdbcTemplate;

    public LeadPipelineService(
            LeadRepository leadRepository,
            LeadEnquiryRepository leadEnquiryRepository,
            LeadActivityRepository leadActivityRepository,
            EnquiryModule enquiryModule,
            ReferenceCodeGenerator referenceCodeGenerator,
            JdbcTemplate jdbcTemplate) {
        this.leadRepository = leadRepository;
        this.leadEnquiryRepository = leadEnquiryRepository;
        this.leadActivityRepository = leadActivityRepository;
        this.enquiryModule = enquiryModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Brings the lead of an enquiry level with the enquiry, opening or joining
     * one when the enquiry has none yet.
     *
     * @param propertyId     the enquiry's property, as the event named it
     * @param prospectUserId the person who enquired, as the event named them
     */
    @Transactional
    public void syncFromEnquiry(UUID enquiryId, UUID propertyId, UUID prospectUserId) {
        // The turn first, the read second. Read first, and a prompt that waited
        // its turn would act on what it read before waiting: inside one
        // transaction a second read of the same row returns the first.
        takeTurnFor(propertyId, prospectUserId);

        EnquirySnapshot enquiry = enquiryModule.findSnapshot(enquiryId).orElse(null);
        if (enquiry == null) {
            // Removed since the event was sent. There is nothing to follow.
            return;
        }

        Lead lead = leadOf(enquiry);

        if (lead.isOpen() && lead.takeHandler(
                enquiry.handlerUserId(), sourceOf(enquiry), enquiry.handlerAssignedAt())) {
            record(lead, LeadActivityType.HANDLER_ASSIGNED, enquiry.handlerUserId(), enquiry.id(),
                    lead.getHandlerAssignedBy().name(), enquiry.handlerAssignedAt());
        }

        if (lead.isOpen() && lead.markResponded(enquiry.respondedAt())) {
            record(lead, LeadActivityType.RESPONDED, null, enquiry.id(), null, enquiry.respondedAt());
        }

        // The handler ended the conversation, having marked them not interested,
        // and they never booked a visit. Checked before the unanswered case: an
        // enquiry ended by a person did not simply run out of time.
        if (enquiry.endedAt() != null && lead.isOpen() && lead.getStage() == LeadStage.ENQUIRED
                && noEnquiryStillWaits(lead)) {
            lead.close(LeadCloseReason.NOT_INTERESTED, enquiry.endedAt());
            record(lead, LeadActivityType.CLOSED, null, enquiry.id(),
                    LeadCloseReason.NOT_INTERESTED.name(), enquiry.endedAt());
            log.info("Lead closed leadId={} reason=NOT_INTERESTED enquiryId={}", lead.getId(), enquiry.id());
        }

        if (enquiry.status() == EnquiryStatus.EXPIRED && lead.awaitsFirstAnswer() && noEnquiryStillWaits(lead)) {
            lead.close(LeadCloseReason.NO_REPLY, enquiry.expiresAt());
            record(lead, LeadActivityType.CLOSED, null, enquiry.id(),
                    LeadCloseReason.NO_REPLY.name(), enquiry.expiresAt());
            log.info("Lead closed leadId={} reason=NO_REPLY enquiryId={}", lead.getId(), enquiry.id());
        }
    }

    /**
     * The lead this enquiry belongs to.
     *
     * <p>Already linked: that lead. Otherwise the person's open lead at this
     * property, which the enquiry joins. Otherwise a new one.
     */
    private Lead leadOf(EnquirySnapshot enquiry) {
        LeadEnquiry link = leadEnquiryRepository.findById(enquiry.id()).orElse(null);
        if (link != null) {
            return leadRepository.findById(link.getLeadId()).orElseThrow();
        }

        Lead open = leadRepository
                .findByPropertyIdAndProspectUserIdAndState(
                        enquiry.propertyId(), enquiry.enquirerUserId(), LeadState.OPEN)
                .orElse(null);
        if (open != null) {
            leadEnquiryRepository.save(LeadEnquiry.of(enquiry.id(), open.getId(), enquiry.raisedAt()));
            record(open, LeadActivityType.ENQUIRY_JOINED, null, enquiry.id(), null, enquiry.raisedAt());
            log.info("Enquiry joined an open lead leadId={} enquiryId={}", open.getId(), enquiry.id());
            return open;
        }

        Lead opened = leadRepository.save(Lead.openedByEnquiry(
                referenceCodeGenerator.nextCode("LEAD"),
                enquiry.propertyId(),
                enquiry.enquirerUserId(),
                enquiry.id(),
                enquiry.raisedAt()));
        leadEnquiryRepository.save(LeadEnquiry.of(enquiry.id(), opened.getId(), enquiry.raisedAt()));
        record(opened, LeadActivityType.ENQUIRY_RAISED, null, enquiry.id(), null, enquiry.raisedAt());
        log.info("Lead opened leadId={} code={} propertyId={} enquiryId={}",
                opened.getId(), opened.getReferenceCode(), enquiry.propertyId(), enquiry.id());
        return opened;
    }

    /**
     * Whether every enquiry under this lead has stopped waiting.
     *
     * <p>An expired enquiry closes its lead only when the person has no other
     * enquiry still open there. They can ask again the moment the first one
     * expires, and that second enquiry can be heard of before the first one's
     * expiry is.
     */
    private boolean noEnquiryStillWaits(Lead lead) {
        List<UUID> enquiryIds = leadEnquiryRepository.findByLeadId(lead.getId()).stream()
                .map(LeadEnquiry::getEnquiryId)
                .toList();
        return !enquiryModule.anyAwaitingAnswer(enquiryIds);
    }

    private static LeadHandlerSource sourceOf(EnquirySnapshot enquiry) {
        return enquiry.handlerAssignedBy() == null
                ? null
                : LeadHandlerSource.valueOf(enquiry.handlerAssignedBy().name());
    }

    private void record(
            Lead lead, LeadActivityType type, UUID subjectUserId, UUID enquiryId, String detail, Instant occurredAt) {
        leadActivityRepository.save(LeadActivity.bySystem(
                lead.getId(), type, subjectUserId, enquiryId, detail,
                occurredAt != null ? occurredAt : Instant.now()));
    }

    /**
     * Makes work for one person at one property take turns.
     *
     * <p>A lock held until this transaction ends, on a number made from the
     * pair. A second prompt for the same pair waits here until the first has
     * committed, then sees the lead it opened. Other people and other
     * properties are not held up.
     */
    private void takeTurnFor(UUID propertyId, UUID prospectUserId) {
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> { },
                "lead:" + propertyId + ":" + prospectUserId);
    }
}
