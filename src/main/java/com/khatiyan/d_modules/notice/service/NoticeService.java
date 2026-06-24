package com.khatiyan.d_modules.notice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.notice.api.dto.CreateNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.NoticeResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdateNoticeRequest;
import com.khatiyan.d_modules.notice.event.NoticePublishedEvent;
import com.khatiyan.d_modules.notice.model.Notice;
import com.khatiyan.d_modules.notice.repository.NoticeRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for time-bound property notices.
 *
 * <p>Notices are free-form announcements that can be published, edited while
 * published, viewed by active tenants, and archived manually or by a scheduled
 * expiry job.
 */
@Slf4j
@Service
public class NoticeService {

    private final NoticeRepository noticeRepository;
    private final PropertyModule propertyModule;
    private final TenancyModule tenancyModule;
    private final ApplicationEventPublisher eventPublisher;

    public NoticeService(
            NoticeRepository noticeRepository,
            PropertyModule propertyModule,
            TenancyModule tenancyModule,
            ApplicationEventPublisher eventPublisher) {
        this.noticeRepository = noticeRepository;
        this.propertyModule = propertyModule;
        this.tenancyModule = tenancyModule;
        this.eventPublisher = eventPublisher;
    }

    // Admin side notice actions

    /**
     * Publishes a notice for a property managed by the current actor.
     */
    @Transactional
    public NoticeResponse publishNotice(
            UUID actorUserId,
            UUID propertyId,
            CreateNoticeRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        Instant now = Instant.now();
        Instant visibleFrom = defaultVisibleFrom(request.visibleFrom(), now);
        validateVisibleWindow(visibleFrom, request.visibleUntil());

        Notice notice = Notice.publish(
                propertyId,
                actorUserId,
                request.title().trim(),
                request.body().trim(),
                request.priority(),
                visibleFrom,
                request.visibleUntil(),
                now);

        Notice savedNotice = noticeRepository.save(notice);

        log.info(
                "Notice published noticeId={} propertyId={} actorUserId={} priority={}",
                savedNotice.getId(),
                propertyId,
                actorUserId,
                savedNotice.getPriority());

        if (!savedNotice.getVisibleFrom().isAfter(now)) {
            eventPublisher.publishEvent(new NoticePublishedEvent(
                    savedNotice.getId(),
                    savedNotice.getPropertyId(),
                    savedNotice.getTitle()));
        }

        return NoticeResponse.from(savedNotice);
    }

    /**
     * Lists all currently published notices for management, including future
     * visible windows.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listPublishedNotices(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return noticeRepository.findPublishedManualByPropertyId(propertyId)
                .stream()
                .map(notice -> NoticeResponse.from(notice))
                .toList();
    }

    /**
     * Lists notices visible right now for a managed property.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listVisibleNoticesForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return noticeRepository.findVisibleManualByPropertyId(propertyId, Instant.now())
                .stream()
                .map(notice -> NoticeResponse.from(notice))
                .toList();
    }

    /**
     * Lists archived notices for a property history view.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listArchivedNotices(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return noticeRepository.findArchivedManualByPropertyId(propertyId)
                .stream()
                .map(notice -> NoticeResponse.from(notice))
                .toList();
    }

    /**
     * Updates a notice that is still published.
     */
    @Transactional
    public NoticeResponse updateNotice(
            UUID actorUserId,
            UUID noticeId,
            UpdateNoticeRequest request) {
        Notice notice = getNotice(noticeId);
        propertyModule.ensureCanManageProperty(actorUserId, notice.getPropertyId());

        Instant visibleFrom = defaultVisibleFrom(request.visibleFrom(), notice.getVisibleFrom());
        validateVisibleWindow(visibleFrom, request.visibleUntil());

        notice.updateDetails(
                request.title().trim(),
                request.body().trim(),
                request.priority(),
                visibleFrom,
                request.visibleUntil());

        log.info(
                "Notice updated noticeId={} propertyId={} actorUserId={}",
                noticeId,
                notice.getPropertyId(),
                actorUserId);

        return NoticeResponse.from(notice);
    }

    /**
     * Archives one notice manually.
     */
    @Transactional
    public void archiveNotice(UUID actorUserId, UUID noticeId) {
        Notice notice = getNotice(noticeId);
        propertyModule.ensureCanManageProperty(actorUserId, notice.getPropertyId());

        Instant now = Instant.now();

        if (!notice.isExpiredAt(now)) {
            throw new ValidationException("Notice cannot be archived before its visibleUntil time");
        }

        notice.archive(now);

        log.info(
                "Notice archived noticeId={} propertyId={} actorUserId={}",
                noticeId,
                notice.getPropertyId(),
                actorUserId);
    }

    /**
     * Soft-deletes one notice so it stays in the database but disappears from
     * published, visible, and archived views.
     */
    @Transactional
    public void deleteNotice(UUID actorUserId, UUID noticeId) {
        Notice notice = getNotice(noticeId);
        propertyModule.ensureCanManageProperty(actorUserId, notice.getPropertyId());

        notice.softDelete();

        log.info(
                "Notice soft-deleted noticeId={} propertyId={} actorUserId={}",
                noticeId,
                notice.getPropertyId(),
                actorUserId);
    }
    //----------------------------------------------------------------------------------------------------------------------------------------------

    // Tenant side notice actions

    /**
     * Lists notices visible right now for the tenant's active property.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listVisibleNoticesForTenant(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new ValidationException("Tenant has no active tenancy"));

        return noticeRepository.findVisibleByPropertyId(tenancy.propertyId(), Instant.now())
                .stream()
                .map(notice -> NoticeResponse.from(notice))
                .toList();
    }
    //------------------------------------------------------------------------------------------------------------------------------------------

    // System maintenance actions
    /**
     * Archives expired published notices; intended to be called by a scheduled job.
     */
    @Transactional
    public int archiveExpiredNotices() {
        Instant now = Instant.now();
        List<Notice> expiredNotices = noticeRepository.findExpiredPublishedNotices(now);

        expiredNotices.forEach(notice -> notice.archive(now));

        if (!expiredNotices.isEmpty()) {
            log.info("Expired notices archived count={}", expiredNotices.size());
        }

        return expiredNotices.size();
    }

    private Notice getNotice(UUID noticeId) {
        return noticeRepository.findNoticeById(noticeId)
                .orElseThrow(() -> new NotFoundException("Notice_", noticeId));
    }

    private Instant defaultVisibleFrom(Instant requestedVisibleFrom, Instant now) {
        if (requestedVisibleFrom == null) {
            return now;
        }

        return requestedVisibleFrom;
    }

    private void validateVisibleWindow(Instant visibleFrom, Instant visibleUntil) {
        if (visibleUntil != null && visibleUntil.isBefore(visibleFrom)) {
            throw new ValidationException("Notice visibleUntil cannot be before visibleFrom");
        }
    }
}
