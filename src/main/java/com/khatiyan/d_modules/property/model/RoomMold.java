package com.khatiyan.d_modules.property.model;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * The shape a room is cut from: one sharing type, one conditioning variant.
 *
 * <p>A <b>template, not a parent</b>. Rooms copy the rent and amenities at
 * creation and may then diverge, and editing a mold afterwards does not reach
 * back into rooms already made from it. That is deliberate: a rent correction
 * must not silently reprice forty live rooms. It also means the mold's rent is
 * a <em>default</em>, so anything reporting "what a double costs here" has to
 * read the rooms, not this.
 *
 * <p>The one thing a mold does own outright is {@link #bedCount}. Changing it
 * changes what the rooms are, so that path goes through the room and is checked
 * against occupancy — see {@code Room.recut}.
 */
@Entity
@Table(name = "room_molds", schema = "property")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RoomMold extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sharing_type", nullable = false, length = 30)
    private RoomType sharingType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoomConditioning conditioning;

    @Column(name = "bed_count", nullable = false)
    private int bedCount;

    @Column(name = "base_rent_paise", nullable = false)
    private long baseRentPaise;

    @ElementCollection
    @CollectionTable(
            name = "room_mold_amenities",
            schema = "property",
            joinColumns = @JoinColumn(name = "mold_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "amenity", nullable = false, length = 40)
    private Set<RoomAmenity> amenities = new HashSet<>();

    @ElementCollection
    @CollectionTable(
            name = "room_mold_custom_amenities",
            schema = "property",
            joinColumns = @JoinColumn(name = "mold_id"))
    @Column(name = "name", nullable = false, length = 80)
    private Set<String> customAmenities = new HashSet<>();

    /**
     * Photos of this type, first one first.
     *
     * <p>A list, not a set: the order is the answer to "which picture does a
     * listing show", and it is the owner's to arrange.
     *
     * <p>Optional. Plenty of owners will register without a camera to hand, and
     * a type with no photo is still a type that rooms can be cut from.
     */
    @ElementCollection
    @CollectionTable(
            name = "room_mold_images",
            schema = "property",
            joinColumns = @JoinColumn(name = "mold_id"))
    @OrderColumn(name = "position")
    private List<MoldImage> images = new ArrayList<>();

    @Column(name = "is_active", nullable = false)
    private boolean active;

    private RoomMold(UUID propertyId, RoomType sharingType, RoomConditioning conditioning, int bedCount) {
        this.id = UUID.randomUUID();
        this.propertyId = propertyId;
        this.sharingType = sharingType;
        this.conditioning = conditioning;
        this.bedCount = bedCount;
        this.active = true;
    }

    public static RoomMold create(
            UUID propertyId,
            RoomType sharingType,
            RoomConditioning conditioning,
            Integer requestedBedCount,
            long baseRentPaise,
            Set<RoomAmenity> amenities,
            Set<String> customAmenities,
            List<MoldImage> images) {

        RoomMold mold = new RoomMold(
                propertyId,
                sharingType,
                conditioning,
                SharingBeds.resolve(sharingType, requestedBedCount));
        mold.applyRentAndAmenities(baseRentPaise, amenities, customAmenities, images);
        return mold;
    }

    /**
     * Rewrites the defaults. Bed count and variant are not editable here.
     *
     * <p>Those two are what the mold IS — changing either would make every room
     * already cut from it a room of a different kind, silently. A property that
     * needs a different shape needs a different mold, and its rooms moved to it
     * one at a time where the occupancy can be checked.
     */
    public void update(
            long baseRentPaise,
            Set<RoomAmenity> amenities,
            Set<String> customAmenities,
            List<MoldImage> images) {
        applyRentAndAmenities(baseRentPaise, amenities, customAmenities, images);
    }

    /** Mirrors the column width, so a long list fails here rather than at the insert. */
    private static final int MAX_IMAGES = 10;

    private void applyRentAndAmenities(
            long baseRentPaise,
            Set<RoomAmenity> amenities,
            Set<String> customAmenities,
            List<MoldImage> images) {
        if (baseRentPaise < 0) {
            throw new ValidationException("Rent cannot be negative");
        }
        if (images != null && images.size() > MAX_IMAGES) {
            throw new ValidationException("A room type can have at most " + MAX_IMAGES + " images");
        }

        this.baseRentPaise = baseRentPaise;
        this.amenities = amenities == null ? new HashSet<>() : new HashSet<>(amenities);
        this.customAmenities = RoomAmenities.cleanCustom(customAmenities);
        // Replaced wholesale rather than merged: the request carries the list the
        // owner just arranged, and a merge would have to guess at intent for a
        // photo present in one and not the other.
        this.images = images == null ? new ArrayList<>() : new ArrayList<>(images);
    }

    /** Hidden from the pickers without disturbing the rooms already cut from it. */
    public void retire() {
        this.active = false;
    }

    public void restore() {
        this.active = true;
    }
}
