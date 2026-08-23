package com.khatiyan.d_modules.discovery.api;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.discovery.DiscoveryModule;
import com.khatiyan.d_modules.discovery.api.dto.PropertyContactResponse;

/**
 * The people a listing offers as a way to reach a property.
 *
 * <p>Every mutation returns the whole list rather than the row it touched: the
 * owner is always first and is not stored, so a response carrying one manager
 * would leave the client to reassemble an order it does not own.
 */
@RestController
@RequestMapping("/api/v1/properties/{propertyId}/contacts")
@SuppressWarnings("null")
public class PropertyContactController {

    private final DiscoveryModule discoveryModule;

    public PropertyContactController(DiscoveryModule discoveryModule) {
        this.discoveryModule = discoveryModule;
    }

    @GetMapping
    public List<PropertyContactResponse> listContacts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return discoveryModule.listManagedPropertyContacts(user.userId(), propertyId);
    }

    @PostMapping("/managers/{managerUserId}")
    public List<PropertyContactResponse> addManagerContact(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID managerUserId) {
        return discoveryModule.addPropertyContactManager(user.userId(), propertyId, managerUserId);
    }

    @DeleteMapping("/managers/{managerUserId}")
    public List<PropertyContactResponse> removeManagerContact(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID managerUserId) {
        return discoveryModule.removePropertyContactManager(user.userId(), propertyId, managerUserId);
    }
}
