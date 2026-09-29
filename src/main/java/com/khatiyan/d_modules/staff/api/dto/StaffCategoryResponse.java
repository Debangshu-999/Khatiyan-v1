package com.khatiyan.d_modules.staff.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.staff.model.StaffCategory;

public record StaffCategoryResponse(
        UUID id,
        String name,
        String systemKey,
        boolean system,
        boolean active,
        /** The row's version (2026-09-29): sent back as If-Match when a screen acts on it. */
        long version
) {

    public static StaffCategoryResponse from(StaffCategory category) {
        return new StaffCategoryResponse(
                category.getId(),
                category.getName(),
                category.getSystemKey(),
                category.isSystem(),
                category.isActive(), category.getVersion());
    }
}
