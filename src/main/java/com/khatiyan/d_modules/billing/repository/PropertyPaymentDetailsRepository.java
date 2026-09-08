package com.khatiyan.d_modules.billing.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.billing.model.PropertyPaymentDetails;

@Repository
public interface PropertyPaymentDetailsRepository extends JpaRepository<PropertyPaymentDetails, UUID> {
}
