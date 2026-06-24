package com.khatiyan.d_modules.staff.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.staff.model.StaffCategory;

public record StaffCategoryResponse(
        UUID id,
        String name,
        String systemKey,
        boolean system,
        boolean active) {

    public static StaffCategoryResponse from(StaffCategory category) {
        return new StaffCategoryResponse(
                category.getId(),
                category.getName(),
                category.getSystemKey(),
                category.isSystem(),
                category.isActive());
    }
}
