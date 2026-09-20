package com.khatiyan.d_modules.food.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodSubscription;

@Repository
public interface FoodSubscriptionRepository extends JpaRepository<FoodSubscription, UUID> {

    Optional<FoodSubscription> findByTenantUserIdAndActiveTrue(UUID tenantUserId);

    Optional<FoodSubscription> findByTenancyIdAndActiveTrue(UUID tenancyId);

    List<FoodSubscription> findByPropertyIdAndActiveTrue(UUID propertyId);

    List<FoodSubscription> findByProfileIdAndActiveTrue(UUID profileId);

    long countByPropertyIdAndActiveTrue(UUID propertyId);

    boolean existsByProfileIdAndActiveTrue(UUID profileId);
}
