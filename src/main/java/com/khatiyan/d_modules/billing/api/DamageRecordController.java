package com.khatiyan.d_modules.billing.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.concurrency.RequiresVersion;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.DamageRecordResponse;
import com.khatiyan.d_modules.billing.api.dto.RaiseDamageBillRequest;
import com.khatiyan.d_modules.billing.api.dto.DamageRecordPageResponse;
import com.khatiyan.d_modules.billing.api.dto.RepairDamageRecordRequest;
import com.khatiyan.d_modules.billing.api.dto.SaveDamageRecordRequest;
import com.khatiyan.d_modules.billing.damage.DamageBillService;
import com.khatiyan.d_modules.billing.damage.DamageRecordService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Damage records (2026-10-29): recorded, charged, repaired and replaced by the
 * property's management, read by the tenants they name.
 */
@RestController
@RequestMapping("/api/v1/billing")
@RequiredArgsConstructor
public class DamageRecordController {

    private final DamageRecordService damageRecords;
    private final DamageBillService damageBills;

    @GetMapping("/properties/{propertyId}/damage-records")
    public List<DamageRecordResponse> list(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "false") boolean history) {
        return damageRecords.list(user.userId(), propertyId, history);
    }

    @GetMapping("/properties/{propertyId}/damage-records/page")
    public DamageRecordPageResponse page(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "false") boolean history,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return damageRecords.page(user.userId(), propertyId, history, page, size);
    }

    @PostMapping("/properties/{propertyId}/damage-records")
    public ResponseEntity<DamageRecordResponse> create(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody SaveDamageRecordRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(damageRecords.create(user.userId(), propertyId, request));
    }

    @PatchMapping("/properties/{propertyId}/damage-records/{recordId}")
    @RequiresVersion
    public DamageRecordResponse update(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID recordId,
            @Valid @RequestBody SaveDamageRecordRequest request) {
        return damageRecords.update(user.userId(), propertyId, recordId, request);
    }

    @DeleteMapping("/properties/{propertyId}/damage-records/{recordId}")
    @RequiresVersion
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID recordId) {
        damageRecords.delete(user.userId(), propertyId, recordId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/properties/{propertyId}/damage-records/{recordId}/charge")
    @RequiresVersion
    public DamageRecordResponse charge(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID recordId) {
        return damageRecords.charge(user.userId(), propertyId, recordId);
    }

    @PostMapping("/properties/{propertyId}/damage-records/{recordId}/repair")
    @RequiresVersion
    public DamageRecordResponse repair(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID recordId,
            @Valid @RequestBody RepairDamageRecordRequest request) {
        return damageRecords.repair(user.userId(), propertyId, recordId, request);
    }

    @PostMapping("/properties/{propertyId}/damage-records/{recordId}/replace")
    @RequiresVersion
    public DamageRecordResponse replace(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID recordId,
            @Valid @RequestBody RepairDamageRecordRequest request) {
        return damageRecords.replace(user.userId(), propertyId, recordId, request);
    }

    /** Damage bills at checkout (2026-10-31): raised straight away, and they block the exit until cleared. */
    @PostMapping("/tenancies/{tenancyId}/damage-bill")
    public ResponseEntity<BillingCycleResponse> raiseDamageBill(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId,
            @Valid @RequestBody RaiseDamageBillRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(damageBills.raise(user.userId(), tenancyId, request));
    }

    @PostMapping("/bills/{billId}/charge-from-deposit")
    @RequiresVersion
    public BillingCycleResponse chargeFromDeposit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billId) {
        return damageBills.chargeFromDeposit(user.userId(), billId);
    }

    @PostMapping("/bills/{billId}/move-off-deposit")
    @RequiresVersion
    public BillingCycleResponse moveOffDeposit(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billId) {
        return damageBills.moveOffDeposit(user.userId(), billId);
    }

    @PostMapping("/bills/{billId}/cancel-to-change")
    @RequiresVersion
    public BillingCycleResponse cancelToChange(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billId) {
        return damageBills.cancelToChange(user.userId(), billId);
    }

    /** The records naming one stay: its tenant's own, or the property's management. */
    @GetMapping("/tenancies/{tenancyId}/damage-records")
    public List<DamageRecordResponse> listForTenancy(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return damageRecords.listForTenancy(user.userId(), tenancyId);
    }
}
