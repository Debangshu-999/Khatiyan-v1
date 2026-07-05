package com.khatiyan.d_modules.discovery.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.discovery.model.PropertyDiscoveryProfile;

@Repository
public interface PropertyDiscoveryProfileRepository extends JpaRepository<PropertyDiscoveryProfile, UUID> {

    @Query("""
            select profile
            from PropertyDiscoveryProfile profile
            where profile.propertyId = :propertyId
              and profile.active = true
            """)
    Optional<PropertyDiscoveryProfile> findActiveByPropertyId(@Param("propertyId") UUID propertyId);

    @Query("""
            select profile
            from PropertyDiscoveryProfile profile
            where profile.propertyId = :propertyId
              and profile.publicVisible = true
              and profile.active = true
            """)
    Optional<PropertyDiscoveryProfile> findVisibleByPropertyId(@Param("propertyId") UUID propertyId);

    @Query("""
            select profile
            from PropertyDiscoveryProfile profile
            where profile.publicVisible = true
              and profile.active = true
            order by profile.publishedAt desc nulls last, profile.createdAt desc
            """)
    List<PropertyDiscoveryProfile> findAllVisible();

    /** Distance (km) from a search point to one visible, coordinated property. */
    interface VisiblePropertyDistance {
        UUID getPropertyId();

        Double getDistanceKm();
    }

    /**
     * Great-circle distances from a search point to all visible properties
     * inside a bounding box. The box predicate rides the partial btree index
     * (idx_properties_lat_lng); the haversine expression then refines exactly.
     * Pure SQL by design — no PostGIS/earthdistance install burden.
     */
    @Query(nativeQuery = true, value = """
            SELECT p.id AS "propertyId",
                   6371.0088 * acos(LEAST(1.0, GREATEST(-1.0,
                       cos(radians(CAST(:latitude AS float8))) * cos(radians(CAST(p.latitude AS float8)))
                           * cos(radians(CAST(p.longitude AS float8)) - radians(CAST(:longitude AS float8)))
                       + sin(radians(CAST(:latitude AS float8))) * sin(radians(CAST(p.latitude AS float8)))
                   ))) AS "distanceKm"
            FROM property.properties p
            JOIN discovery.property_discovery_profiles dp
              ON dp.property_id = p.id
             AND dp.is_active = TRUE
             AND dp.public_visible = TRUE
            WHERE p.is_active = TRUE
              AND p.latitude IS NOT NULL
              AND p.longitude IS NOT NULL
              AND p.latitude BETWEEN :minLatitude AND :maxLatitude
              AND p.longitude BETWEEN :minLongitude AND :maxLongitude
            ORDER BY "distanceKm"
            """)
    List<VisiblePropertyDistance> findVisiblePropertyDistances(
            @Param("latitude") double latitude,
            @Param("longitude") double longitude,
            @Param("minLatitude") double minLatitude,
            @Param("maxLatitude") double maxLatitude,
            @Param("minLongitude") double minLongitude,
            @Param("maxLongitude") double maxLongitude);
}
