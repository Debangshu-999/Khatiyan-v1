package com.khatiyan.d_modules.staff.api;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.property.api.dto.ManagerEmploymentResponse;
import com.khatiyan.d_modules.staff.api.dto.SalaryAccountDetailResponse;
import com.khatiyan.d_modules.staff.api.dto.StaffMemberSummary;
import com.khatiyan.d_modules.staff.service.SalaryAccountService;
import com.khatiyan.d_modules.staff.service.StaffService;

/**
 * Read-only staff routes for an assigned manager (not the owner). A manager may
 * view their own employment record and salary account, and a redacted staff
 * directory — but cannot edit anything. The owner-only routes live in
 * {@link StaffController} / {@link SalaryAccountController}. Access is enforced
 * in the service layer (the actor must be an active manager of the property).
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}/staff")
public class StaffSelfController {

    private final StaffService staffService;
    private final SalaryAccountService salaryAccountService;

    public StaffSelfController(StaffService staffService, SalaryAccountService salaryAccountService) {
        this.staffService = staffService;
        this.salaryAccountService = salaryAccountService;
    }

    @GetMapping("/my-employment")
    public ManagerEmploymentResponse myEmployment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return staffService.getMyEmployment(user.userId(), propertyId);
    }

    @GetMapping("/my-salary-account")
    public SalaryAccountDetailResponse mySalaryAccount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return salaryAccountService.getMyAccount(user.userId(), propertyId);
    }

    @GetMapping("/directory")
    public List<StaffMemberSummary> staffDirectory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return staffService.listMembersForManager(user.userId(), propertyId);
    }
}
