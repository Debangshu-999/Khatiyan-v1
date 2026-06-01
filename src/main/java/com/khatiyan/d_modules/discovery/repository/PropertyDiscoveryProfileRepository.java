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
}
