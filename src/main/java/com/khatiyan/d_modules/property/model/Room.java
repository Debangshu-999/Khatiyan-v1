package com.khatiyan.d_modules.property.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.money.Money;

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
 * A rentable room or bed group inside a property.
 *
 * <p>Rooms belong to one property and carry operational details such as
 * capacity, base rent, and availability status. Tenancy should ask the
 * property facade about rooms instead of directly reading this entity.
 */
@Entity
@Table(name = "rooms", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Room extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Column(name = "room_number", nullable = false, length = 40)
    private String roomNumber;

    @Column(length = 40)
    private String floor;

    @Column(nullable = false)
    private int capacity;

    @Column(name = "occupied_count", nullable = false)
    private int occupiedCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "room_type", nullable = false, length = 20)
    private RoomType roomType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoomConditioning conditioning;

    @Column(name = "base_rent_paise", nullable = false)
    private long baseRentPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoomStatus status;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private Room(UUID propertyId, String roomNumber, String floor, int capacity,
                 RoomType roomType, RoomConditioning conditioning, Money baseRent) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.roomNumber = roomNumber;
        this.floor = floor;
        this.capacity = capacity;
        this.occupiedCount = 0;
        this.roomType = roomType;
        this.conditioning = conditioning;
        this.baseRentPaise = baseRent.paise();
        this.status = RoomStatus.VACANT;
        this.active = true;
    }

    public static Room create(UUID propertyId, String roomNumber, String floor, int capacity,
                              RoomType roomType, RoomConditioning conditioning, Money baseRent) {
        if (capacity <= 0) {
            throw new ValidationException("Room capacity must be positive");
        }

        if (baseRent == null) {
            throw new ValidationException("Base rent is required");
        }

        if (baseRent.paise() < 0) {
            throw new ValidationException("Base rent cannot be negative");
        }

        return new Room(propertyId, roomNumber, floor, capacity, roomType, conditioning, baseRent);
    }

    public void updateDetails(String roomNumber, String floor, int capacity,
                              RoomType roomType, RoomConditioning conditioning, Money baseRent) {
        if (capacity <= 0) {
            throw new ValidationException("Room capacity must be positive");
        }

        if (baseRent == null) {
            throw new ValidationException("Base rent is required");
        }

        if (baseRent.paise() < 0) {
            throw new ValidationException("Base rent cannot be negative");
        }

        this.roomNumber = roomNumber;
        this.floor = floor;
        if (capacity < occupiedCount) {
            throw new ValidationException("Room capacity cannot be less than current occupancy");
        }

        this.capacity = capacity;
        this.roomType = roomType;
        this.conditioning = conditioning;
        this.baseRentPaise = baseRent.paise();
        refreshOccupancyStatus();
    }

    public Money getBaseRent() {
        return Money.ofPaise(baseRentPaise);
    }

    public int getAvailableVacancies() {
        return capacity - occupiedCount;
    }

    public boolean hasVacancy() {
        return active && status != RoomStatus.MAINTENANCE && occupiedCount < capacity;
    }

    public boolean isEmpty() {
        return occupiedCount == 0;
    }

    public void occupyOneSlot() {
        if (status == RoomStatus.MAINTENANCE) {
            throw new ValidationException("Room is under maintenance");
        }

        if (occupiedCount >= capacity) {
            throw new ValidationException("Room has no available vacancy");
        }

        this.occupiedCount++;
        refreshOccupancyStatus();
    }

    public void vacateOneSlot() {
        if (occupiedCount <= 0) {
            throw new ValidationException("Room has no occupied slot to vacate");
        }

        this.occupiedCount--;
        refreshOccupancyStatus();
    }

    public void markMaintenance() {
        if (!isEmpty()) {
            throw new ValidationException("Room has active occupancy");
        }

        this.status = RoomStatus.MAINTENANCE;
    }

    public void markVacant() {
        if (!isEmpty()) {
            throw new ValidationException("Room has active occupancy");
        }

        this.status = RoomStatus.VACANT;
    }

    public void deactivate() {
        if (!isEmpty()) {
            throw new ValidationException("Room has active occupancy");
        }

        this.active = false;
    }

    public boolean isCurrentlyActive() {
        return active;
    }

    private void refreshOccupancyStatus() {
        if (occupiedCount <= 0) {
            this.status = RoomStatus.VACANT;
        } else if (occupiedCount >= capacity) {
            this.status = RoomStatus.OCCUPIED;
        } else {
            this.status = RoomStatus.PARTIALLY_OCCUPIED;
        }
    }
}
