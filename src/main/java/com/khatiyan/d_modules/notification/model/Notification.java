package com.khatiyan.d_modules.notification.model;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.khatiyan.c_shared.audit.BaseEntity;

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
 * User-facing in-app notification content.
 *
 * <p>This powers the notification tab. The category tells the broad module
 * bucket, the subtype tells the specific event flavour, sourceId points to
 * the primary object (legacy single-id contract), and data carries structured
 * references the UI uses to render richer cards and route taps to the right
 * screen.
 */
@Entity
@Table(name = "notifications", schema = "notification")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 2000)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private NotificationCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationPriority priority;

    /**
     * Specific event flavour within the category. Nullable to keep older
     * rows and reminder-driven notifications (which don't pre-resolve a
     * subtype) valid.
     */
    @Enumerated(EnumType.STRING)
    @Column(length = 60)
    private NotificationSubtype subtype;

    @Column(name = "source_id")
    private UUID sourceId;

    /**
     * Structured references the UI uses to render context (e.g. property
     * name, room number, amount) and to deep-link to the right screen
     * (e.g. concernId for a concern row). Always non-null — empty when
     * the listener had nothing meaningful to carry.
     */
    // Hibernate's native JSON mapping binds this Map as a JSON value with the
    // correct SQL type so PostgreSQL accepts it into the jsonb column. A prior
    // AttributeConverter approach serialized to String, which PostgreSQL
    // rejected ("column is of type jsonb but expression is of type character
    // varying") and silently failed every notification insert at flush time.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data", columnDefinition = "jsonb", nullable = false)
    private Map<String, String> data = new LinkedHashMap<>();

    private Notification(String title, String body, NotificationCategory category,
                         NotificationPriority priority, NotificationSubtype subtype,
                         UUID sourceId, Map<String, String> data) {
        this.id = UUID.randomUUID();
        this.title = title;
        this.body = body;
        this.category = category;
        this.priority = priority;
        this.subtype = subtype;
        this.sourceId = sourceId;
        this.data = data != null ? new LinkedHashMap<>(data) : new LinkedHashMap<>();
    }

    /**
     * Back-compat factory: no subtype, no structured data. Used by call
     * paths that haven't been upgraded yet (currently the reminder pipeline).
     */
    public static Notification create(String title, String body, NotificationCategory category,
                                      NotificationPriority priority, UUID sourceId) {
        return new Notification(title, body, category, priority, null, sourceId, new LinkedHashMap<>());
    }

    /**
     * Full factory used by event listeners — supplies subtype and the
     * structured data payload alongside the source id.
     */
    public static Notification create(String title, String body, NotificationCategory category,
                                      NotificationPriority priority, NotificationSubtype subtype,
                                      UUID sourceId, Map<String, String> data) {
        return new Notification(title, body, category, priority, subtype, sourceId, data);
    }
}
