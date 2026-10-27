package com.khatiyan.d_modules.tenancy.model;

import java.time.LocalDate;
import java.util.Objects;
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

/** One shared bed claim; a future departure becomes a live reservation only when actually freed. */
@Entity
@Table(name = "bed_holds", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BedHold extends BaseEntity {
    public enum Owner { BOOKING, TENANCY }
    public enum State { WAITING, HELD, RELEASED, CONSUMED }

    @Id @Column(nullable = false, updatable = false)
    private UUID id;
    @Enumerated(EnumType.STRING) @Column(name = "owner_kind", nullable = false, updatable = false, length = 20)
    private Owner ownerKind;
    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;
    @Column(name = "room_id", nullable = false)
    private UUID roomId;
    @Column(name = "move_in_date", nullable = false)
    private LocalDate moveInDate;
    @Column(name = "departing_tenancy_id")
    private UUID departingTenancyId;
    @Column(name = "room_change_request_id", updatable = false)
    private UUID roomChangeRequestId;
    @Column(name = "exit_request_id")
    private UUID exitRequestId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private State state;

    public static BedHold booking(UUID bookingId, UUID propertyId, UUID roomId, LocalDate moveInDate,
            UUID departingTenancyId, UUID exitRequestId) {
        BedHold hold = new BedHold();
        hold.id = UUID.randomUUID();
        hold.ownerKind = Owner.BOOKING;
        hold.ownerId = Objects.requireNonNull(bookingId);
        hold.propertyId = Objects.requireNonNull(propertyId);
        hold.roomId = Objects.requireNonNull(roomId);
        hold.moveInDate = Objects.requireNonNull(moveInDate);
        hold.departingTenancyId = departingTenancyId;
        hold.exitRequestId = exitRequestId;
        if ((departingTenancyId == null) != (exitRequestId == null)) {
            throw new ValidationException("A future booking requires its confirmed exit source");
        }
        hold.state = departingTenancyId == null ? State.HELD : State.WAITING;
        return hold;
    }

    public boolean active() { return state == State.WAITING || state == State.HELD; }

    public void requireSameBooking(UUID property, UUID room, LocalDate date, UUID exit) {
        if (!propertyId.equals(property) || !roomId.equals(room) || !moveInDate.equals(date)
                || !Objects.equals(exitRequestId, exit) || !active()) {
            throw new ValidationException("This booking already has a different or completed bed hold");
        }
    }

    public boolean materialize() {
        if (state != State.WAITING) return false;
        state = State.HELD;
        return true;
    }

    public boolean release() {
        if (!active()) return false;
        state = State.RELEASED;
        return true;
    }

    /** The booking's move-in date moves to a later day. The bed, and where it comes from, stay as they are. */
    public void moveDate(LocalDate date) {
        if (!active()) throw new ValidationException("This booking no longer holds a bed.");
        moveInDate = date;
    }

    /** The booking takes a bed that is free today in another room, in place of the one it held or waited for. */
    public void moveTo(UUID room) {
        if (!active()) throw new ValidationException("This booking no longer holds a bed.");
        roomId = room;
        departingTenancyId = null;
        exitRequestId = null;
        state = State.HELD;
    }

    /** The bed passes to the stay created from the booking. Only a live hold can: a waiting one has no bed yet. */
    public boolean consume() {
        if (state != State.HELD) return false;
        state = State.CONSUMED;
        return true;
    }
}
