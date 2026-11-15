package com.khatiyan.d_modules.discovery.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.discovery.model.SavedProperty;

@Repository
public interface SavedPropertyRepository extends JpaRepository<SavedProperty, UUID> {

    boolean existsByUserIdAndPropertyId(UUID userId, UUID propertyId);

    /** The properties a person saved, newest first. */
    @Query("""
            select saved.propertyId
            from SavedProperty saved
            where saved.userId = :userId
            order by saved.createdAt desc
            """)
    List<UUID> findPropertyIdsNewestFirst(@Param("userId") UUID userId);

    @Modifying
    @Query("delete from SavedProperty saved where saved.userId = :userId and saved.propertyId = :propertyId")
    int deleteByUserIdAndPropertyId(@Param("userId") UUID userId, @Param("propertyId") UUID propertyId);
}
