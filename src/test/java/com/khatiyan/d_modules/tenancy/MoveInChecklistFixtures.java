package com.khatiyan.d_modules.tenancy;

import java.util.List;

import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput;

/** Move-in checklists for tests that onboard a monthly stay, now that one is required (2026-10-29). */
public final class MoveInChecklistFixtures {

    private MoveInChecklistFixtures() {
    }

    /** The least a monthly move-in records: one item, undamaged, photographed, one key. */
    public static MoveInChecklistInput minimalChecklist() {
        return new MoveInChecklistInput(
                List.of(new MoveInChecklistInput.ItemInput(
                        "Cupboard", DamageLevel.NA, com.khatiyan.d_modules.tenancy.model.ItemCondition.WORKING, null, false,
                        List.of("https://res.cloudinary.com/x/cupboard.jpg"), null)),
                1);
    }
}
