package com.khatiyan.d_modules.notice.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notice.model.PropertyBoardCategory;

/**
 * Persistence access for configurable property notice board categories.
 */
@Repository
public interface PropertyBoardCategoryRepository extends JpaRepository<PropertyBoardCategory, UUID> {

    @Query("""
        SELECT category
        FROM PropertyBoardCategory category
        WHERE category.id = :id
    """)
    Optional<PropertyBoardCategory> findCategoryById(UUID id);

    @Query("""
        SELECT category
        FROM PropertyBoardCategory category
        WHERE category.propertyId = :propertyId
          AND category.active = true
        ORDER BY category.displayOrder ASC, category.name ASC
    """)
    List<PropertyBoardCategory> findActiveByPropertyId(UUID propertyId);

    @Query("""
        SELECT category
        FROM PropertyBoardCategory category
        WHERE category.propertyId = :propertyId
          AND category.slug = :slug
          AND category.active = true
    """)
    Optional<PropertyBoardCategory> findActiveByPropertyIdAndSlug(UUID propertyId, String slug);
}
