package com.khatiyan.d_modules.staff.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.staff.model.SalaryPayment;

@Repository
public interface SalaryPaymentRepository extends JpaRepository<SalaryPayment, UUID> {

    List<SalaryPayment> findBySalaryMonthIdOrderByPaidOnDesc(UUID salaryMonthId);

    /**
     * Every payment made on one salary account — an employee's payslips.
     *
     * <p>A payment hangs off a salary MONTH, and a month hangs off the account,
     * so reaching an employee's payments means walking both hops. Joining here
     * keeps that walk in one query rather than fetching months and then looping.
     */
    @Query("""
        SELECT payment
        FROM SalaryPayment payment
        JOIN SalaryMonth month ON month.id = payment.salaryMonthId
        WHERE month.salaryAccountId = :salaryAccountId
        ORDER BY payment.paidOn DESC, payment.createdAt DESC
    """)
    List<SalaryPayment> findBySalaryAccountId(UUID salaryAccountId);

    /** Every salary payment across a property, newest first. */
    @Query("""
        SELECT payment
        FROM SalaryPayment payment
        JOIN SalaryMonth month ON month.id = payment.salaryMonthId
        JOIN SalaryAccount account ON account.id = month.salaryAccountId
        WHERE account.propertyId = :propertyId
        ORDER BY payment.paidOn DESC, payment.createdAt DESC
    """)
    List<SalaryPayment> findByPropertyId(UUID propertyId);

    /**
     * The same property-wide list, paired with each payment's month and account
     * so a caller can name the employee without a second round of lookups.
     */
    @Query("""
        SELECT payment, month, account
        FROM SalaryPayment payment
        JOIN SalaryMonth month ON month.id = payment.salaryMonthId
        JOIN SalaryAccount account ON account.id = month.salaryAccountId
        WHERE account.propertyId = :propertyId
        ORDER BY payment.paidOn DESC, payment.createdAt DESC
    """)
    List<Object[]> findPropertyPaymentsWithContext(UUID propertyId);
}
