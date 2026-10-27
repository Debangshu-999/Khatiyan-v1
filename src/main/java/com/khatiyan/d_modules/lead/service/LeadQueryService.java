package com.khatiyan.d_modules.lead.service;

import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.booking.api.dto.BookingSnapshot;
import com.khatiyan.d_modules.enquiry.EnquiryModule;
import com.khatiyan.d_modules.enquiry.api.dto.EnquirySnapshot;
import com.khatiyan.d_modules.lead.api.dto.LeadActivityResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadBookingRef;
import com.khatiyan.d_modules.lead.api.dto.LeadCountsResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadDetailResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadEnquiryRef;
import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadGoingColdResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadLinkRef;
import com.khatiyan.d_modules.lead.api.dto.LeadRepeatResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadVisitRef;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadKind;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.repository.LeadActivityRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository.KindCount;
import com.khatiyan.d_modules.property.PropertyModule;

/**
 * Reading the pipeline.
 *
 * <p>Open to everyone in the property's management, by the owner's decision
 * (2026-10-02). Each read costs the same number of queries for one lead or
 * fifty: the page, what stands under its leads in four more, then every name
 * and every linked record in one each.
 */
@Service
public class LeadQueryService {

    /** The most one page returns, whatever the client asks for. */
    static final int MAX_PAGE_SIZE = 50;

    /** The stages a lead in play can be at. An open record at Enquired is not a lead yet. */
    private static final List<LeadStage> IN_PLAY =
            List.of(LeadStage.EARLY_LEAD, LeadStage.ADVANCED_LEAD, LeadStage.BOOKED);

    private final LeadRepository leadRepository;
    private final LeadActivityRepository leadActivityRepository;
    private final LeadStandingReader standingReader;
    private final LeadFunnelReader funnelReader;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final EnquiryModule enquiryModule;
    private final Clock clock;

    public LeadQueryService(
            LeadRepository leadRepository,
            LeadActivityRepository leadActivityRepository,
            LeadStandingReader standingReader,
            LeadFunnelReader funnelReader,
            PropertyModule propertyModule,
            AuthModule authModule,
            EnquiryModule enquiryModule,
            Clock clock) {
        this.leadRepository = leadRepository;
        this.leadActivityRepository = leadActivityRepository;
        this.standingReader = standingReader;
        this.funnelReader = funnelReader;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.enquiryModule = enquiryModule;
        this.clock = clock;
    }

