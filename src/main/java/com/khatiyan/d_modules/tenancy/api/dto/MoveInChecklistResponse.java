package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.d_modules.tenancy.model.MoveInChecklist;

/**
 * A stay's move-in checklist, for its tenant and for management.
 *
 * <p>{@code status} adds ACCEPTED_BY_DEFAULT to the stored answer: a checklist
 * the tenant left unanswered for 48 hours reads as accepted.
 */
public record MoveInChecklistResponse(
        UUID tenancyId,
        List<Item> items,
        Integer keysHandedOver,
        Instant recordedAt,
        Instant respondBy,
        String status,
        String tenantNote,
        Instant respondedAt,
        /** True for the stay's tenant while they may still answer. */
        boolean canRespond,
        /** NA to D3 and what each means at this property, for the levels shown. */
        List<com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse.DamageLevelView> levels) {

    public record Item(String name, DamageLevel damageLevel, String note, boolean custom, List<String> photoUrls,
            com.khatiyan.d_modules.tenancy.model.MoveInSection section) {
    }

    public static MoveInChecklistResponse from(MoveInChecklist checklist, Instant now, boolean viewerIsTenant,
            List<com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse.DamageLevelView> levels) {
        boolean byDefault = checklist.acceptedByDefault(now);
        return new MoveInChecklistResponse(
                checklist.getTenancyId(),
                checklist.getItems().stream()
                        .map(item -> new Item(item.getName(), item.getDamageLevel(), item.getNote(), item.isCustom(),
                                List.copyOf(item.getPhotoUrls()), item.getSection()))
                        .toList(),
                checklist.getKeysHandedOver(),
                checklist.getRecordedAt(),
                checklist.respondBy(),
                byDefault ? "ACCEPTED_BY_DEFAULT" : checklist.getTenantResponse().name(),
                checklist.getTenantNote(),
                checklist.getRespondedAt(),
                viewerIsTenant && !byDefault && checklist.getTenantResponse() == com.khatiyan.d_modules.tenancy.model.MoveInResponse.PENDING,
                levels);
    }
}
