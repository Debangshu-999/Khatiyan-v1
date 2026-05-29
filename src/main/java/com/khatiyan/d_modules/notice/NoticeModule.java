package com.khatiyan.d_modules.notice;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.notice.api.dto.CreateNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.NoticeResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdateNoticeRequest;
import com.khatiyan.d_modules.notice.service.NoticeService;

/**
 * Public facade for the notice module.
 *
 * <p>Other modules should depend on this facade instead of importing notice
 * services, repositories, or entities directly. The facade exposes stable
 * notice operations while the module internals remain free to evolve.
 */
@Component
public class NoticeModule {

    private final NoticeService noticeService;

    public NoticeModule(NoticeService noticeService) {
        this.noticeService = noticeService;
    }

    public NoticeResponse publishNotice(UUID actorUserId, UUID propertyId, CreateNoticeRequest request) {
        return noticeService.publishNotice(actorUserId, propertyId, request);
    }

    public List<NoticeResponse> listPublishedNotices(UUID actorUserId, UUID propertyId) {
        return noticeService.listPublishedNotices(actorUserId, propertyId);
    }

    public List<NoticeResponse> listVisibleNoticesForProperty(UUID actorUserId, UUID propertyId) {
        return noticeService.listVisibleNoticesForProperty(actorUserId, propertyId);
    }

    public List<NoticeResponse> listVisibleNoticesForTenant(UUID tenantUserId) {
        return noticeService.listVisibleNoticesForTenant(tenantUserId);
    }

    public List<NoticeResponse> listArchivedNotices(UUID actorUserId, UUID propertyId) {
        return noticeService.listArchivedNotices(actorUserId, propertyId);
    }

    public NoticeResponse updateNotice(UUID actorUserId, UUID noticeId, UpdateNoticeRequest request) {
        return noticeService.updateNotice(actorUserId, noticeId, request);
    }

    public void archiveNotice(UUID actorUserId, UUID noticeId) {
        noticeService.archiveNotice(actorUserId, noticeId);
    }

    public void deleteNotice(UUID actorUserId, UUID noticeId) {
        noticeService.deleteNotice(actorUserId, noticeId);
    }

    public int archiveExpiredNotices() {
        return noticeService.archiveExpiredNotices();
    }
}
