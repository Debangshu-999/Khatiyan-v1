package com.khatiyan.d_modules.notice.api;

import java.net.URI;
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

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.notice.api.dto.CreatePropertyBoardCategoryRequest;
import com.khatiyan.d_modules.notice.api.dto.CreatePropertyBoardItemRequest;
import com.khatiyan.d_modules.notice.api.dto.PropertyBoardCategoryResponse;
import com.khatiyan.d_modules.notice.api.dto.PropertyBoardItemResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdatePropertyBoardCategoryRequest;
import com.khatiyan.d_modules.notice.api.dto.UpdatePropertyBoardItemRequest;
import com.khatiyan.d_modules.notice.service.PropertyBoardService;

import jakarta.validation.Valid;

/**
 * REST API boundary for stable property board content.
 *
 * <p>The property board holds long-lived property information such as rules,
 * timings, contacts, and recurring instructions. Time-bound announcements use
 * {@link NoticeController} instead.
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}/property-board")
@SuppressWarnings("null")
public class PropertyBoardController {

    private final PropertyBoardService propertyBoardService;

    public PropertyBoardController(PropertyBoardService propertyBoardService) {
        this.propertyBoardService = propertyBoardService;
    }

    // Admin side property board category endpoints

    @PostMapping("/categories")
    public ResponseEntity<PropertyBoardCategoryResponse> createCategory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreatePropertyBoardCategoryRequest request) {
        PropertyBoardCategoryResponse response = propertyBoardService.createCategory(
                user.userId(),
                propertyId,
                request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId
                        + "/property-board/categories/" + response.id()))
                .body(response);
    }

    @GetMapping("/categories")
    public List<PropertyBoardCategoryResponse> listCategories(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return propertyBoardService.listActiveCategories(user.userId(), propertyId);
    }

    @PatchMapping("/categories/{categoryId}")
    public PropertyBoardCategoryResponse updateCategory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID categoryId,
            @Valid @RequestBody UpdatePropertyBoardCategoryRequest request) {
        return propertyBoardService.updateCategory(user.userId(), categoryId, request);
    }

    @DeleteMapping("/categories/{categoryId}")
    public ResponseEntity<Void> deactivateCategory(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID categoryId) {
        propertyBoardService.deactivateCategory(user.userId(), categoryId);
        return ResponseEntity.noContent().build();
    }

    // Admin side property board item endpoints

    @PostMapping("/items")
    public ResponseEntity<PropertyBoardItemResponse> createItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreatePropertyBoardItemRequest request) {
        PropertyBoardItemResponse response = propertyBoardService.createItem(
                user.userId(),
                propertyId,
                request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId
                        + "/property-board/items/" + response.id()))
                .body(response);
    }

    @GetMapping("/items")
    public List<PropertyBoardItemResponse> listItems(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) UUID categoryId) {
        if (categoryId == null) {
            return propertyBoardService.listActiveItems(user.userId(), propertyId);
        }

        return propertyBoardService.listActiveItemsByCategory(user.userId(), propertyId, categoryId);
    }

    @PatchMapping("/items/{itemId}")
    public PropertyBoardItemResponse updateItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID itemId,
            @Valid @RequestBody UpdatePropertyBoardItemRequest request) {
        return propertyBoardService.updateItem(user.userId(), itemId, request);
    }

    @DeleteMapping("/items/{itemId}")
    public ResponseEntity<Void> deactivateItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID itemId) {
        propertyBoardService.deactivateItem(user.userId(), itemId);
        return ResponseEntity.noContent().build();
    }
}
