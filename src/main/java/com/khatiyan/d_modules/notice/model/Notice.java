package com.khatiyan.d_modules.notice.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Time-based communication published for a property.
 *
 * <p>Notices are free-form property announcements such as lost-and-found
 * messages, rent reminders, fire-drill reminders, gas shortages, or emergency
 * alerts. Priority drives prominence; fixed notice types are intentionally
 * avoided.
 */
@Entity
@Table(name = "notices", schema = "notice")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notice extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 2000)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NoticePriority priority;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NoticeStatus status;

    @Column(name = "visible_from", nullable = false)
    private Instant visibleFrom;

    @Column(name = "visible_until")
    private Instant visibleUntil;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    @Column(name = "archived_at")
    private Instant archivedAt;

    private Notice(
            UUID propertyId,
            UUID createdByUserId,
            String title,
            String body,
            NoticePriority priority,
            Instant visibleFrom,
            Instant visibleUntil,
            Instant publishedAt) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.createdByUserId = createdByUserId;
        this.title = title;
        this.body = body;
        this.priority = priority;
        this.status = NoticeStatus.PUBLISHED;
        this.visibleFrom = visibleFrom;
        this.visibleUntil = visibleUntil;
        this.publishedAt = publishedAt;
    }

    public static Notice publish(
            UUID propertyId,
            UUID createdByUserId,
            String title,
            String body,
            NoticePriority priority,
            Instant visibleFrom,
            Instant visibleUntil,
            Instant now) {
        return new Notice(
                propertyId,
                createdByUserId,
                title,
                body,
                priority,
                visibleFrom,
                visibleUntil,
                now);
    }

    public void updateDetails(
            String title,
            String body,
            NoticePriority priority,
            Instant visibleFrom,
            Instant visibleUntil) {
        ensurePublished();
        this.title = title;
        this.body = body;
        this.priority = priority;
        this.visibleFrom = visibleFrom;
        this.visibleUntil = visibleUntil;
    }

    public void archive(Instant archivedAt) {
        if (status == NoticeStatus.ARCHIVED) {
            return;
        }

        ensureNotDeleted();
        this.status = NoticeStatus.ARCHIVED;
        this.archivedAt = archivedAt;
    }

    public void softDelete() {
        if (status == NoticeStatus.DELETED) {
            return;
        }

        this.status = NoticeStatus.DELETED;
    }

    public boolean isPublished() {
        return status == NoticeStatus.PUBLISHED;
    }

    public boolean isExpiredAt(Instant now) {
        return visibleUntil != null && visibleUntil.isBefore(now);
    }

    private void ensurePublished() {
        if (status != NoticeStatus.PUBLISHED) {
            throw new ValidationException("Only published notices can be updated");
        }
    }

    private void ensureNotDeleted() {
        if (status == NoticeStatus.DELETED) {
            throw new ValidationException("Deleted notices cannot be archived");
        }
    }
}