    /**
     * One page of a property's records.
     *
     * <p>Newest first. With {@code goingColdOnly} it is the leads going cold
     * instead, the one that runs out soonest first.
     *
     * @param kinds         the kinds wanted. Null or empty for every record
     * @param resumedOnly   only records whose person came back
     * @param goingColdOnly only leads in play that are going cold
     */
    @Transactional(readOnly = true)
    public PageResponse<LeadResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, Set<LeadKind> kinds, boolean resumedOnly, boolean goingColdOnly,
            int page, int size) {
        return pageForProperty(actorUserId, propertyId, kinds, resumedOnly, goingColdOnly, null, null, page, size);
    }

    /** As below, with no search. */
    @Transactional(readOnly = true)
    public PageResponse<LeadResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, Set<LeadKind> kinds, boolean resumedOnly, boolean goingColdOnly,
            LeadRepeatFlag repeat, int page, int size) {
        return pageForProperty(actorUserId, propertyId, kinds, resumedOnly, goingColdOnly, repeat, null, page, size);
    }

    /** As below, for one mark or none, and every handler. */
    @Transactional(readOnly = true)
    public PageResponse<LeadResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, Set<LeadKind> kinds, boolean resumedOnly, boolean goingColdOnly,
            LeadRepeatFlag repeat, String search, int page, int size) {
        return pageForProperty(actorUserId, propertyId, kinds, resumedOnly, goingColdOnly, false,
                repeat == null ? Set.of() : Set.of(repeat), search, page, size);
    }

    /**
     * One page of a property's records, as above.
     *
     * @param mineOnly only the records the reader handles (the Leads screen's filter, 2026-10-17)
     * @param repeats  only the duplicates, the potential spam, or both. Empty for every record
     * @param search   part of the person's name or of the short code (the
     *                 Leads screen's search, 2026-10-17). Null or blank for every record
     */
    @Transactional(readOnly = true)
    public PageResponse<LeadResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, Set<LeadKind> kinds, boolean resumedOnly, boolean goingColdOnly,
            boolean mineOnly, Set<LeadRepeatFlag> repeats, String search, int page, int size) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        Set<LeadKind> wanted = kinds == null || kinds.isEmpty() ? EnumSet.allOf(LeadKind.class) : kinds;
        int pageNumber = Math.max(page, 0);
        int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Instant now = clock.instant();
        String like = likeOf(search);
        UUID ownerUserId = propertyModule.getActiveProperty(propertyId).ownerId();
        Reader reader = new Reader(actorUserId, ownerUserId);

        Set<LeadRepeatFlag> marks = repeats == null ? Set.of() : repeats;
        if (goingColdOnly) {
            return coldPage(propertyId, wanted, resumedOnly, mineOnly, marks, like, reader, pageNumber, pageSize, now);
        }

        Page<Lead> found = leadRepository.pageByKinds(
                propertyId, wanted.stream().map(LeadKind::name).toList(), resumedOnly,
                // The marks' ranges meet (one or two, then three and up), so any set of them is one range.
                marks.stream().mapToInt(LeadRepeatFlag::fewest).min().orElse(0),
                marks.stream().mapToInt(LeadRepeatFlag::most).max().orElse(Integer.MAX_VALUE), like,
                mineOnly, actorUserId,
                PageRequest.of(pageNumber, pageSize, Sort.by(Sort.Direction.DESC, "createdAt", "id")));
        Map<UUID, LeadStanding> standing = standingReader.of(found.getContent());
        return new PageResponse<>(
                describe(found.getContent(), standing, reader, now),
                found.getNumber(),
                found.getSize(),
                found.getTotalElements(),
                found.getTotalPages(),
                found.hasNext(),
                found.hasPrevious());
    }

    /**
     * Going cold is a reading, not a column, so it cannot be asked of the
     * database. Every lead in play is read with what stands under it, and the
     * page is cut from the ones that are. A property's leads in play are tens,
     * not thousands: the leads that ended are never read here.
     */
    private PageResponse<LeadResponse> coldPage(
            UUID propertyId, Set<LeadKind> wanted, boolean resumedOnly, boolean mineOnly, Set<LeadRepeatFlag> marks,
            String like, Reader reader, int pageNumber, int pageSize, Instant now) {
        List<Lead> inPlay = leadRepository.findByPropertyIdAndStateAndStageIn(propertyId, LeadState.OPEN, IN_PLAY);
        Map<UUID, LeadStanding> standing = standingReader.of(inPlay);
        Map<UUID, LeadGoingColdResponse> coldOf = new HashMap<>();
        for (Lead lead : inPlay) {
            if (!wanted.contains(LeadKind.of(lead)) || (resumedOnly && !lead.isResumed())
                    || (!marks.isEmpty() && !marks.contains(lead.repeatFlag())) || !matches(lead, like)
                    || (mineOnly && !reader.userId().equals(lead.getHandlerUserId()))) {
                continue;
            }
            LeadGoingColdResponse cold =
                    LeadColdness.of(lead, standing.getOrDefault(lead.getId(), LeadStanding.NOTHING), now);
            if (cold != null) {
                coldOf.put(lead.getId(), cold);
            }
        }

        // What runs out soonest first. One with no end of its own waits on somebody, and has waited longest first.
        List<Lead> cold = inPlay.stream()
                .filter(lead -> coldOf.containsKey(lead.getId()))
                .sorted(Comparator
                        .comparing((Lead lead) -> coldOf.get(lead.getId()).by(),
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(lead -> coldOf.get(lead.getId()).since(),
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(Lead::getId))
                .toList();
        int from = Math.min(pageNumber * pageSize, cold.size());
        int to = Math.min(from + pageSize, cold.size());
        int totalPages = (int) Math.ceil(cold.size() / (double) pageSize);
        return new PageResponse<>(
                describe(cold.subList(from, to), standing, reader, now),
                pageNumber,
                pageSize,
                cold.size(),
                totalPages,
                to < cold.size(),
                pageNumber > 0);
    }

    /** The header's counts: one grouped query, and going cold worked out over the leads in play. */
    @Transactional(readOnly = true)
    public LeadCountsResponse countsForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        long[] ofKind = new long[LeadKind.values().length];
        long resumed = 0;
        long duplicates = 0;
        long potentialSpam = 0;
        for (KindCount count : leadRepository.countByKind(propertyId)) {
            LeadKind kind = LeadKind.valueOf(count.getKind());
            ofKind[kind.ordinal()] += count.getTotal();
            if (!kind.isInPlay()) {
                continue;
            }
            if (count.getResumed()) {
                resumed += count.getTotal();
            }
            if (LeadRepeatFlag.DUPLICATE.name().equals(count.getRepeatFlag())) {
                duplicates += count.getTotal();
            } else if (LeadRepeatFlag.POTENTIAL_SPAM.name().equals(count.getRepeatFlag())) {
                potentialSpam += count.getTotal();
            }
        }
        return new LeadCountsResponse(
                ofKind[LeadKind.ENQUIRY.ordinal()],
                ofKind[LeadKind.EARLY_LEAD.ordinal()],
                ofKind[LeadKind.ADVANCED_LEAD.ordinal()],
                ofKind[LeadKind.BOOKED.ordinal()],
                ofKind[LeadKind.CONVERTED.ordinal()],
                ofKind[LeadKind.DEAD.ordinal()],
                ofKind[LeadKind.LOST_ENQUIRY.ordinal()],
                duplicates,
                potentialSpam,
                resumed,
                goingCold(propertyId, clock.instant()));
    }

    /** One lead with its timeline, its visits and its bookings. */
    @Transactional(readOnly = true)
    public LeadDetailResponse detail(UUID actorUserId, UUID leadId) {
        Lead lead = leadRepository.findById(leadId)
                .orElseThrow(() -> new NotFoundException("Lead", leadId));
        propertyModule.ensureCanManageProperty(actorUserId, lead.getPropertyId());

        Instant now = clock.instant();
        Reader reader = new Reader(actorUserId, propertyModule.getActiveProperty(lead.getPropertyId()).ownerId());
        List<LeadActivity> timeline = leadActivityRepository.findByLeadIdOrderByOccurredAtDescCreatedAtDesc(leadId);
        Map<UUID, LeadStanding> standing = standingReader.of(List.of(lead));
        LeadStanding its = standing.getOrDefault(leadId, LeadStanding.NOTHING);

        Set<UUID> actorIds = new LinkedHashSet<>();
        for (LeadActivity activity : timeline) {
            if (activity.getActorUserId() != null) {
                actorIds.add(activity.getActorUserId());
            }
            if (activity.getSubjectUserId() != null) {
                actorIds.add(activity.getSubjectUserId());
            }
        }
        Map<UUID, UserSummaryResponse> actors = actorIds.isEmpty() ? Map.of() : authModule.findByIds(actorIds);

        return new LeadDetailResponse(
                describe(List.of(lead), standing, reader, now).get(0),
                timeline.stream()
                        .map(activity -> LeadActivityResponse.of(
                                activity,
                                nameOf(actors, activity.getActorUserId()),
                                nameOf(actors, activity.getSubjectUserId())))
                        .toList(),
                its.enquiries().stream().map(EnquirySnapshot::id).toList(),
                enquiryModule.summariesOf(its.enquiries().stream().map(EnquirySnapshot::id).toList()).stream()
                        .map(LeadEnquiryRef::of)
                        .toList(),
                its.visits().stream().map(LeadVisitRef::of).toList(),
                its.bookings().stream().map(LeadBookingRef::of).toList(),
                leadRepository.findFirstByResumedFromLeadIdOrderByCreatedAtAsc(leadId)
                        .map(LeadLinkRef::of)
                        .orElse(null));
    }

    /**
     * The property's pipeline for one month, in IST.
     *
     * @param month null for the month it is now
     */
    @Transactional(readOnly = true)
    public LeadFunnelResponse funnel(UUID actorUserId, UUID propertyId, YearMonth month) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        Instant now = clock.instant();
        YearMonth asked = month != null ? month : YearMonth.from(now.atZone(LeadVisitService.IST));
        Instant since = asked.atDay(1).atStartOfDay(LeadVisitService.IST).toInstant();
        Instant until = asked.plusMonths(1).atDay(1).atStartOfDay(LeadVisitService.IST).toInstant();
        return funnelBetween(propertyId, since, until, asked.toString(), now);
    }

    /**
     * The same pipeline for any stretch of time (2026-10-18), for the Leads
     * insights screen's periods. The caller has already checked access.
     *
     * @param label what the response calls the period
     */
    @Transactional(readOnly = true)
    public LeadFunnelResponse funnelBetween(UUID propertyId, Instant since, Instant until, String label, Instant now) {
        Map<LeadActivityType, Long> steps = funnelReader.steps(propertyId, since, until);
        LeadFunnelReader.Returns returns = funnelReader.returns(propertyId, since, until);
        LeadFunnelReader.Endings endings = funnelReader.endings(propertyId, since, until);
        return new LeadFunnelResponse(
                label,
                // A second enquiry that joined an open record is an enquiry raised all the same.
                count(steps, LeadActivityType.ENQUIRY_RAISED) + count(steps, LeadActivityType.ENQUIRY_JOINED),
                returns.answered(),
                returns.medianSeconds(),
                returns.p90Seconds(),
                count(steps, LeadActivityType.VISIT_SCHEDULED),
                count(steps, LeadActivityType.VISIT_ATTENDED),
                count(steps, LeadActivityType.VISIT_MISSED),
                count(steps, LeadActivityType.BOOKING_REQUESTED),
                count(steps, LeadActivityType.BOOKING_CONFIRMED),
                count(steps, LeadActivityType.MOVED_IN),
                endings.deadLeads(),
                endings.lostEnquiries(),
                returns.resumed(),
                returns.resumedConverted(),
                goingCold(propertyId, now));
    }

    private static long count(Map<LeadActivityType, Long> steps, LeadActivityType type) {
        return steps.getOrDefault(type, 0L);
    }

    /** How many of the property's leads in play are going cold at this moment. */
    private long goingCold(UUID propertyId, Instant now) {
        List<Lead> inPlay = leadRepository.findByPropertyIdAndStateAndStageIn(propertyId, LeadState.OPEN, IN_PLAY);
        Map<UUID, LeadStanding> standing = standingReader.of(inPlay);
        return inPlay.stream()
                .filter(lead -> LeadColdness.of(
                        lead, standing.getOrDefault(lead.getId(), LeadStanding.NOTHING), now) != null)
                .count();
    }

    /** Who is reading, for what they may do from a card. */
    private record Reader(UUID userId, UUID ownerUserId) {
    }

    /** A lower-case LIKE pattern for a search, or empty for none. */
    private static String likeOf(String search) {
        if (search == null || search.isBlank()) {
            return "";
        }
        String bare = search.strip().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "").strip();
        return bare.isEmpty() ? "" : "%" + bare + "%";
    }

    /** The same test as the list's query, for the cold list worked out in memory. */
    private static boolean matches(Lead lead, String like) {
        if (like.isEmpty()) {
            return true;
        }
        String bare = like.substring(1, like.length() - 1);
        return (lead.getProspectName() != null && lead.getProspectName().toLowerCase(Locale.ROOT).contains(bare))
                || lead.getReferenceCode().toLowerCase(Locale.ROOT).contains(bare);
    }

    /** These leads as management reads them, with every name and linked record read once for all of them. */
    private List<LeadResponse> describe(
            Collection<Lead> leads, Map<UUID, LeadStanding> standing, Reader reader, Instant now) {
        Set<UUID> userIds = new LinkedHashSet<>();
        Set<UUID> linkedIds = new LinkedHashSet<>();
        for (Lead lead : leads) {
            if (lead.getProspectUserId() != null) {
                userIds.add(lead.getProspectUserId());
            }
            if (lead.getHandlerUserId() != null) {
                userIds.add(lead.getHandlerUserId());
            }
            if (lead.getResumedFromLeadId() != null) {
                linkedIds.add(lead.getResumedFromLeadId());
            }
            if (lead.getDuplicateOfLeadId() != null) {
                linkedIds.add(lead.getDuplicateOfLeadId());
            }
        }
        Map<UUID, UserSummaryResponse> users = userIds.isEmpty() ? Map.of() : authModule.findByIds(userIds);
        Map<UUID, Lead> linked = new HashMap<>();
        if (!linkedIds.isEmpty()) {
            leadRepository.findAllById(linkedIds).forEach(other -> linked.put(other.getId(), other));
        }

        List<LeadResponse> described = new ArrayList<>(leads.size());
        for (Lead lead : leads) {
            LeadStanding its = standing.getOrDefault(lead.getId(), LeadStanding.NOTHING);
            Visit visit = its.latestVisit();
            BookingSnapshot booking = its.currentBooking();
            EnquirySnapshot followUp = lead.isOpen() ? followUpOf(its, now) : null;
            described.add(LeadResponse.of(
                    lead,
                    // Someone recorded outside the app has no account: the name kept on the record (2026-10-19).
                    lead.getProspectUserId() == null ? lead.getProspectName() : nameOf(users, lead.getProspectUserId()),
                    nameOf(users, lead.getHandlerUserId()),
                    LeadLinkRef.of(linked.get(lead.getResumedFromLeadId())),
                    LeadRepeatResponse.of(lead, linked.get(lead.getDuplicateOfLeadId())),
                    LeadColdness.of(lead, its, now),
                    visit == null ? null : LeadVisitRef.of(visit),
                    booking == null ? null : LeadBookingRef.of(booking),
                    bookingWindowEndsAt(its, now),
                    followUp == null ? null : followUp.id(),
                    followUp != null && mayFollowUp(followUp, reader)));
        }
        return described;
    }

    /** When the days to ask for a booking after the attended visit run out, while they are open. */
    private static Instant bookingWindowEndsAt(LeadStanding standing, Instant now) {
        return standing.enquiries().stream()
                .filter(enquiry -> enquiry.bookingWindowOpen(now))
                .map(EnquirySnapshot::expiresAt)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    /** The latest of the lead's enquiries that is not over: what Follow up opens. */
    private static EnquirySnapshot followUpOf(LeadStanding standing, Instant now) {
        return standing.enquiries().stream()
                .filter(enquiry -> !enquiry.isOver(now))
                .max(Comparator.comparing(EnquirySnapshot::raisedAt, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
    }

    /**
     * The owner, the enquiry's handler, or anyone while it has none: who may
     * respond to an enquiry. Responding still checks it, with the handler mode.
     */
    private static boolean mayFollowUp(EnquirySnapshot enquiry, Reader reader) {
        return reader.userId().equals(reader.ownerUserId())
                || enquiry.handlerUserId() == null
                || reader.userId().equals(enquiry.handlerUserId());
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> users, UUID userId) {
        if (userId == null) {
            return null;
        }
        return Optional.ofNullable(users.get(userId)).map(UserSummaryResponse::fullName).orElse(null);
    }
}
