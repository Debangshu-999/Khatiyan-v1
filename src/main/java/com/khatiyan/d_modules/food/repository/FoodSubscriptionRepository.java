package com.khatiyan.d_modules.food.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodSubscription;

/**
 * Plan versions, read by date (2026-09-29). "Covering" a date means the
 * version applies that day: from on or before it, and until after it or open.
 */
@Repository
public interface FoodSubscriptionRepository extends JpaRepository<FoodSubscription, UUID> {

    @Query("""
            SELECT s FROM FoodSubscription s
            WHERE s.propertyId = :propertyId
              AND s.effectiveFrom <= :date
              AND (s.effectiveUntil IS NULL OR s.effectiveUntil > :date)
            """)
    List<FoodSubscription> findCovering(@Param("propertyId") UUID propertyId, @Param("date") LocalDate date);

    @Query("""
            SELECT s FROM FoodSubscription s
            WHERE s.tenancyId = :tenancyId
              AND s.effectiveFrom <= :date
              AND (s.effectiveUntil IS NULL OR s.effectiveUntil > :date)
            """)
    Optional<FoodSubscription> findCoveringForTenancy(
            @Param("tenancyId") UUID tenancyId, @Param("date") LocalDate date);

    /** Versions that start after {@code date}: a change scheduled for tomorrow. */
    List<FoodSubscription> findByTenancyIdAndEffectiveFromAfter(UUID tenancyId, LocalDate date);

    @Query("""
            SELECT COUNT(s) FROM FoodSubscription s
            WHERE s.propertyId = :propertyId
              AND s.effectiveFrom <= :date
              AND (s.effectiveUntil IS NULL OR s.effectiveUntil > :date)
            """)
    long countCovering(@Param("propertyId") UUID propertyId, @Param("date") LocalDate date);

    /** Any plan eats this profile on some day, now or from a scheduled start. */
    @Query("""
            SELECT COUNT(s) > 0 FROM FoodSubscription s JOIN s.days d
            WHERE d = :profileId
              AND (s.effectiveUntil IS NULL OR s.effectiveUntil > :date)
            """)
    boolean isProfileInUse(@Param("profileId") UUID profileId, @Param("date") LocalDate date);
}
