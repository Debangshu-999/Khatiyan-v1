package com.khatiyan.d_modules.property.service;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.api.dto.RoomMoldResponse;
import com.khatiyan.d_modules.property.api.dto.SaveRoomMoldRequest;
import com.khatiyan.d_modules.property.model.MoldImage;
import com.khatiyan.d_modules.property.model.RoomMold;
import com.khatiyan.d_modules.property.model.SharingBeds;
import com.khatiyan.d_modules.property.repository.RoomMoldRepository;
import com.khatiyan.d_modules.property.repository.PropertyRepository;
import com.khatiyan.d_modules.property.repository.RoomRepository;

/**
 * The molds a property offers.
 *
 * <p>Separate from {@code RoomService} because the two answer different
 * questions: this owns what a property CAN let, that owns what it actually has.
 * Keeping them apart is what stops "edit the template" and "edit the room"
 * becoming one method with a flag.
 */
@Service
public class RoomMoldService {

    /**
     * Occupancy ascending, AC first, then bed count.
     *
     * <p>Shared by both list methods so the owner's view and the public listing
     * cannot drift apart. Comparing the enums works because both are declared in
     * the order they mean: SINGLE..DORMITORY, and AC before NON_AC.
     */
    private static final Comparator<RoomMold> BY_OCCUPANCY = Comparator
            .comparing(RoomMold::getSharingType)
            .thenComparing(RoomMold::getConditioning)
            .thenComparingInt(RoomMold::getBedCount);

    private static final Logger log = LoggerFactory.getLogger(RoomMoldService.class);

    private final RoomMoldRepository roomMoldRepository;
    private final RoomRepository roomRepository;
    private final PropertyRepository propertyRepository;
    private final PropertyAccessPolicy propertyAccessPolicy;

    public RoomMoldService(
            RoomMoldRepository roomMoldRepository,
            RoomRepository roomRepository,
            PropertyRepository propertyRepository,
            PropertyAccessPolicy propertyAccessPolicy) {
        this.roomMoldRepository = roomMoldRepository;
        this.roomRepository = roomRepository;
        this.propertyRepository = propertyRepository;
        this.propertyAccessPolicy = propertyAccessPolicy;
    }

    /** Same gate RoomService uses: molds are part of managing rooms. */
    private void requireManageable(UUID actorUserId, UUID propertyId) {
        propertyRepository.findByIdAndActiveTrue(propertyId)
                .orElseThrow(() -> new NotFoundException("Property", propertyId));
        propertyAccessPolicy.ensureCanManageRooms(actorUserId, propertyId);
    }

    /**
     * The types a property offers, with no access check.
     *
     * <p>For the public listing: a prospective tenant is choosing between
     * properties partly on what a bed in each actually costs, and that is what
     * these carry. Only ACTIVE molds — a retired type is one the owner has
     * stopped offering, and offering it on the profile would be a lie.
     *
     * <p>Deliberately separate from {@link #list}, which is the owner's view
     * and takes a viewer to check. A method that skips the check has to say so
     * in its name rather than hide behind a nullable actor.
     */
    @Transactional(readOnly = true)
    public List<RoomMoldResponse> listPublicTypes(UUID propertyId) {
        return roomMoldRepository
                .findByPropertyIdAndActiveTrueOrderBySharingTypeAscConditioningAscBedCountAsc(propertyId)
                .stream()
                // Re-sorted in Java. The repository's ORDER BY runs on the
                // STRING column, so it comes back alphabetically — double,
                // dormitory, four sharing, single, triple — which is no order at
                // all to a reader. Comparing the enum sorts by its declaration,
                // which is the occupancy ascending: single, double, triple,
                // four, dormitory.
                .sorted(BY_OCCUPANCY)
                .map(mold -> RoomMoldResponse.from(mold, roomRepository.countByMoldId(mold.getId())))
                .toList();
    }

    /**
     * The owner's view of the types, retired ones optional.
     *
     * <p>Read-only transactional, and it has to be: `amenities` and `images` are
     * lazy element collections, so building the response outside a session
     * throws rather than returning a mold with empty sets. Both list methods
     * carry their own annotation — one shared between them is one method
     * refactor away from silently losing it.
     */
    @Transactional(readOnly = true)
    public List<RoomMoldResponse> list(UUID actorUserId, UUID propertyId, boolean includeRetired) {
        propertyAccessPolicy.ensureCanViewRooms(actorUserId, propertyId);

        List<RoomMold> molds = includeRetired
                ? roomMoldRepository.findByPropertyIdOrderBySharingTypeAscConditioningAscBedCountAsc(propertyId)
                : roomMoldRepository.findByPropertyIdAndActiveTrueOrderBySharingTypeAscConditioningAscBedCountAsc(
                        propertyId);

        return molds.stream()
                // Same re-sort as the public list, and for the same reason: the
                // repository's ORDER BY runs on the STRING column and hands back
                // double, dormitory, four sharing, single, triple. Comparing the
                // enum sorts by its declaration, which is occupancy ascending.
                .sorted(BY_OCCUPANCY)
                .map(mold -> RoomMoldResponse.from(mold, roomRepository.countByMoldId(mold.getId())))
                .toList();
    }

