package com.khatiyan.d_modules.lead.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.booking.BookingModule;
import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadEnquiry;
import com.khatiyan.d_modules.lead.model.LeadHandlerSource;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitBookedBy;
import com.khatiyan.d_modules.lead.model.VisitStatus;
import com.khatiyan.d_modules.lead.repository.LeadActivityRepository;
import com.khatiyan.d_modules.lead.repository.LeadEnquiryRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.VisitRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Keeps the pipeline level with what feeds it: enquiries, visits and bookings.
 *
 * <p><b>One operation: bring the lead level with how things stand.</b> Every
 * enquiry event and every booking event leads here, and none of them is
 * trusted for what it carries. Each is only a prompt to read the enquiry, the
 * lead's visits and its bookings as they stand now and make the lead agree.
 *
 * <p>That is deliberate. Events are delivered at least once, and not always in
 * the order they happened: a "responded" can be heard before the "raised" it
 * followed, a booking's confirmation before its request, and either twice.
 * Reading the current state gives the same answer whichever event prompted
 * it, so a repeat changes nothing and a late event cannot undo a newer one.
 *
 * <p>Two prompts for the same person at the same property can also arrive at
 * the same moment, on two threads. They are made to take turns
 * ({@link #takeTurnFor}), or both would open a lead and the database would
 * refuse the second.
 *
 * <p>The stages (user, 2026-10-11): a visit scheduled is an early lead, a
 * visit attended an advanced lead, a booking confirmed is booked, and the stay
 * becoming active is moved in. A confirmed booking that ends short of that
 * ends the lead at once, and booking again from the same visit opens it again
 * (2026-10-27). Otherwise the lead dies when nothing is left that could carry
 * it forward.
 */
@Slf4j
@Service
public class LeadPipelineService {

    /** How a lead ends when a confirmed booking of theirs ends without a move-in. */
    private static final Set<LeadCloseReason> BOOKING_ENDINGS = EnumSet.of(
            LeadCloseReason.BOOKING_CANCELLED_BY_TENANT, LeadCloseReason.BOOKING_CANCELLED_BY_PROPERTY,
            LeadCloseReason.DID_NOT_ARRIVE, LeadCloseReason.DID_NOT_SIGN, LeadCloseReason.BOOKED_ELSEWHERE,
            LeadCloseReason.BED_NOT_READY, LeadCloseReason.PROPERTY_COULD_NOT_HOST);

    private final LeadRepository leadRepository;
    private final LeadEnquiryRepository leadEnquiryRepository;
    private final LeadActivityRepository leadActivityRepository;
    private final VisitRepository visitRepository;
    private final EnquiryModule enquiryModule;
    private final BookingModule bookingModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final AuthModule authModule;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public LeadPipelineService(
            LeadRepository leadRepository,
            LeadEnquiryRepository leadEnquiryRepository,
            LeadActivityRepository leadActivityRepository,
            VisitRepository visitRepository,
            EnquiryModule enquiryModule,
            BookingModule bookingModule,
            ReferenceCodeGenerator referenceCodeGenerator,
            AuthModule authModule,
            JdbcTemplate jdbcTemplate, Clock clock) {
        this.leadRepository = leadRepository;
        this.leadEnquiryRepository = leadEnquiryRepository;
        this.leadActivityRepository = leadActivityRepository;
        this.visitRepository = visitRepository;
        this.enquiryModule = enquiryModule;
        this.bookingModule = bookingModule;
        this.referenceCodeGenerator = referenceCodeGenerator;
        this.authModule = authModule;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    /**
     * Brings the lead of an enquiry level with the enquiry, its visits and its
     * bookings, opening or joining a lead when the enquiry has none yet.
     *
     * @param propertyId     the enquiry's property, as the event named it
     * @param prospectUserId the person who enquired, as the event named them
     * @return true when the lead changed stage, closed or opened again
     */
    @Transactional
    public boolean syncFromEnquiry(UUID enquiryId, UUID propertyId, UUID prospectUserId) {
        // The turn first, the read second. Read first, and a prompt that waited
        // its turn would act on what it read before waiting: inside one
        // transaction a second read of the same row returns the first.
        takeTurnFor(propertyId, prospectUserId);

        EnquirySnapshot enquiry = enquiryModule.findSnapshot(enquiryId).orElse(null);
        if (enquiry == null) {
            // Removed since the event was sent. There is nothing to follow.
            return false;
        }

        Lead lead = leadOf(enquiry);
        Instant now = clock.instant();
        LeadStage stageBefore = lead.getStage();
        LeadState stateBefore = lead.getState();

        // Its enquiry was reopened after closing as not interested: the record
        // opens again with it (owner's rule, 2026-10-03), unless another of
        // theirs at this property is open already.
        if (!lead.isOpen() && lead.getCloseReasonOrNull() == LeadCloseReason.NOT_INTERESTED
                && enquiry.endedAt() == null && !enquiry.isOver(now)
                && leadRepository.findByPropertyIdAndProspectUserIdAndState(
                        enquiry.propertyId(), enquiry.enquirerUserId(), LeadState.OPEN).isEmpty()
                && lead.reopen(now)) {
            record(lead, LeadActivityType.REOPENED, null, enquiry.id(), null, now);
            log.info("Lead reopened leadId={} enquiryId={}", lead.getId(), enquiry.id());
        }

        List<UUID> enquiryIds = enquiryIdsOf(lead);
        List<BookingSnapshot> bookings = bookingModule.snapshotsForEnquiries(enquiryIds);
        BookingSnapshot live = lastOf(bookings.stream().filter(BookingSnapshot::isLive).toList());

        // A booking ended it, and they booked again from the same visit: the
        // record lives again (user, 2026-10-27), unless another of theirs at
        // this property is open already.
        if (!lead.isOpen() && live != null && BOOKING_ENDINGS.contains(lead.getCloseReasonOrNull())
                && leadRepository.findByPropertyIdAndProspectUserIdAndState(
                        enquiry.propertyId(), enquiry.enquirerUserId(), LeadState.OPEN).isEmpty()
                && lead.reopen(now)) {
            record(lead, LeadActivityType.REOPENED, null, enquiry.id(), null, now);
            log.info("Lead reopened by a new booking leadId={} bookingId={}", lead.getId(), live.id());
        }

        // While a booking is live its handler is the lead's. The enquiry's own
        // is not even looked at then, so a late or newer word from the enquiry
        // cannot put someone else back.
        if (live != null && live.handlerUserId() != null) {
            if (lead.takeBookingHandler(live.handlerUserId(), live.handlerAssignedAt())) {
                record(lead, LeadActivityType.HANDLER_ASSIGNED, live.handlerUserId(), enquiry.id(),
                        LeadHandlerSource.BOOKING.name(), live.handlerAssignedAt());
            }
        } else if (lead.isOpen() && lead.takeHandler(
                enquiry.handlerUserId(), sourceOf(enquiry), enquiry.handlerAssignedAt())) {
            record(lead, LeadActivityType.HANDLER_ASSIGNED, enquiry.handlerUserId(), enquiry.id(),
                    lead.getHandlerAssignedBy().name(), enquiry.handlerAssignedAt());
        }

        // A direct record starts answered, the person having acted themselves. Nobody answered them, so the
        // lead keeps no first response, and the month's response times are not touched (2026-10-17).
        if (lead.isOpen() && !enquiry.isDirect() && lead.markResponded(enquiry.respondedAt())) {
            record(lead, LeadActivityType.RESPONDED, null, enquiry.id(), null, enquiry.respondedAt());
        }

        // The handler ended the conversation, having marked them not interested,
        // and they never booked a visit. Checked before the unanswered case: an
        // enquiry ended by a person did not simply run out of time.
        if (enquiry.endedAt() != null && lead.isOpen() && lead.getStage() == LeadStage.ENQUIRED
                && noEnquiryStillWaits(lead)) {
            close(lead, LeadCloseReason.NOT_INTERESTED, enquiry.id(), enquiry.endedAt());
        }

        // Reached, back at (or still at) Enquired, and every enquiry it had has
        // run out: nothing is left to book a visit from, so the record ends
        // (owner's rule, 2026-10-03). Named for why: their visit was cancelled,
        // or they never booked one.
        if (lead.isOpen() && lead.getStage() == LeadStage.ENQUIRED
                && (lead.getRespondedAt() != null || enquiry.isDirect())
                && enquiry.isOver(now) && !enquiryModule.anyLive(enquiryIds)) {
            close(lead, visitRepository.existsByLeadIdAndStatus(lead.getId(), VisitStatus.CANCELLED)
                    ? LeadCloseReason.VISIT_CANCELLED
                    : LeadCloseReason.NO_VISIT_BOOKED, enquiry.id(), now);
        }

        if (enquiry.status() == EnquiryStatus.EXPIRED && lead.awaitsFirstAnswer() && noEnquiryStillWaits(lead)) {
            close(lead, LeadCloseReason.NO_REPLY, enquiry.id(), enquiry.expiresAt());
        }

        levelWithVisitsAndBookings(lead, enquiry, enquiryIds, bookings, now);
        return lead.getStage() != stageBefore || lead.getState() != stateBefore;
    }

    /**
     * The part of a lead's life after its enquiry was answered: the visit
     * attended, the booking confirmed, the stay begun, and every way it ends
     * short of that.
     */
    private void levelWithVisitsAndBookings(
            Lead lead, EnquirySnapshot enquiry, List<UUID> enquiryIds, List<BookingSnapshot> bookings, Instant now) {
        recordBookingSteps(lead, bookings);
        if (!lead.isOpen()) {
            return;
        }

        Visit attended = visitRepository
                .findFirstByLeadIdAndStatusOrderByCheckedInAtAsc(lead.getId(), VisitStatus.VISITED)
                .orElse(null);
        if (attended != null
                && lead.reachAdvancedLead(attended.getCheckedInAt() != null ? attended.getCheckedInAt() : now)) {
            log.info("Lead is an advanced lead leadId={} visitId={}", lead.getId(), attended.getId());
        }

        // A stay booked straight from the property profile has no visit: its
        // first request makes it a strong lead (user, 2026-10-17).
        BookingSnapshot firstAsked = bookings.stream()
                .filter(booking -> booking.submittedAt() != null)
                .min(Comparator.comparing(BookingSnapshot::submittedAt))
                .orElse(null);
        if (firstAsked != null && lead.reachAdvancedLead(firstAsked.submittedAt())) {
            log.info("Lead is a strong lead from a booking request leadId={} bookingId={}",
                    lead.getId(), firstAsked.id());
        }

        // The stay is active: converted. The booking knows that moment, so
        // nothing is read from the tenancy.
        BookingSnapshot movedIn = lastOf(bookings.stream()
                .filter(booking -> booking.status() == BookingStatus.MOVED_IN).toList());
        if (movedIn != null) {
            Instant at = movedIn.endedAt() != null ? movedIn.endedAt() : now;
            lead.reachBooked(movedIn.confirmedAt() != null ? movedIn.confirmedAt() : at);
            if (lead.moveIn(movedIn.tenancyId(), at)) {
                log.info("Lead moved in leadId={} bookingId={} tenancyId={}",
                        lead.getId(), movedIn.id(), movedIn.tenancyId());
            }
            return;
        }

        // Confirmed, and only confirmed, is booked. A request sent, countered
        // or agreed, and a token that is due, leave it an advanced lead.
        BookingSnapshot confirmed = lastOf(bookings.stream()
                .filter(booking -> booking.status() == BookingStatus.CONFIRMED).toList());
        if (confirmed != null) {
            if (lead.reachBooked(confirmed.confirmedAt() != null ? confirmed.confirmedAt() : now)) {
                log.info("Lead booked leadId={} bookingId={}", lead.getId(), confirmed.id());
            }
            return;
        }
        if (lead.returnToAdvancedLead()) {
            log.info("Lead back to an advanced lead, its booking ended leadId={}", lead.getId());
        }

        // A confirmed booking that ended short of a move-in ends its lead there
        // and then: cancelled by either side, before or after its move-in day,
        // or the person did not arrive (user, 2026-10-27). It does not wait for
        // the days after the visit to run out. Booking again opens it again.
        BookingSnapshot lastEnded = lastConfirmedThatEnded(bookings);
        if (lastEnded != null && bookings.stream().noneMatch(BookingSnapshot::isLive)) {
            close(lead, reasonFor(lastEnded.endCause()), enquiry.id(),
                    lastEnded.endedAt() != null ? lastEnded.endedAt() : now);
            return;
        }

        // Something is still going, or could still start: it lives.
        if (bookings.stream().anyMatch(BookingSnapshot::isLive)
                || (lead.getStage() != LeadStage.EARLY_LEAD && lead.getStage() != LeadStage.ADVANCED_LEAD)
                || canStillLeadSomewhere(enquiryIds, now)
                || hasVisitToCome(lead, now)) {
            return;
        }
        close(lead, whyItDied(lead, enquiry, bookings), enquiry.id(), now);
    }

    /**
     * Why a lead with nothing left to carry it forward died.
     *
     * <p>A lead that had a confirmed booking is named for what became of that
     * booking, however long ago, so the owner reads "did not arrive" and not
     * only that a window closed. Otherwise an advanced lead ran out of days to
     * book, and an early one never came.
     */
    private LeadCloseReason whyItDied(Lead lead, EnquirySnapshot enquiry, List<BookingSnapshot> bookings) {
        BookingSnapshot lastConfirmed = bookings.stream()
                .filter(booking -> !booking.isLive() && booking.confirmedAt() != null && booking.endCause() != null)
                .max(Comparator.comparing(
                        BookingSnapshot::endedAt, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
        if (lastConfirmed != null) {
            return reasonFor(lastConfirmed.endCause());
        }
        if (lead.getStage() == LeadStage.ADVANCED_LEAD) {
            return LeadCloseReason.BOOKING_WINDOW_EXPIRED;
        }
        if (enquiry.endedAt() != null
                && !visitRepository.existsByLeadIdAndStatus(lead.getId(), VisitStatus.NOT_VISITED)) {
            return LeadCloseReason.NOT_INTERESTED;
        }
        return LeadCloseReason.NO_ANSWER_AFTER_MISSED_VISIT;
    }

    /**
     * Their latest booking, where it was confirmed and then ended without a
     * move-in. Null where the latest is anything else, such as a request sent
     * after it that was never confirmed.
     */
    private static BookingSnapshot lastConfirmedThatEnded(List<BookingSnapshot> bookings) {
        BookingSnapshot latest = bookings.stream()
                .max(Comparator.comparing(
                        BookingSnapshot::submittedAt, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
        if (latest == null || latest.isLive() || latest.confirmedAt() == null || latest.endCause() == null
                || latest.endCause() == BookingEndCause.MOVED_IN) {
            return null;
        }
        return latest;
    }

    private static LeadCloseReason reasonFor(BookingEndCause cause) {
        return switch (cause) {
            case TENANT_CANCELLED -> LeadCloseReason.BOOKING_CANCELLED_BY_TENANT;
            case TENANT_DID_NOT_SIGN -> LeadCloseReason.DID_NOT_SIGN;
            case TENANT_DID_NOT_ARRIVE -> LeadCloseReason.DID_NOT_ARRIVE;
            case BOOKED_ELSEWHERE -> LeadCloseReason.BOOKED_ELSEWHERE;
            case MANAGEMENT_CANCELLED -> LeadCloseReason.BOOKING_CANCELLED_BY_PROPERTY;
            case BED_NOT_READY -> LeadCloseReason.BED_NOT_READY;
            case PROPERTY_CANNOT_HOST -> LeadCloseReason.PROPERTY_COULD_NOT_HOST;
            // A moved-in booking converts its lead before this is ever asked.
            case MOVED_IN -> LeadCloseReason.CONVERTED;
        };
    }

    /**
     * Whether any of the lead's enquiries can still take it forward: a visit
     * booked on one that is live, or a booking raised from one whose days
     * after the visit are still open.
     */
    private boolean canStillLeadSomewhere(Collection<UUID> enquiryIds, Instant now) {
        return enquiryModule.findSnapshots(enquiryIds).values().stream()
                .anyMatch(each -> each.canStillLeadSomewhere(now));
    }

    /** A visit still booked for today or later. Its lead waits for it, whatever its enquiry's date says. */
    private boolean hasVisitToCome(Lead lead, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, LeadVisitService.IST);
        return visitRepository.findByLeadIdOrderByCreatedAtDesc(lead.getId()).stream()
                .anyMatch(visit -> visit.isUpcoming(today));
    }

    /**
     * Puts each booking's steps on the lead's timeline: requested, agreed,
     * confirmed, and how it ended. Each once per booking, however often and in
     * whatever order they are heard of.
     */
    private void recordBookingSteps(Lead lead, List<BookingSnapshot> bookings) {
        if (bookings.isEmpty()) {
            return;
        }
        Set<String> written = new HashSet<>();
        for (LeadActivity step : leadActivityRepository.findByLeadIdAndBookingRequestIdIsNotNull(lead.getId())) {
            written.add(step.getType() + ":" + step.getBookingRequestId());
        }
        for (BookingSnapshot booking : bookings) {
            step(lead, written, LeadActivityType.BOOKING_REQUESTED, booking, booking.submittedAt(),
                    booking.referenceCode());
            if (booking.agreedAt() != null) {
                step(lead, written, LeadActivityType.BOOKING_AGREED, booking, booking.agreedAt(),
                        booking.referenceCode());
            }
            if (booking.confirmedAt() != null) {
                step(lead, written, LeadActivityType.BOOKING_CONFIRMED, booking, booking.confirmedAt(),
                        booking.referenceCode());
            }
            if (booking.status() == BookingStatus.MOVED_IN) {
                step(lead, written, LeadActivityType.MOVED_IN, booking, booking.endedAt(), booking.referenceCode());
            } else if (!booking.isLive()) {
                // How it ended: the cause for one that held a bed to the end, else that it ran out of time.
                step(lead, written, LeadActivityType.BOOKING_ENDED, booking, booking.endedAt(),
                        booking.referenceCode() + ": "
                                + (booking.endCause() != null ? booking.endCause().name() : booking.status().name()));
            }
        }
    }

    private void step(
            Lead lead, Set<String> written, LeadActivityType type, BookingSnapshot booking, Instant at,
            String detail) {
        if (!written.add(type + ":" + booking.id())) {
            return;
        }
        leadActivityRepository.save(LeadActivity.ofBooking(
                lead.getId(), type, booking.id(), booking.enquiryId(), detail, at != null ? at : clock.instant()));
    }

    private void close(Lead lead, LeadCloseReason reason, UUID enquiryId, Instant at) {
        if (!lead.isOpen() || !lead.close(reason, at, endedByProspect(lead, reason))) {
            return;
        }
        record(lead, LeadActivityType.CLOSED, null, enquiryId, reason.name(), at);
        log.info("Lead closed leadId={} reason={} stage={} enquiryId={}",
                lead.getId(), reason, lead.getStage(), enquiryId);
    }

    /**
     * Whether a record ending now ended for the person's own reason, which a
     * later record of theirs here counts (user, 2026-10-17). Three endings can
     * be either side's, and are looked at closer.
     */
    private boolean endedByProspect(Lead lead, LeadCloseReason reason) {
        return switch (reason) {
            // Never reached: theirs only where somebody did try. Nobody trying is the property's.
            case NO_REPLY -> enquiryModule.anyTriedAndUnanswered(enquiryIdsOf(lead));
            // Theirs only where they cancelled the visit themselves.
            case VISIT_CANCELLED -> visitRepository
                    .findFirstByLeadIdAndStatusOrderByCancelledAtDesc(lead.getId(), VisitStatus.CANCELLED)
                    .map(visit -> visit.getCancelledBy() == VisitBookedBy.TENANT)
                    .orElse(false);
            // The days to book ran out: not theirs where the property let their last request down.
            case BOOKING_WINDOW_EXPIRED ->
                    !propertyLetLastRequestDown(bookingModule.snapshotsForEnquiries(enquiryIdsOf(lead)));
            default -> reason.isAlwaysTheProspects();
        };
    }

    /** Their last booking request was cancelled by the property, or ran out waiting on its answer. */
    private static boolean propertyLetLastRequestDown(List<BookingSnapshot> bookings) {
        BookingSnapshot last = bookings.stream()
                .max(Comparator.comparing(
                        BookingSnapshot::submittedAt, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
        if (last == null) {
            return false;
        }
        if (last.status() == BookingStatus.CANCELLED) {
            return last.endCause() != null && !last.endCause().isTenantSide();
        }
        return last.status() == BookingStatus.EXPIRED && last.agreedAt() == null
                && last.currentOfferBy() == BookingParty.TENANT;
    }

    /**
     * The lead this enquiry belongs to.
     *
     * <p>Already linked: that lead. Otherwise the person's open lead at this
     * property, which the enquiry joins. Otherwise a new one: a repeat where
     * they walked away from earlier records here, else a resumed one where
     * their last record here ended without a move-in.
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

        // They came back. Their records here since they last moved in, newest
        // first: a past tenant returning starts afresh.
        List<Lead> sinceMoveIn = new ArrayList<>();
        for (Lead ended : leadRepository.findByPropertyIdAndProspectUserIdAndStateOrderByClosedAtDesc(
                enquiry.propertyId(), enquiry.enquirerUserId(), LeadState.CLOSED)) {
            if (ended.getCloseReason() == LeadCloseReason.CONVERTED) {
                break;
            }
            sinceMoveIn.add(ended);
        }
        // Those that ended for their own reason make this a repeat: a duplicate,
        // or potential spam from the third (user, 2026-10-17). Otherwise it
        // resumes the last one, which the property let down (2026-10-11).
        List<Lead> walkaways = sinceMoveIn.stream().filter(Lead::isEndedByProspect).toList();
        Lead latestWalkaway = walkaways.isEmpty() ? null : walkaways.get(0);
        Lead earlier = latestWalkaway == null && !sinceMoveIn.isEmpty() ? sinceMoveIn.get(0) : null;

        String code = referenceCodeGenerator.nextCode("LEAD");
        Lead opened;
        if (latestWalkaway != null) {
            opened = Lead.repeatByEnquiry(
                    code, enquiry.propertyId(), enquiry.enquirerUserId(), enquiry.id(), enquiry.raisedAt(),
                    latestWalkaway.getId(), walkaways.size());
        } else if (earlier != null) {
            opened = Lead.resumedByEnquiry(
                    code, enquiry.propertyId(), enquiry.enquirerUserId(), enquiry.id(), enquiry.raisedAt(),
                    earlier.getId());
        } else {
            opened = Lead.openedByEnquiry(
                    code, enquiry.propertyId(), enquiry.enquirerUserId(), enquiry.id(), enquiry.raisedAt());
        }
        // The name the Leads screen searches by (2026-10-17).
        opened.nameProspect(authModule.findById(enquiry.enquirerUserId())
                .map(UserSummaryResponse::fullName)
                .orElse(null));
        opened = leadRepository.save(opened);
        leadEnquiryRepository.save(LeadEnquiry.of(enquiry.id(), opened.getId(), enquiry.raisedAt()));
        record(opened, LeadActivityType.ENQUIRY_RAISED, null, enquiry.id(), null, enquiry.raisedAt());
        if (latestWalkaway != null) {
            record(opened,
                    opened.repeatFlag() == LeadRepeatFlag.POTENTIAL_SPAM
                            ? LeadActivityType.MARKED_SPAM
                            : LeadActivityType.MARKED_DUPLICATE,
                    null, enquiry.id(), latestWalkaway.getReferenceCode(), enquiry.raisedAt());
        } else if (earlier != null) {
            record(opened, LeadActivityType.RESUMED, null, enquiry.id(), earlier.getReferenceCode(),
                    enquiry.raisedAt());
        }
        log.info("Lead opened leadId={} code={} propertyId={} enquiryId={} resumedFrom={} repeat={} walkaways={}",
                opened.getId(), opened.getReferenceCode(), enquiry.propertyId(), enquiry.id(),
                earlier == null ? null : earlier.getId(), opened.repeatFlag(), walkaways.size());
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
        return !enquiryModule.anyAwaitingAnswer(enquiryIdsOf(lead));
    }

    private List<UUID> enquiryIdsOf(Lead lead) {
        return leadEnquiryRepository.findByLeadId(lead.getId()).stream()
                .map(LeadEnquiry::getEnquiryId)
                .toList();
    }

    private static <T> T lastOf(List<T> items) {
        return items.isEmpty() ? null : items.get(items.size() - 1);
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
                occurredAt != null ? occurredAt : clock.instant()));
    }

    /**
     * Makes work for one person at one property take turns.
     *
     * <p>A lock held until this transaction ends, on a number made from the
     * pair. A second prompt for the same pair waits here until the first has
     * committed, then sees the lead it opened. Other people and other
     * properties are not held up.
     *
     * <p>Also taken by whatever else writes a lead outside a prompt, so that
     * write and a prompt cannot cross.
     */
    public void takeTurnFor(UUID propertyId, UUID prospectUserId) {
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> { },
                "lead:" + propertyId + ":" + prospectUserId);
    }
}
