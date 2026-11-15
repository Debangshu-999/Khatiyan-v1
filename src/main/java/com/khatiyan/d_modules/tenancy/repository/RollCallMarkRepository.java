package com.khatiyan.d_modules.tenancy.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.tenancy.model.RollCallMark;

@Repository
public interface RollCallMarkRepository extends JpaRepository<RollCallMark, UUID> {

    Optional<RollCallMark> findByTenancyIdAndNight(UUID tenancyId, LocalDate night);

    List<RollCallMark> findByPropertyIdAndNight(UUID propertyId, LocalDate night);
}
