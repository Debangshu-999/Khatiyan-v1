package com.khatiyan.d_modules.staff;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.staff.api.dto.EmployeeActivityItem;
import com.khatiyan.d_modules.staff.api.dto.SalaryPaymentDueItem;
import com.khatiyan.d_modules.staff.service.StaffService;

/**
 * Public facade for the staff module. Other modules (e.g. the dashboard) read
 * staff data through this instead of touching staff services or repositories.
 */
@Component
public class StaffModule {

    private final StaffService staffService;

    public StaffModule(StaffService staffService) {
        this.staffService = staffService;
    }

    /** Recent employee lifecycle (added / removed) for the recent-activity feed. */
    public List<EmployeeActivityItem> listRecentEmployeeActivity(UUID propertyId) {
        return staffService.listRecentEmployeeActivity(propertyId);
    }

    /** Active monthly salary accounts whose current-month salary is unpaid. */
    public List<SalaryPaymentDueItem> listSalaryPaymentDue(LocalDate today) {
        return staffService.listSalaryPaymentDue(today);
    }

    /** Projected total salary payout for a property in a month (the "Est payout"). */
    public long estimatedMonthlySalaryPaise(UUID propertyId, LocalDate month) {
        return staffService.estimatedMonthlySalaryPaise(propertyId, month);
    }
}
