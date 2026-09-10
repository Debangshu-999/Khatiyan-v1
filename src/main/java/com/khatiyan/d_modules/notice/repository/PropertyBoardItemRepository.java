package com.khatiyan.d_modules.notice.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notice.model.PropertyBoardItem;

/**
 * Persistence access for property board items.
 *
 * <p>Queries are explicit so board filtering stays readable as the dashboard
 * grows beyond simple CRUD.
 */
@Repository
public interface PropertyBoardItemRepository extends JpaRepository<PropertyBoardItem, UUID> {

    @Query("""
        SELECT item
        FROM PropertyBoardItem item
        WHERE item.id = :id
    """)
    Optional<PropertyBoardItem> findBoardItemById(UUID id);

    @Query("""
        SELECT item
        FROM PropertyBoardItem item
        WHERE item.propertyId = :propertyId
          AND item.active = true
        ORDER BY item.displayOrder ASC, item.createdAt ASC
    """)
    List<PropertyBoardItem> findActiveByPropertyId(UUID propertyId);

    /**
     * Tenant ordering is activity-led: the most recently maintained category
     * comes first, while the owner's item order is retained inside it.
     */
    @Query("""
        SELECT item
        FROM PropertyBoardItem item
        JOIN FETCH item.category category
        WHERE item.propertyId = :propertyId
          AND item.active = true
          AND category.active = true
        ORDER BY category.updatedAt DESC,
                 category.createdAt DESC,
                 category.id ASC,
                 item.displayOrder ASC,
                 item.createdAt ASC,
                 item.id ASC
    """)
    List<PropertyBoardItem> findActiveForTenantByPropertyId(UUID propertyId);

    @Query("""
        SELECT item
        FROM PropertyBoardItem item
        WHERE item.propertyId = :propertyId
          AND item.category.id = :categoryId
          AND item.active = true
        ORDER BY item.displayOrder ASC, item.createdAt ASC
    """)
    List<PropertyBoardItem> findActiveByPropertyIdAndCategoryId(
            UUID propertyId,
            UUID categoryId);
}
