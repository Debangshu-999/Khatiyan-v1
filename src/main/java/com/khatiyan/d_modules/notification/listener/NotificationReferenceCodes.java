package com.khatiyan.d_modules.notification.listener;

import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.concerns.ConcernModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

/**
 * Puts the short codes people can read (BIL-, TEN-, CON-) into a notification's
 * data, so the app shows those and never an internal id (user, 2026-09-30).
 *
 * <p>Notifications used to carry only UUIDs, and the app printed their first
 * eight characters as "Billing cycle ID" or "Tenancy ID": a string nobody can
 * look up, and a leak of how records are keyed. A code that can't be found is
 * left out, and the app then shows no id line at all.
 */
@Component
class NotificationReferenceCodes {

    static final String BILL = "billReferenceCode";
    static final String TENANCY = "tenancyReferenceCode";
    static final String CONCERN = "concernReferenceCode";

    private final BillingModule billingModule;
    private final TenancyModule tenancyModule;
    private final ConcernModule concernModule;

    NotificationReferenceCodes(BillingModule billingModule, TenancyModule tenancyModule, ConcernModule concernModule) {
        this.billingModule = billingModule;
        this.tenancyModule = tenancyModule;
        this.concernModule = concernModule;
    }

    void putBill(Map<String, String> data, UUID billingCycleId) {
        if (billingCycleId != null) {
            billingModule.findCycleReferenceCode(billingCycleId).ifPresent(code -> data.put(BILL, code));
        }
    }

    void putTenancy(Map<String, String> data, UUID tenancyId) {
        if (tenancyId != null) {
            tenancyModule.findById(tenancyId)
                    .map(TenancyResponse::referenceCode)
                    .ifPresent(code -> data.put(TENANCY, code));
        }
    }

    void putConcern(Map<String, String> data, UUID concernId) {
        if (concernId != null) {
            concernModule.findReferenceCode(concernId).ifPresent(code -> data.put(CONCERN, code));
        }
    }
}
