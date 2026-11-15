package com.khatiyan.d_modules.tenancy.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.tenancy.model.RollCallSetting;

/** One row per property, keyed by the property's id. */
@Repository
public interface RollCallSettingRepository extends JpaRepository<RollCallSetting, UUID> {
}
