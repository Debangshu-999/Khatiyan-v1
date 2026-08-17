package com.khatiyan.d_modules.dashboard.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.dashboard.api.dto.ActivityDayBucket;
import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityItem;
import com.khatiyan.d_modules.dashboard.api.dto.RecentActivityType;
import com.khatiyan.d_modules.dashboard.model.ActivityEvent;
import com.khatiyan.d_modules.dashboard.repository.ActivityEventRepository;

/**
 * Writes and reads the persisted activity feed.
 *
 * <p>
 * Every write goes through {@link #record}, which is idempotent for events that
 * carry a subject — module listeners are at-least-once, so the same domain event
 * can arrive twice after a crash between commit and listener.
 */
@Service
public class ActivityEventService {

    private static final Logger log = LoggerFactory.getLogger(ActivityEventService.class);

    // Buckets are named for the owner's day, not UTC's. Matches the zone the
    // rest of the dashboard reports in.
    private static final ZoneId FEED_ZONE = ZoneId.of("Asia/Kolkata");

    // How far back the feed reaches. A purge job will delete rows past this, so
    // the query bounds itself rather than trusting the table to already be clean.
    static final int RETENTION_DAYS = 7;

    private final ActivityEventRepository activityEventRepository;

    public ActivityEventService(ActivityEventRepository activityEventRepository) {
        this.activityEventRepository = activityEventRepository;
    }

    @Transactional
    public void record(
            UUID propertyId,
            RecentActivityType type,
            String title,
            String subtitle,
            UUID actorUserId,
            UUID subjectId,
            Instant occurredAt) {
        if (propertyId == null || type == null || title == null || title.isBlank()) {
            log.warn("Skipped activity event with missing property, type or title type={}", type);
            return;
        }

        Instant when = occurredAt != null ? occurredAt : Instant.now();

        if (subjectId != null
                && activityEventRepository.existsByPropertyIdAndTypeAndSubjectIdAndOccurredAt(
                        propertyId, type, subjectId, when)) {
            // Redelivery of an event already recorded. Not an error.
            return;
        }

        activityEventRepository.save(ActivityEvent.record(
                propertyId,
                type,
                trim(title, 200),
                trim(subtitle, 300),
                actorUserId,
                subjectId,
                when));
    }

    /**
     * The feed for one property, newest first, each item tagged with the day
     * bucket it belongs to.
     *
     * <p>
     * Bucketing is done here rather than on the client because "today" is an
     * IST question and the device's clock is not necessarily in IST.
     */
    @Transactional(readOnly = true)
    public List<RecentActivityItem> listRecent(UUID propertyId, int limit) {
        LocalDate today = LocalDate.now(FEED_ZONE);
        // Start of the day RETENTION_DAYS ago, not a bare "now minus 7 days" —
        // otherwise the oldest bucket would gain and lose items as the clock
        // moves through the day.
        Instant since = today.minusDays(RETENTION_DAYS - 1L).atStartOfDay(FEED_ZONE).toInstant();

        return activityEventRepository
                .findRecentByPropertyId(propertyId, since, PageRequest.of(0, Math.max(1, limit)))
                .stream()
                .map(event -> new RecentActivityItem(
                        event.getType(),
                        event.getTitle(),
                        event.getSubtitle(),
                        event.getOccurredAt(),
                        bucketFor(event.getOccurredAt(), today)))
                .toList();
    }

    /**
     * Today, yesterday, or everything else inside the retention window.
     *
     * <p>
     * There is no fourth case: {@link #listRecent} never returns anything older,
     * so an item that reaches here is by definition within the window.
     */
    static ActivityDayBucket bucketFor(Instant occurredAt, LocalDate today) {
        LocalDate day = occurredAt.atZone(FEED_ZONE).toLocalDate();

        if (!day.isBefore(today)) {
            return ActivityDayBucket.TODAY;
        }
        if (day.equals(today.minusDays(1))) {
            return ActivityDayBucket.YESTERDAY;
        }

        return ActivityDayBucket.EARLIER_THIS_WEEK;
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        String cleaned = value.strip();
        if (cleaned.isEmpty()) {
            return null;
        }
        return cleaned.length() <= max ? cleaned : cleaned.substring(0, max);
    }
}
