package com.khatiyan.c_shared.audit;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
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
}
