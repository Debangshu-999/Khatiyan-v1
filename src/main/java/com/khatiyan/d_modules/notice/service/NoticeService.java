package com.khatiyan.d_modules.notice.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.notice.api.dto.CreateNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.NoticeAttachmentResponse;
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

    /** How far ahead the upcoming-notices window looks. */
    private static final Duration UPCOMING_HORIZON = Duration.ofHours(3);

    private final NoticeRepository noticeRepository;
    private final PropertyModule propertyModule;
    private final NoticeAccessPolicy noticeAccessPolicy;
    private final NoticeAttachmentService noticeAttachmentService;
    private final TenancyModule tenancyModule;
    private final ApplicationEventPublisher eventPublisher;

    public NoticeService(
            NoticeRepository noticeRepository,
            PropertyModule propertyModule,
            NoticeAccessPolicy noticeAccessPolicy,
            NoticeAttachmentService noticeAttachmentService,
            TenancyModule tenancyModule,
            ApplicationEventPublisher eventPublisher) {
        this.noticeRepository = noticeRepository;
        this.propertyModule = propertyModule;
        this.noticeAccessPolicy = noticeAccessPolicy;
        this.noticeAttachmentService = noticeAttachmentService;
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
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, propertyId);

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

        noticeAttachmentService.attachOnPublish(savedNotice.getId(), request.attachments());

        return NoticeResponse.from(savedNotice, noticeAttachmentService.attachmentsFor(savedNotice.getId()));
    }

    /**
     * Lists all currently published notices for management, including future
     * visible windows.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listPublishedNotices(UUID actorUserId, UUID propertyId) {
        noticeAccessPolicy.ensureCanViewNotices(actorUserId, propertyId);

        List<Notice> notices = noticeRepository.findPublishedManualByPropertyId(propertyId)
                .stream()
                .toList();
        return withAttachments(notices);
    }

    /**
     * Lists notices visible right now for a managed property.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listVisibleNoticesForProperty(UUID actorUserId, UUID propertyId) {
        noticeAccessPolicy.ensureCanViewNotices(actorUserId, propertyId);

        // Everything a tenant can see right now, recurring occurrences included
        // — the same query the tenant view uses. This used to exclude generated
        // rows, so the one notice actually on tenants' screens was the one the
        // owner could not find: today's occurrence was missing from "Visible"
        // while the Recurring tab showed only the template behind it.
        //
        // Bounded by the visible window, so a template contributes at most its
        // current day here rather than a row per day.
        List<Notice> notices = noticeRepository.findVisibleByPropertyId(propertyId, Instant.now())
                .stream()
                .toList();
        return withAttachments(notices);
    }

    /**
     * Lists archived notices for a property history view.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listArchivedNotices(UUID actorUserId, UUID propertyId) {
        noticeAccessPolicy.ensureCanViewNotices(actorUserId, propertyId);

        List<Notice> notices = noticeRepository.findArchivedManualByPropertyId(propertyId)
                .stream()
                .toList();
        return withAttachments(notices);
    }

    /**
     * One notice, for its detail screen. Separate from the list endpoints so the
     * screen can be opened directly and refreshed on its own rather than relying
     * on whichever list happened to load it.
     */
    @Transactional(readOnly = true)
    public NoticeResponse getNoticeDetail(UUID actorUserId, UUID noticeId) {
        Notice notice = getNotice(noticeId);
        noticeAccessPolicy.ensureCanViewNotices(actorUserId, notice.getPropertyId());

        return NoticeResponse.from(notice, noticeAttachmentService.attachmentsFor(noticeId));
    }

    /**
     * Notices going live within the next few hours — one-off notices scheduled
     * ahead and today's recurring occurrences together. Owners get a window in
     * which a notice can still be corrected or postponed before any tenant sees
     * it; recurring occurrences are included because each day now has its own
     * row, so editing one changes that day alone.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listUpcomingNotices(UUID actorUserId, UUID propertyId) {
        noticeAccessPolicy.ensureCanViewNotices(actorUserId, propertyId);

        Instant now = Instant.now();

        List<Notice> notices = noticeRepository
                .findUpcomingByPropertyId(propertyId, now, now.plus(UPCOMING_HORIZON))
                .stream()
                .toList();
        return withAttachments(notices);
    }

    /**
     * Postpones a notice that has not gone live yet. The window slides whole —
     * a lunch notice moved from 2pm to 3pm runs 3–4pm, not 3pm to the original
     * 3pm end. For a recurring occurrence this affects that day only; tomorrow
     * regenerates from the template at its usual time.
     */
    @Transactional
    public NoticeResponse delayNotice(UUID actorUserId, UUID noticeId, Instant visibleFrom) {
        Notice notice = getNotice(noticeId);
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, notice.getPropertyId());

        Instant now = Instant.now();

        if (!notice.getVisibleFrom().isAfter(now)) {
            throw new ValidationException("This notice is already live and cannot be delayed");
        }
        if (!visibleFrom.isAfter(now)) {
            throw new ValidationException("Pick a time in the future");
        }
        if (visibleFrom.isBefore(notice.getVisibleFrom())) {
            throw new ValidationException("A notice can be postponed, not brought forward");
        }

        notice.delayTo(visibleFrom);

        log.info(
                "Notice delayed noticeId={} propertyId={} visibleFrom={} actorUserId={}",
                noticeId,
                notice.getPropertyId(),
                visibleFrom,
                actorUserId);

        return NoticeResponse.from(notice);
    }

    /**
     * Updates a notice that has not gone live yet.
     *
     * <p>Once a notice is visible its text stops being ours to rewrite: tenants
     * have read it, and a silent edit would leave two people looking at the same
     * notice remembering different things. The window before go-live is the
     * whole editing window, and the same rule already governs which recurring
     * occurrence a template edit reaches.
     */
    @Transactional
    public NoticeResponse updateNotice(
            UUID actorUserId,
            UUID noticeId,
            UpdateNoticeRequest request) {
        Notice notice = getNotice(noticeId);
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, notice.getPropertyId());

        notice.ensureEditableAt(Instant.now());

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
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, notice.getPropertyId());

        Instant now = Instant.now();

        // Live is the precondition, not expired. Archiving is how a notice
        // that is already on tenants' screens gets retired early — the only
        // exit it has, now that editing and deleting close the moment it goes
        // live. Requiring expiry left a notice with no end date unarchivable
        // for ever, and made the button redundant with the scheduler for the
        // ones that did expire.
        if (!notice.isLiveAt(now)) {
            throw new ValidationException(
                    "A notice that has not gone live yet cannot be archived. Delete it instead.");
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
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, notice.getPropertyId());
        // Same window as editing, and for the same reason: once tenants have
        // seen a notice, removing it rewrites what they were told. This had no
        // guard at all, so an archived notice could be deleted outright.
        notice.ensureEditableAt(Instant.now());

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

        List<Notice> notices = noticeRepository.findVisibleByPropertyId(tenancy.propertyId(), Instant.now())
                .stream()
                .toList();
        return withAttachments(notices);
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

    /**
     * Attaches each notice's files, in one query for the whole list.
     *
     * <p>Cards show an attachment count, so a list that returned none always
     * read "No attachments". Fetching per notice would be an N+1 across the
     * page, which is what the batched lookup exists for.
     */
    private List<NoticeResponse> withAttachments(List<Notice> notices) {
        if (notices.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<NoticeAttachmentResponse>> byNotice = noticeAttachmentService.attachmentsFor(
                notices.stream().map(Notice::getId).toList());
        return notices.stream()
                .map(notice -> NoticeResponse.from(notice, byNotice.getOrDefault(notice.getId(), List.of())))
                .toList();
    }

    private Notice getNotice(UUID noticeId) {
        return noticeRepository.findNoticeById(noticeId)
                .orElseThrow(() -> new NotFoundException("Notice", noticeId));
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
