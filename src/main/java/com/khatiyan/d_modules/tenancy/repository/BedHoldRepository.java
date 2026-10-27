package com.khatiyan.d_modules.tenancy.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.khatiyan.d_modules.tenancy.model.BedHold;
import com.khatiyan.d_modules.tenancy.model.BedHold.Owner;
import com.khatiyan.d_modules.tenancy.model.BedHold.State;

public interface BedHoldRepository extends JpaRepository<BedHold, UUID> {
    Optional<BedHold> findByOwnerKindAndOwnerId(Owner ownerKind, UUID ownerId);

    /** Of these owners, the ones whose hold is in this state. One read for a page of bookings. */
    @Query("SELECT h.ownerId FROM BedHold h WHERE h.ownerKind = :ownerKind AND h.ownerId IN :ownerIds "
            + "AND h.state = :state")
    List<UUID> ownersInState(Owner ownerKind, java.util.Collection<UUID> ownerIds, State state);

    Optional<BedHold> findFirstByDepartingTenancyIdAndStateIn(UUID tenancyId, List<State> states);

    /** Once physically freed, the room reservation owns the slot, not its former occupant's future departure. */
    default Optional<BedHold> activeOnDeparture(UUID tenancyId) {
        return findFirstByDepartingTenancyIdAndStateIn(tenancyId, List.of(State.WAITING));
    }

    @Query("SELECT h.departingTenancyId FROM BedHold h WHERE h.propertyId = :propertyId "
            + "AND h.departingTenancyId IS NOT NULL AND h.state IN :states")
    List<UUID> claimedDeparturesInStates(UUID propertyId, List<State> states);

    default List<UUID> claimedDepartures(UUID propertyId) {
        return claimedDeparturesInStates(propertyId, List.of(State.WAITING));
    }
}
