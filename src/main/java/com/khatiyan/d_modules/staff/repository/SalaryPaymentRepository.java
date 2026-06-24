package com.khatiyan.d_modules.staff.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.staff.model.SalaryPayment;

@Repository
public interface SalaryPaymentRepository extends JpaRepository<SalaryPayment, UUID> {

    List<SalaryPayment> findBySalaryMonthIdOrderByPaidOnDesc(UUID salaryMonthId);
}
