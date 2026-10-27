package com.khatiyan.d_modules.lead.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.rate_limit.RateLimitService;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchRequest;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchRequest.AppEvent;
import com.khatiyan.d_modules.lead.api.dto.AppEventBatchResponse;
import com.khatiyan.d_modules.property.PropertyModule;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

/**
 * The collector for what people do on a property profile (2026-10-18).
 *
 * <p>Built the way the common analytics pipelines are: the app queues events
 * and sends them in batches, each event carries its own id so a resent batch
 * lands once, a malformed event is set aside with its reason rather than lost,
 * and the raw log is never edited. Everything the funnel shows is worked out
 * from that log when it is read.
 *
 * <p>The property's own owner and managers are marked internal as their
 * events arrive, and left out of every count. Kept, so the rule can change.
 */
@Slf4j
@Service
public class ProfileEventService {

    static final int MAX_BATCH = 100;
    static final int SCHEMA_VERSION = 1;
    /** Longer than any honest read of one profile, and a bound on a stuck timer. */
    static final Duration LONGEST_VIEW = Duration.ofHours(6);
    /** The app holds events while offline. Older than this is not believed. */
    static final Duration OLDEST_EVENT = Duration.ofDays(30);
    static final Duration CLOCK_SLACK = Duration.ofMinutes(1);
    private static final Set<String> NAMES = Set.of("PROFILE_OPENED", "PROFILE_CLOSED", "CONTACT_TAPPED");
    private static final Set<String> SOURCES = Set.of("SEARCH", "SMART_SEARCH", "MAP", "LINK", "OTHER");
    /** Profiles show no email (2026-10-18), so a call is the only contact tap. */
    private static final Set<String> CHANNELS = Set.of("CALL");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcTemplate jdbc;
    private final PropertyModule propertyModule;
    private final RateLimitService rateLimitService;
    private final Clock clock;

    public ProfileEventService(
            JdbcTemplate jdbc, PropertyModule propertyModule, RateLimitService rateLimitService, Clock clock) {
        this.jdbc = jdbc;
        this.propertyModule = propertyModule;
        this.rateLimitService = rateLimitService;
        this.clock = clock;
    }

    /**
     * Not one transaction on purpose: the internal check asks the property
     * module, whose refusal for a stranger would mark a shared transaction for
     * rollback. Each insert stands on its own, and a repeat is ignored.
     */
    public AppEventBatchResponse collect(UUID userId, AppEventBatchRequest batch) {
        List<AppEvent> events = batch == null || batch.events() == null ? List.of() : batch.events();
        if (events.size() > MAX_BATCH) {
            throw new ValidationException("Send at most " + MAX_BATCH + " events at a time.");
        }
        // A tracker flushes every few seconds at most. This only stops a loop.
        rateLimitService.consumeOrThrow("app-events:" + userId, 120, 60, "Too many events. Try again shortly.");

        Instant receivedAt = clock.instant();
        Instant sentAt = batch.sentAt();
        String appVersion = batch.context() == null ? null : clip(batch.context().appVersion(), 40);
        String platform = batch.context() == null ? null : clip(batch.context().platform(), 20);
        Map<UUID, Boolean> internalByProperty = new HashMap<>();

        List<Object[]> accepted = new ArrayList<>();
        int rejected = 0;
        for (AppEvent event : events) {
            String reason = problemWith(event);
            Instant occurredAt = reason == null ? corrected(event.occurredAt(), sentAt, receivedAt) : null;
            if (reason == null && occurredAt.isAfter(receivedAt.plus(CLOCK_SLACK))) {
                reason = "occurredAt is in the future";
            }
            if (reason == null && occurredAt.isBefore(receivedAt.minus(OLDEST_EVENT))) {
                reason = "occurredAt is more than 30 days old";
            }
            if (reason != null) {
                reject(userId, event, reason);
                rejected++;
                continue;
            }
            boolean internal = internalByProperty.computeIfAbsent(event.propertyId(), propertyId -> manages(userId, propertyId));
            accepted.add(new Object[] {
                    event.eventId(), event.name(), event.schemaVersion(), userId, event.propertyId(), event.viewId(),
                    Timestamp.from(occurredAt), Timestamp.from(event.occurredAt()),
                    Timestamp.from(sentAt == null ? receivedAt : sentAt), Timestamp.from(receivedAt),
                    internal,
                    event.name().equals("PROFILE_OPENED") ? source(event.source()) : null,
                    event.name().equals("PROFILE_CLOSED") ? event.durationMs() : null,
                    event.name().equals("CONTACT_TAPPED") ? event.channel() : null,
                    appVersion, platform });
        }

        if (!accepted.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO lead.profile_events (id, event_name, schema_version, user_id, property_id, view_id,
                        occurred_at, client_occurred_at, sent_at, received_at, internal, source, duration_ms,
                        channel, app_version, platform)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """, accepted);
        }
        return new AppEventBatchResponse(accepted.size(), rejected);
    }

    /** Null when the event can be stored. */
    static String problemWith(AppEvent event) {
        if (event == null) {
            return "empty event";
        }
        if (event.eventId() == null || event.propertyId() == null || event.viewId() == null || event.occurredAt() == null) {
            return "eventId, propertyId, viewId and occurredAt are required";
        }
        if (event.name() == null || !NAMES.contains(event.name())) {
            return "unknown event name";
        }
        if (event.schemaVersion() == null || event.schemaVersion() != SCHEMA_VERSION) {
            return "unsupported schemaVersion";
        }
        if (event.name().equals("PROFILE_CLOSED")
                && (event.durationMs() == null || event.durationMs() < 0 || event.durationMs() > LONGEST_VIEW.toMillis())) {
            return "a close needs durationMs between 0 and 6 hours";
        }
        if (event.name().equals("CONTACT_TAPPED") && (event.channel() == null || !CHANNELS.contains(event.channel()))) {
            return "a contact tap needs channel CALL";
        }
        return null;
    }

    /**
     * When it happened by the server's clock: the receive time less however
     * long the app held the event. A phone set an hour wrong is then still
     * right. Without a send time, the phone's own time is used.
     */
    static Instant corrected(Instant clientOccurredAt, Instant sentAt, Instant receivedAt) {
        if (sentAt == null) {
            return clientOccurredAt;
        }
        Duration held = Duration.between(clientOccurredAt, sentAt);
        return receivedAt.minus(held.isNegative() ? Duration.ZERO : held);
    }

    private boolean manages(UUID userId, UUID propertyId) {
        try {
            propertyModule.ensureCanManageProperty(userId, propertyId);
            return true;
        } catch (RuntimeException notTheirs) {
            return false;
        }
    }

    private void reject(UUID userId, AppEvent event, String reason) {
        String payload;
        try {
            payload = JSON.writeValueAsString(event);
        } catch (RuntimeException unwritable) {
            payload = "{}";
        }
        jdbc.update(
                "INSERT INTO lead.rejected_profile_events (user_id, payload, reason) VALUES (?, ?::jsonb, ?)",
                userId, payload, reason);
        log.debug("Profile event rejected userId={} reason={}", userId, reason);
    }

    private static String source(String source) {
        return source != null && SOURCES.contains(source) ? source : "OTHER";
    }

    private static String clip(String value, int length) {
        return value == null || value.length() <= length ? value : value.substring(0, length);
    }
}
