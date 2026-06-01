package com.khatiyan.c_shared.api;

import java.util.List;

public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext,
        boolean hasPrevious
) {

    public static <T> PageResponse<T> of(List<T> allItems, int page, int size) {
        int normalizedPage = Math.max(page, 0);
        int normalizedSize = Math.max(size, 1);
        int totalElements = allItems.size();
        int totalPages = totalElements == 0
                ? 0
                : (int) Math.ceil((double) totalElements / normalizedSize);

        int fromIndex = normalizedPage * normalizedSize;
        if (fromIndex >= totalElements) {
            return new PageResponse<>(
                    List.of(),
                    normalizedPage,
                    normalizedSize,
                    totalElements,
                    totalPages,
                    false,
                    normalizedPage > 0);
        }

        int toIndex = Math.min(fromIndex + normalizedSize, totalElements);
        List<T> pageItems = allItems.subList(fromIndex, toIndex);

        return new PageResponse<>(
                pageItems,
                normalizedPage,
                normalizedSize,
                totalElements,
                totalPages,
                normalizedPage + 1 < totalPages,
                normalizedPage > 0);
    }
}
