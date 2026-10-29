package com.khatiyan.d_modules.tenancy.model;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * The room's condition when a tenant moved in (user, 2026-10-29), recorded at
 * onboarding: each item with its damage level and 1 to 3 photos of it, the keys
 * handed over. The tenant has 48 hours to accept it or note a difference; unanswered,
 * it counts as accepted. One per stay (V6247).
 */
@Entity
@Table(name = "move_in_checklists", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MoveInChecklist {

    /** How long the tenant has to answer. */
    public static final Duration RESPONSE_WINDOW = Duration.ofHours(48);

    @Id
    @Column(name = "tenancy_id")
    private UUID tenancyId;

    @ElementCollection
    @CollectionTable(name = "move_in_checklist_items", schema = "tenancy", joinColumns = @JoinColumn(name = "tenancy_id"))
    @OrderColumn(name = "display_order")
    private List<MoveInChecklistItem> items = new ArrayList<>();

    @Column(name = "keys_handed_over")
    private Integer keysHandedOver;

    @Column(name = "recorded_by_user_id", nullable = false)
    private UUID recordedByUserId;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "tenant_response", nullable = false, length = 20)
    private MoveInResponse tenantResponse = MoveInResponse.PENDING;

    @Column(name = "tenant_note", length = 500)
    private String tenantNote;

    @Column(name = "responded_at")
    private Instant respondedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    public static MoveInChecklist record(UUID tenancyId, UUID recordedBy, Instant at,
            List<MoveInChecklistItem> items, Integer keysHandedOver) {
        if (items == null || items.isEmpty()) {
            throw new ValidationException("Add at least one item to the move-in checklist");
        }
        // Recorded on every checklist, at least one (user, 2026-10-29).
        if (keysHandedOver == null || keysHandedOver < 1) {
            throw new ValidationException("Enter how many keys were handed over, at least 1");
        }
        MoveInChecklist checklist = new MoveInChecklist();
        checklist.tenancyId = tenancyId;
        checklist.recordedByUserId = recordedBy;
        checklist.recordedAt = at;
        checklist.items.addAll(items);
        checklist.keysHandedOver = keysHandedOver;
        return checklist;
    }

    /** The last moment the tenant can answer. */
    public Instant respondBy() {
        return recordedAt.plus(RESPONSE_WINDOW);
    }

    /** Unanswered past the window reads as accepted. */
    public boolean acceptedByDefault(Instant now) {
        return tenantResponse == MoveInResponse.PENDING && now.isAfter(respondBy());
    }

    public void respond(boolean looksRight, String note, Instant now) {
        if (tenantResponse != MoveInResponse.PENDING) {
            throw new ValidationException("You have already answered this checklist");
        }
        if (now.isAfter(respondBy())) {
            throw new ValidationException("The 48 hours to answer this checklist have passed. It counts as accepted");
        }
        if (looksRight) {
            this.tenantResponse = MoveInResponse.ACCEPTED;
            this.tenantNote = null;
        } else {
            String cleaned = note == null ? "" : note.strip();
            if (cleaned.isEmpty()) {
                throw new ValidationException("Write what is different from the checklist");
            }
            this.tenantResponse = MoveInResponse.NOTED;
            this.tenantNote = cleaned;
        }
        this.respondedAt = now;
    }
}
