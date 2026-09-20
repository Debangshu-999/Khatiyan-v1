package com.khatiyan.d_modules.food.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.food.model.FoodProfile;

@Repository
public interface FoodProfileRepository extends JpaRepository<FoodProfile, UUID> {

    Optional<FoodProfile> findByIdAndActiveTrue(UUID id);

    Optional<FoodProfile> findByPropertyIdAndNameIgnoreCaseAndActiveTrue(UUID propertyId, String name);

    List<FoodProfile> findByPropertyIdAndActiveTrueOrderByDisplayOrderAscNameAsc(UUID propertyId);

    long countByPropertyIdAndActiveTrue(UUID propertyId);
}
