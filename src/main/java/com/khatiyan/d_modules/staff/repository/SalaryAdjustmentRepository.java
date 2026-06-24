package com.khatiyan.d_modules.staff.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.staff.model.SalaryAdjustment;

@Repository
public interface SalaryAdjustmentRepository extends JpaRepository<SalaryAdjustment, UUID> {

    List<SalaryAdjustment> findBySalaryMonthIdOrderByCreatedAtAsc(UUID salaryMonthId);
}
