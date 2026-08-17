package com.khatiyan.d_modules.discovery.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.discovery.model.PropertyImage;

@Repository
public interface PropertyImageRepository extends JpaRepository<PropertyImage, UUID> {

    List<PropertyImage> findByPropertyIdOrderBySortOrderAsc(UUID propertyId);

    Optional<PropertyImage> findByIdAndPropertyId(UUID id, UUID propertyId);

    int countByPropertyId(UUID propertyId);

    /**
     * Gallery images for several properties at once.
     *
     * <p>Search returns a page of cards that each need their images; fetching
     * them one property at a time is the N+1 this exists to avoid.
     */
    @Query("""
            select image
            from PropertyImage image
            where image.propertyId in :propertyIds
            order by image.propertyId, image.sortOrder asc
            """)
    List<PropertyImage> findAllByPropertyIds(@Param("propertyIds") Collection<UUID> propertyIds);
}
