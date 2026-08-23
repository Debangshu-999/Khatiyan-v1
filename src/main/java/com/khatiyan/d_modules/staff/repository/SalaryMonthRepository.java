package com.khatiyan.d_modules.staff.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.staff.model.SalaryMonth;

@Repository
public interface SalaryMonthRepository extends JpaRepository<SalaryMonth, UUID> {

    Optional<SalaryMonth> findBySalaryAccountIdAndPayrollMonth(UUID salaryAccountId, LocalDate payrollMonth);

    List<SalaryMonth> findBySalaryAccountIdOrderByPayrollMonthDesc(UUID salaryAccountId);

    /**
     * Whether the account has any payroll month before this one — false means
     * the given month is its first, i.e. a new employee joining payroll.
     */
    boolean existsBySalaryAccountIdAndPayrollMonthBefore(UUID salaryAccountId, LocalDate payrollMonth);
}
