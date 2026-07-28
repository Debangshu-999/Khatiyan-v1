package com.khatiyan.d_modules.discovery.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.discovery.model.LocalPlaceSubcategory;

public record LocalPlaceSubcategoryResponse(
        UUID id,
        UUID categoryId,
        String name,
        boolean custom,
        int displayOrder) {

    public static LocalPlaceSubcategoryResponse from(LocalPlaceSubcategory subcategory) {
        return new LocalPlaceSubcategoryResponse(
                subcategory.getId(),
                subcategory.getCategoryId(),
                subcategory.getName(),
                subcategory.isCustom(),
                subcategory.getDisplayOrder());
    }
}
