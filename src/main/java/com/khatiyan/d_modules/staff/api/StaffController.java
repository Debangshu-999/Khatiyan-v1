package com.khatiyan.d_modules.staff.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.property.api.dto.ManagerEmploymentResponse;
import com.khatiyan.d_modules.staff.api.dto.CreateStaffCategoryRequest;
import com.khatiyan.d_modules.staff.api.dto.CreateStaffMemberRequest;
import com.khatiyan.d_modules.staff.api.dto.EmployeeHistoryResponse;
import com.khatiyan.d_modules.staff.api.dto.EndEmploymentRequest;
import com.khatiyan.d_modules.staff.api.dto.SalaryPayableTotalResponse;
import com.khatiyan.d_modules.staff.api.dto.StaffCategoryResponse;
import com.khatiyan.d_modules.staff.api.dto.StaffMemberResponse;
import com.khatiyan.d_modules.staff.api.dto.TerminationPreviewResponse;
import com.khatiyan.d_modules.staff.api.dto.UpdateManagerEmploymentRequest;
import com.khatiyan.d_modules.staff.api.dto.UpdateStaffCategoryRequest;
import com.khatiyan.d_modules.staff.api.dto.UpdateStaffMemberRequest;
import com.khatiyan.d_modules.staff.service.StaffService;

import jakarta.validation.Valid;

/** Owner-only staff directory. Non-manager staff never receive app accounts. */
@RestController
@Validated
@PreAuthorize("hasRole('OWNER')")
@RequestMapping("/api/v1/properties/{propertyId}/staff")
public class StaffController {

    private final StaffService staffService;

    public StaffController(StaffService staffService) {
        this.staffService = staffService;
    }

    @GetMapping("/categories")
    public List<StaffCategoryResponse> listCategories(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return staffService.listCategories(user.userId(), propertyId);
    }

    @GetMapping("/salary-total")
    public SalaryPayableTotalResponse salaryTotal(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return new SalaryPayableTotalResponse(staffService.totalPayableThisMonthPaise(user.userId(), propertyId));
    }

    @PostMapping("/categories")
    public ResponseEntity<StaffCategoryResponse> createCategory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateStaffCategoryRequest request) {
        StaffCategoryResponse response = staffService.createCategory(user.userId(), propertyId, request);
        return ResponseEntity.created(URI.create("/api/v1/properties/" + propertyId + "/staff/categories/" + response.id()))
                .body(response);
    }

    @PatchMapping("/categories/{categoryId}")
    public StaffCategoryResponse updateCategory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID categoryId,
            @Valid @RequestBody UpdateStaffCategoryRequest request) {
        return staffService.updateCategory(user.userId(), propertyId, categoryId, request);
    }

    @DeleteMapping("/categories/{categoryId}")
    public ResponseEntity<Void> deactivateCategory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID categoryId) {
        staffService.deactivateCategory(user.userId(), propertyId, categoryId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/members")
    public List<StaffMemberResponse> listMembers(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "false") boolean includeInactive) {
        return staffService.listMembers(user.userId(), propertyId, includeInactive);
    }

    @PostMapping("/members")
    public ResponseEntity<StaffMemberResponse> createMember(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateStaffMemberRequest request) {
        StaffMemberResponse response = staffService.createMember(user.userId(), propertyId, request);
        return ResponseEntity.created(URI.create("/api/v1/properties/" + propertyId + "/staff/members/" + response.referenceCode()))
                .body(response);
    }

    @PatchMapping("/members/{staffReferenceCode}")
    public StaffMemberResponse updateMember(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String staffReferenceCode,
            @Valid @RequestBody UpdateStaffMemberRequest request) {
        return staffService.updateMember(user.userId(), propertyId, staffReferenceCode, request);
    }

    @GetMapping("/members/{staffReferenceCode}/termination-preview")
    public TerminationPreviewResponse staffTerminationPreview(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String staffReferenceCode) {
        return staffService.staffTerminationPreview(user.userId(), propertyId, staffReferenceCode);
    }

    @PostMapping("/members/{staffReferenceCode}/end")
    public ResponseEntity<Void> endMember(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String staffReferenceCode,
            @Valid @RequestBody EndEmploymentRequest request) {
        staffService.endStaffMember(user.userId(), propertyId, staffReferenceCode, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/managers")
    public List<ManagerEmploymentResponse> listManagers(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return staffService.listManagers(user.userId(), propertyId);
    }

    @PatchMapping("/managers/{managerReferenceCode}")
    public ManagerEmploymentResponse updateManagerEmployment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String managerReferenceCode,
            @Valid @RequestBody UpdateManagerEmploymentRequest request) {
        return staffService.updateManagerEmployment(user.userId(), propertyId, managerReferenceCode, request);
    }

    @GetMapping("/managers/{managerReferenceCode}/termination-preview")
    public TerminationPreviewResponse managerTerminationPreview(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String managerReferenceCode) {
        return staffService.managerTerminationPreview(user.userId(), propertyId, managerReferenceCode);
    }

    @PostMapping("/managers/{managerReferenceCode}/end")
    public ResponseEntity<Void> endManagerEmployment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String managerReferenceCode,
            @Valid @RequestBody EndEmploymentRequest request) {
        staffService.endManagerEmployment(user.userId(), propertyId, managerReferenceCode, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/history")
    public PageResponse<EmployeeHistoryResponse> employeeHistory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return staffService.listEmployeeHistory(user.userId(), propertyId, page, size);
    }
}
