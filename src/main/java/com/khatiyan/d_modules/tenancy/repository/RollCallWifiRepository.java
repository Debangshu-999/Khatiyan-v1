package com.khatiyan.d_modules.tenancy.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.tenancy.model.RollCallWifi;

@Repository
public interface RollCallWifiRepository extends JpaRepository<RollCallWifi, UUID> {

    List<RollCallWifi> findByPropertyIdOrderByCreatedAtAsc(UUID propertyId);

    boolean existsByPropertyIdAndBssid(UUID propertyId, String bssid);
}
