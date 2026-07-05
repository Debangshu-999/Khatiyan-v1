package com.khatiyan.d_modules.discovery.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.discovery.model.PropertyLocalPlace;

@Repository
public interface PropertyLocalPlaceRepository extends JpaRepository<PropertyLocalPlace, UUID> {

    @Query("""
            select place
            from PropertyLocalPlace place
            where place.id = :placeId
              and place.active = true
            """)
    Optional<PropertyLocalPlace> findActiveById(@Param("placeId") UUID placeId);

    @Query("""
            select place
            from PropertyLocalPlace place
            where place.propertyId = :propertyId
              and place.active = true
            order by place.ownerRecommended desc, place.name asc
            """)
    List<PropertyLocalPlace> findActiveByPropertyId(@Param("propertyId") UUID propertyId);

    /** Active places still missing coordinates — the geo backfill queue. */
    List<PropertyLocalPlace> findByActiveTrueAndLatitudeIsNull();
}
