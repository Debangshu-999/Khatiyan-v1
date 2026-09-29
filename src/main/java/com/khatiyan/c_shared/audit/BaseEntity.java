package com.khatiyan.c_shared.audit;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Version;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

/**
 * Common audit fields for every persisted entity.
 *
 * Subclasses inherit {@code created_at} and {@code updated_at} columns,
 * which Spring Data JPA populates automatically through
 * {@link AuditingEntityListener} on every insert and update.
 *
 * Once the auth module is in place, {@code created_by} and
 * {@code updated_by} columns can be added here to capture
 * <em>who</em> performed each change in addition to <em>when</em>.
 *
 * <p>Every row also carries a {@code version} (2026-09-28): a save lands only
 * on the version it read, so a stale screen or a same-moment second request is
 * refused rather than doubling or overwriting a change. See
 * docs/superpowers/specs/2026-09-28-concurrent-edit-safety-design.md.
 */
@Getter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    @CreatedDate
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * Bumped on every save. A primitive, so Spring Data still tells a new
     * entity from an existing one by its id, exactly as before.
     */
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    /**
     * Marks an aggregate as changed when one of its owned records changes.
     *
     * <p>Spring Data normally updates this timestamp when a field on this row
     * changes. Some aggregates also need their activity time refreshed when a
     * child row changes; assigning the audit value makes that relationship
     * explicit and gives Hibernate a dirty field to persist.
     */
    protected final void touchUpdatedAt() {
        this.updatedAt = Instant.now();
    }

    /**
     * Marks this row changed so its version bumps on save, for an action that
     * only wrote rows under it (2026-09-29, see VersionGuard). Any two actions
     * on the same record then clash.
     */
    public final void markChanged() {
        this.updatedAt = Instant.now();
    }
}