    @Transactional
    public RoomMoldResponse create(UUID actorUserId, UUID propertyId, SaveRoomMoldRequest request) {
        requireManageable(actorUserId, propertyId);

        int bedCount = SharingBeds.resolve(request.sharingType(), request.bedCount());
        if (roomMoldRepository.existsByPropertyIdAndSharingTypeAndConditioningAndBedCount(
                propertyId, request.sharingType(), request.conditioning(), bedCount)) {
            // Checked here so the refusal can say what the clash is. Left to the
            // unique index it surfaces as a constraint violation naming a column.
            throw new ValidationException("This property already has that room type");
        }

        RoomMold mold = roomMoldRepository.save(RoomMold.create(
                propertyId,
                request.sharingType(),
                request.conditioning(),
                bedCount,
                request.baseRentPaise(),
                request.amenities(),
                request.customAmenities(),
                toImages(request)));

        log.info("Room mold created moldId={} propertyId={} sharingType={} conditioning={} beds={}",
                mold.getId(), propertyId, mold.getSharingType(), mold.getConditioning(), mold.getBedCount());

        return RoomMoldResponse.from(mold, 0);
    }

    /**
     * Edits a mold's defaults.
     *
     * <p>Rooms already cut from it are untouched, deliberately — see
     * {@link RoomMold}. Anything that changes the SHAPE (bed count, variant)
     * is not editable here at all: it would silently make every existing room a
     * room of a different kind.
     */
    @Transactional
    public RoomMoldResponse update(UUID actorUserId, UUID propertyId, UUID moldId, SaveRoomMoldRequest request) {
        requireManageable(actorUserId, propertyId);
        RoomMold mold = require(propertyId, moldId);

        if (mold.getSharingType() != request.sharingType() || mold.getConditioning() != request.conditioning()) {
            throw new ValidationException(
                    "A room type's sharing and AC variant cannot be changed. Add the type you need instead.");
        }

        mold.update(request.baseRentPaise(), request.amenities(), request.customAmenities(), toImages(request));
        log.info("Room mold updated moldId={} propertyId={}", moldId, propertyId);

        return RoomMoldResponse.from(mold, roomRepository.countByMoldId(moldId));
    }

    /**
     * Hides a mold from the pickers.
     *
     * <p>Retire rather than delete while rooms still point at it: those rooms
     * are real and occupied, and the mold is what says what they are. Deleting
     * would strip that from them to tidy a list.
     */
    @Transactional
    public void retire(UUID actorUserId, UUID propertyId, UUID moldId) {
        requireManageable(actorUserId, propertyId);
        require(propertyId, moldId).retire();
        log.info("Room mold retired moldId={} propertyId={}", moldId, propertyId);
    }

    @Transactional
    public void restore(UUID actorUserId, UUID propertyId, UUID moldId) {
        requireManageable(actorUserId, propertyId);
        require(propertyId, moldId).restore();
    }

    /** For RoomService, which cuts rooms from these. */
    RoomMold requireActive(UUID propertyId, UUID moldId) {
        RoomMold mold = require(propertyId, moldId);
        if (!mold.isActive()) {
            throw new ValidationException("That room type is retired. Restore it or pick another.");
        }
        return mold;
    }

    private RoomMold require(UUID propertyId, UUID moldId) {
        return roomMoldRepository.findByIdAndPropertyId(moldId, propertyId)
                .orElseThrow(() -> new NotFoundException("Room type", moldId.toString()));
    }

    /**
     * Turns the request's image list into the model's, in the order it arrived.
     *
     * <p>The order IS the meaning — the first photo is the one a listing shows —
     * so nothing here sorts or dedupes it. Null becomes empty rather than
     * throwing: images are optional, and a client that omits the field entirely
     * is saying "none", not "I forgot".
     */
    private static List<MoldImage> toImages(SaveRoomMoldRequest request) {
        if (request.images() == null) {
            return List.of();
        }
        return request.images().stream()
                .map(image -> MoldImage.of(image.url(), image.publicId()))
                .toList();
    }
}
