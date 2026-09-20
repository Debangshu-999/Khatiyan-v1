package com.khatiyan.d_modules.food.api;

import java.net.URI;
import java.time.LocalDate;
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
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse;
import com.khatiyan.d_modules.food.api.dto.FoodItemResponse;
import com.khatiyan.d_modules.food.api.dto.FoodMenuEntryResponse;
import com.khatiyan.d_modules.food.api.dto.FoodModuleOverviewResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileMenuResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileSubscriberSummaryResponse;
import com.khatiyan.d_modules.food.api.dto.FoodSubscriberResponse;
import com.khatiyan.d_modules.food.api.dto.MarkItemUnavailableRequest;
import com.khatiyan.d_modules.food.api.dto.SaveFoodItemRequest;
import com.khatiyan.d_modules.food.api.dto.SaveFoodMenuEntryRequest;
import com.khatiyan.d_modules.food.api.dto.SaveFoodProfileRequest;
import com.khatiyan.d_modules.food.api.dto.UpdateFoodModuleStatusRequest;
import com.khatiyan.d_modules.food.service.FoodCatalogService;
import com.khatiyan.d_modules.food.service.FoodForecastService;
import com.khatiyan.d_modules.food.service.FoodMenuService;
import com.khatiyan.d_modules.food.service.FoodSubscriptionService;
import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/properties/{propertyId}/food")
@SuppressWarnings("null")
public class FoodManagementController {

    private final FoodCatalogService catalogService;
    private final FoodMenuService menuService;
    private final FoodSubscriptionService subscriptionService;
    private final FoodForecastService forecastService;

    public FoodManagementController(
            FoodCatalogService catalogService,
            FoodMenuService menuService,
            FoodSubscriptionService subscriptionService,
            FoodForecastService forecastService) {
        this.catalogService = catalogService;
        this.menuService = menuService;
        this.subscriptionService = subscriptionService;
        this.forecastService = forecastService;
    }

    @GetMapping
    public FoodModuleOverviewResponse overview(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return catalogService.overview(user.userId(), propertyId);
    }

    @PatchMapping("/status")
    public FoodModuleOverviewResponse updateStatus(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdateFoodModuleStatusRequest request) {
        return catalogService.updateStatus(user.userId(), propertyId, request);
    }

    @PostMapping("/items")
    public ResponseEntity<FoodItemResponse> createItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody SaveFoodItemRequest request) {
        FoodItemResponse response = catalogService.createItem(user.userId(), propertyId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId + "/food/items/" + response.id()))
                .body(response);
    }

    @GetMapping("/items")
    public List<FoodItemResponse> listItems(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return catalogService.listItems(user.userId(), propertyId);
    }

    @PatchMapping("/items/{itemId}")
    public FoodItemResponse updateItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID itemId,
            @Valid @RequestBody SaveFoodItemRequest request) {
        return catalogService.updateItem(user.userId(), itemId, request);
    }

    @PostMapping("/items/{itemId}/reactivate")
    public FoodItemResponse reactivateItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID itemId) {
        return catalogService.reactivateItem(user.userId(), itemId);
    }

    /**
     * Removes a retired item from the owner's list.
     *
     * <p>Soft: the row stays so the menu history referencing it survives. The
     * path says "remove" rather than sitting on DELETE /items/{id}, which is
     * already taken by retiring — two different acts needing two doors.
     */
    @DeleteMapping("/items/{itemId}/remove")
    public ResponseEntity<Void> deleteItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID itemId) {
        catalogService.deleteItem(user.userId(), itemId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/items/{itemId}")
    public ResponseEntity<Void> deactivateItem(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID itemId) {
        catalogService.deactivateItem(user.userId(), itemId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/profiles")
    public ResponseEntity<FoodProfileResponse> createProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody SaveFoodProfileRequest request) {
        FoodProfileResponse response = catalogService.createProfile(user.userId(), propertyId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId + "/food/profiles/" + response.id()))
                .body(response);
    }

    @GetMapping("/profiles")
    public List<FoodProfileResponse> listProfiles(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return catalogService.listProfiles(user.userId(), propertyId);
    }

    @GetMapping("/profiles/subscriber-counts")
    public List<FoodProfileSubscriberSummaryResponse> subscriberCounts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return subscriptionService.subscriberCounts(user.userId(), propertyId);
    }

    @GetMapping("/subscribers")
    public List<FoodSubscriberResponse> subscribers(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return subscriptionService.subscribers(user.userId(), propertyId);
    }

    @PatchMapping("/profiles/{profileId}")
    public FoodProfileResponse updateProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID profileId,
            @Valid @RequestBody SaveFoodProfileRequest request) {
        return catalogService.updateProfile(user.userId(), profileId, request);
    }

    @DeleteMapping("/profiles/{profileId}")
    public ResponseEntity<Void> deactivateProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID profileId) {
        catalogService.deactivateProfile(user.userId(), profileId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/profiles/{profileId}/menu")
    public ResponseEntity<FoodMenuEntryResponse> createMenuEntry(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID profileId,
            @Valid @RequestBody SaveFoodMenuEntryRequest request) {
        FoodMenuEntryResponse response =
                menuService.create(user.userId(), propertyId, profileId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/properties/" + propertyId
                        + "/food/menu/" + response.id()))
                .body(response);
    }

    @GetMapping("/profiles/{profileId}/menu")
    public FoodProfileMenuResponse listMenu(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID profileId) {
        return menuService.list(user.userId(), propertyId, profileId);
    }

    @PatchMapping("/menu/{entryId}")
    public FoodMenuEntryResponse updateMenuEntry(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID entryId,
            @Valid @RequestBody SaveFoodMenuEntryRequest request) {
        return menuService.update(user.userId(), entryId, request);
    }

    @DeleteMapping("/menu/{entryId}")
    public ResponseEntity<Void> deactivateMenuEntry(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID entryId) {
        menuService.deactivate(user.userId(), entryId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Takes an item off ONE date's cooking, leaving the weekly menu alone.
     *
     * <p>Reversible by the DELETE below, and the forecast keeps returning the
     * item under `unavailableItems` so there is always something to press.
     */
    @PostMapping("/forecast/unavailable")
    public ResponseEntity<Void> markUnavailable(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody MarkItemUnavailableRequest request) {
        forecastService.markUnavailable(
                user.userId(), propertyId, request.date(), request.mealType(), request.itemId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/forecast/unavailable")
    public ResponseEntity<Void> markAvailable(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam UUID itemId,
            @RequestParam LocalDate date,
            @RequestParam MealType mealType) {
        forecastService.markAvailable(user.userId(), propertyId, date, mealType, itemId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/forecast")
    public CookingForecastResponse forecast(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam LocalDate date,
            @RequestParam MealType mealType) {
        return forecastService.forecast(user.userId(), propertyId, date, mealType);
    }
}
