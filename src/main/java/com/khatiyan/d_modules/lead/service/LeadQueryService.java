package com.khatiyan.d_modules.lead.service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.lead.api.dto.LeadActivityResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadCountsResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadDetailResponse;
import com.khatiyan.d_modules.lead.api.dto.LeadResponse;
import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadActivity;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;
import com.khatiyan.d_modules.lead.repository.LeadActivityRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository.StageCount;
import com.khatiyan.d_modules.property.PropertyModule;

/**
 * Reading the pipeline.
 *
 * <p>Open to everyone in the property's management, by the owner's decision
 * (2026-10-02). Each read costs the same number of queries for one lead or
 * fifty: the page, then every name on it in one more.
 */
@Service
public class LeadQueryService {

    /** The most one page returns, whatever the client asks for. */
    static final int MAX_PAGE_SIZE = 50;

    private final LeadRepository leadRepository;
    private final LeadActivityRepository leadActivityRepository;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;

    public LeadQueryService(
            LeadRepository leadRepository,
            LeadActivityRepository leadActivityRepository,
            PropertyModule propertyModule,
            AuthModule authModule) {
        this.leadRepository = leadRepository;
        this.leadActivityRepository = leadActivityRepository;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
    }

    /**
     * One page of a property's leads, newest first.
     *
     * @param state null for both open and closed
     * @param stage null for every stage
     */
    @Transactional(readOnly = true)
    public PageResponse<LeadResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, LeadState state, LeadStage stage, int page, int size) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        Pageable pageable = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Lead> found;
        if (state != null && stage != null) {
            found = leadRepository.findByPropertyIdAndStateAndStage(propertyId, state, stage, pageable);
        } else if (state != null) {
            found = leadRepository.findByPropertyIdAndState(propertyId, state, pageable);
        } else if (stage != null) {
            found = leadRepository.findByPropertyIdAndStage(propertyId, stage, pageable);
        } else {
            found = leadRepository.findByPropertyId(propertyId, pageable);
        }

        Set<UUID> userIds = new LinkedHashSet<>();
        for (Lead lead : found.getContent()) {
            userIds.add(lead.getProspectUserId());
            if (lead.getHandlerUserId() != null) {
                userIds.add(lead.getHandlerUserId());
            }
        }
        Map<UUID, UserSummaryResponse> users = userIds.isEmpty() ? Map.of() : authModule.findByIds(userIds);

        return new PageResponse<>(
                found.getContent().stream()
                        .map(lead -> LeadResponse.of(
                                lead, nameOf(users, lead.getProspectUserId()), nameOf(users, lead.getHandlerUserId())))
                        .toList(),
                found.getNumber(),
                found.getSize(),
                found.getTotalElements(),
                found.getTotalPages(),
                found.hasNext(),
                found.hasPrevious());
    }

    /** The header's counts, from one grouped query. */
    @Transactional(readOnly = true)
    public LeadCountsResponse countsForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        long enquired = 0;
        long earlyLead = 0;
        long advancedLead = 0;
        long booked = 0;
        long movedIn = 0;
        long closed = 0;
        for (StageCount count : leadRepository.countByStageAndState(propertyId)) {
            if (count.getStage() == LeadStage.MOVED_IN) {
                movedIn += count.getTotal();
            } else if (count.getState() == LeadState.CLOSED) {
                closed += count.getTotal();
            } else {
                switch (count.getStage()) {
                    case ENQUIRED -> enquired += count.getTotal();
                    case EARLY_LEAD -> earlyLead += count.getTotal();
                    case ADVANCED_LEAD -> advancedLead += count.getTotal();
                    case BOOKED -> booked += count.getTotal();
                    case MOVED_IN -> movedIn += count.getTotal();
                }
            }
        }
        return new LeadCountsResponse(enquired, earlyLead, advancedLead, booked, movedIn, closed);
    }

    /** One lead with its timeline. */
    @Transactional(readOnly = true)
    public LeadDetailResponse detail(UUID actorUserId, UUID leadId) {
        Lead lead = leadRepository.findById(leadId)
                .orElseThrow(() -> new NotFoundException("Lead", leadId));
        propertyModule.ensureCanManageProperty(actorUserId, lead.getPropertyId());

        List<LeadActivity> timeline = leadActivityRepository.findByLeadIdOrderByOccurredAtDescCreatedAtDesc(leadId);

        Set<UUID> userIds = new LinkedHashSet<>();
        userIds.add(lead.getProspectUserId());
        if (lead.getHandlerUserId() != null) {
            userIds.add(lead.getHandlerUserId());
        }
        for (LeadActivity activity : timeline) {
            if (activity.getActorUserId() != null) {
                userIds.add(activity.getActorUserId());
            }
            if (activity.getSubjectUserId() != null) {
                userIds.add(activity.getSubjectUserId());
            }
        }
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(userIds);

        return new LeadDetailResponse(
                LeadResponse.of(lead, nameOf(users, lead.getProspectUserId()), nameOf(users, lead.getHandlerUserId())),
                timeline.stream()
                        .map(activity -> LeadActivityResponse.of(
                                activity,
                                nameOf(users, activity.getActorUserId()),
                                nameOf(users, activity.getSubjectUserId())))
                        .toList());
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> users, UUID userId) {
        if (userId == null) {
            return null;
        }
        return Optional.ofNullable(users.get(userId)).map(UserSummaryResponse::fullName).orElse(null);
    }
}
