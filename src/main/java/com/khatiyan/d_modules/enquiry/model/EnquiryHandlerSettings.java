package com.khatiyan.d_modules.enquiry.model;

import java.util.List;
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
 * How one property chooses the handler of a new enquiry.
 *
 * <p>A property with no row here is in {@link EnquiryHandlerMode#FIRST_RESPONSE},
 * which is how enquiries worked before handlers existed. The row is written the
 * first time an owner picks a mode.
 */
@Entity
@Table(name = "enquiry_handler_settings", schema = "enquiry")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EnquiryHandlerSettings extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EnquiryHandlerMode mode;

    /** Whether the owner takes a turn in {@link EnquiryHandlerMode#SYSTEM_TURNS}. */
    @Column(name = "include_owner", nullable = false)
    private boolean includeOwner;

    /** Who got the last system turn. The next goes to whoever follows them. */
    @Column(name = "last_assigned_user_id")
    private UUID lastAssignedUserId;

    private EnquiryHandlerSettings(UUID propertyId, EnquiryHandlerMode mode, boolean includeOwner) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.mode = mode;
        this.includeOwner = includeOwner;
    }

    public static EnquiryHandlerSettings choose(UUID propertyId, EnquiryHandlerMode mode, boolean includeOwner) {
        if (mode == null) {
            throw new ValidationException("Choose how enquiries are handled.");
        }
        return new EnquiryHandlerSettings(propertyId, mode, includeOwner);
    }

    public void change(EnquiryHandlerMode mode, boolean includeOwner) {
        if (mode == null) {
            throw new ValidationException("Choose how enquiries are handled.");
        }
        this.mode = mode;
        this.includeOwner = includeOwner;
    }

    /**
     * Takes the next turn and remembers who got it.
     *
     * <p>The candidates arrive in a fixed order (by id). The turn goes to the
     * first one after whoever had the last turn, wrapping to the start. Going by
     * position in the order, not by a stored index, is what keeps the turns even
     * when someone joins or leaves between two enquiries: the pointer names a
     * person, and the next turn is whoever follows them now.
     *
     * @return the handler, or null when nobody is eligible
     */
    public UUID takeNextTurn(List<UUID> candidatesInOrder) {
        if (candidatesInOrder.isEmpty()) {
            return null;
        }
        UUID next = candidatesInOrder.get(0);
        if (lastAssignedUserId != null) {
            for (UUID candidate : candidatesInOrder) {
                if (candidate.compareTo(lastAssignedUserId) > 0) {
                    next = candidate;
                    break;
                }
            }
        }
        this.lastAssignedUserId = next;
        return next;
    }
}
