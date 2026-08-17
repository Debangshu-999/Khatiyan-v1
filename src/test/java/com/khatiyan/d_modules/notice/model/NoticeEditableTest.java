package com.khatiyan.d_modules.notice.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * An archived notice is history, and history does not change.
 *
 * <p>The guard is exercised here rather than only through the fields because
 * attachments live in their own entity and their own service: that path checked
 * whether the actor could manage notices on the property, never whether this
 * notice was still open, so files could be added to and removed from an
 * archived notice while the very same screen refused to save its title. These
 * tests exist so that asymmetry cannot come back.
 */
class NoticeEditableTest {

    private static final Instant PUBLISHED_AT = Instant.parse("2026-08-01T00:00:00Z");

    private static Notice publishedNotice() {
        return Notice.publish(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Water supply",
                "Tanker arrives Friday.",
                NoticePriority.NORMAL,
                PUBLISHED_AT,
                PUBLISHED_AT.plus(2, ChronoUnit.DAYS),
                PUBLISHED_AT);
    }

    private static Notice archivedNotice() {
        Notice notice = publishedNotice();
        notice.archive(PUBLISHED_AT.plus(3, ChronoUnit.DAYS));
        return notice;
    }

    @Test
    void allowsEditingAPublishedNotice() {
        assertThatCode(() -> publishedNotice().ensureEditable()).doesNotThrowAnyException();
    }

    /** Named explicitly, so the reader is not left deducing which state theirs is in. */
    @Test
    void refusesToEditAnArchivedNotice() {
        assertThatThrownBy(() -> archivedNotice().ensureEditable())
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Archived notices cannot be edited");
    }

    @Test
    void refusesToEditADeletedNotice() {
        Notice notice = publishedNotice();
        notice.softDelete();

        assertThatThrownBy(notice::ensureEditable).isInstanceOf(ValidationException.class);
    }

    /** The text fields go through the same guard, so they close with it. */
    @Test
    void refusesToChangeTheDetailsOfAnArchivedNotice() {
        Notice notice = archivedNotice();

        assertThatThrownBy(() -> notice.updateDetails(
                "Edited title",
                "Edited body",
                NoticePriority.URGENT,
                PUBLISHED_AT,
                null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Archived");
    }

    /**
     * Going live is the point of no return, whatever the status still says.
     *
     * <p>A notice can be PUBLISHED and already on tenants' screens — that is the
     * normal case. Editing or deleting it then would rewrite what they were
     * told, so the window closes the moment it opens.
     */
    @Test
    void refusesToEditAPublishedNoticeThatHasGoneLive() {
        Notice notice = publishedNotice();

        assertThatThrownBy(() -> notice.ensureEditableAt(PUBLISHED_AT.plus(1, ChronoUnit.HOURS)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already live");
    }

    @Test
    void allowsEditingAPublishedNoticeBeforeItGoesLive() {
        Notice notice = publishedNotice();

        assertThatCode(() -> notice.ensureEditableAt(PUBLISHED_AT.minus(1, ChronoUnit.HOURS)))
                .doesNotThrowAnyException();
    }

    /** The status rule still bites first, whatever the clock says. */
    @Test
    void refusesToEditAnArchivedNoticeEvenBeforeItsWindowOpens() {
        Notice notice = archivedNotice();

        assertThatThrownBy(() -> notice.ensureEditableAt(PUBLISHED_AT.minus(1, ChronoUnit.HOURS)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Archived");
    }

    /**
     * A live notice can always be retired, whatever its end date says.
     *
     * <p>The archive precondition used to be expiry, which meant a notice with
     * no end date could never be archived — and with edit and delete closing at
     * go-live, that left it with no exit at all.
     */
    @Test
    void reportsANoticeWithNoEndDateAsLiveOnceItsWindowOpens() {
        Notice notice = Notice.publish(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "House rules",
                "No loud music after 10pm.",
                NoticePriority.NORMAL,
                PUBLISHED_AT,
                null,
                PUBLISHED_AT);

        assertThat(notice.isLiveAt(PUBLISHED_AT.plus(1, ChronoUnit.HOURS))).isTrue();
        assertThat(notice.isExpiredAt(PUBLISHED_AT.plus(365, ChronoUnit.DAYS))).isFalse();
    }

    @Test
    void refusesToDelayAnArchivedNotice() {
        Notice notice = archivedNotice();

        assertThatThrownBy(() -> notice.delayTo(PUBLISHED_AT.plus(5, ChronoUnit.DAYS)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Archived");
    }
}
