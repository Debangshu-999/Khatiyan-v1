package com.khatiyan.d_modules.notice.model;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
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

    /**
     * Set only on rows the scheduler materialised from a recurring template.
     * Null means an ordinary one-off notice — which is exactly how owner-facing
     * notice lists tell the two apart.
     */
    @Column(name = "generated_from_recurring_notice_id")
    private UUID generatedFromRecurringNoticeId;

    /** The day this occurrence belongs to, in the generation zone (IST). */
    @Column(name = "occurrence_date")
    private LocalDate occurrenceDate;

    private Notice(
            UUID propertyId,
            UUID createdByUserId,
            String title,
            String body,
            NoticePriority priority,
            Instant visibleFrom,
            Instant visibleUntil,
            Instant publishedAt,
            UUID generatedFromRecurringNoticeId,
            LocalDate occurrenceDate) {
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
        this.generatedFromRecurringNoticeId = generatedFromRecurringNoticeId;
        this.occurrenceDate = occurrenceDate;
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
                now,
                null,
                null);
    }

    /**
     * Materialises one day's notice from a recurring template. Each day gets its
     * own row, so an owner editing today's occurrence — retitling it, attaching
     * today's menu — leaves tomorrow's untouched.
     */
    public static Notice publishOccurrence(
            UUID recurringNoticeId,
            LocalDate occurrenceDate,
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
                now,
                recurringNoticeId,
                occurrenceDate);
    }

    public boolean isRecurringOccurrence() {
        return generatedFromRecurringNoticeId != null;
    }

    /**
     * Postpones a notice that has not gone live yet, sliding the end of its
     * window by the same amount so the notice stays visible for as long as it
     * was originally meant to. A notice with no end keeps having none.
     */
    public void delayTo(Instant newVisibleFrom) {
        ensureEditable();

        if (visibleUntil != null) {
            Duration originalWindow = Duration.between(visibleFrom, visibleUntil);
            this.visibleUntil = newVisibleFrom.plus(originalWindow);
        }

        this.visibleFrom = newVisibleFrom;
    }

    public void updateDetails(
            String title,
            String body,
            NoticePriority priority,
            Instant visibleFrom,
            Instant visibleUntil) {
        ensureEditable();
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

    /**
     * Guards every change to a notice, including the things hanging off it.
     *
     * <p>Public because attachments are a separate entity with their own
     * service, so it could add and remove files on an archived notice without
     * this class ever being asked. The text fields were protected and the
     * attachments were not, which meant an archived notice could still be
     * edited — just not through the fields anyone was watching.
     *
     * <p>Archived is called out by name. "Only published notices can be
     * updated" leaves the reader working out which of the two non-published
     * states theirs is in, and why.
     */
    public void ensureEditable() {
        if (status == NoticeStatus.ARCHIVED) {
            throw new ValidationException("Archived notices cannot be edited");
        }
        if (status != NoticeStatus.PUBLISHED) {
            throw new ValidationException("Only published notices can be updated");
        }
    }

    /** True once the notice's window has opened and tenants can see it. */
    public boolean isLiveAt(Instant now) {
        return !visibleFrom.isAfter(now);
    }

    /**
     * The full rule for changing or removing a notice: it must still be
     * published, and it must not have gone live yet.
     *
     * <p>Going live is the point of no return. Tenants have seen it, and may
     * have acted on it, so rewriting or deleting it afterwards would rewrite
     * what they were told. Retiring it is what archiving is for.
     *
     * <p>This lives on the entity because four different callers need the same
     * answer — the text fields, the delay, the delete, and the attachments —
     * and each one that reimplemented it got a slightly different rule. The
     * attachment paths had no rule at all, which is how files could be pulled
     * off a notice whose title could not be changed.
     */
    public void ensureEditableAt(Instant now) {
        ensureEditable();

        if (isLiveAt(now)) {
            throw new ValidationException("This notice is already live and can no longer be edited");
        }
    }

    private void ensureNotDeleted() {
        if (status == NoticeStatus.DELETED) {
            throw new ValidationException("Deleted notices cannot be archived");
        }
    }
}
