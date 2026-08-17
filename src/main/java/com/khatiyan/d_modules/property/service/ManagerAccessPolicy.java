package com.khatiyan.d_modules.property.service;

import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerPermission;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.property.repository.ManagerPermissionRepository;
import com.khatiyan.d_modules.property.repository.PropertyManagerRepository;
import com.khatiyan.d_modules.property.repository.PropertyRepository;

/**
 * Decides what a manager may see and do on a property.
 *
 * <p>
 * The rules, in order:
 * <ol>
 *   <li><b>The owner has everything.</b> Ownership is not grantable and cannot be
 *       reduced — there is no co-owner concept to reduce it against.</li>
 *   <li>An <b>active manager</b> has exactly what the owner granted them.</li>
 *   <li>Everyone else has nothing.</li>
 * </ol>
 *
 * <p>
 * <b>Absence means NONE.</b> No rows are written for it, so every manager who
 * existed before permissions shipped starts with no access and the owner opts
 * them back in. That is deliberate: a permission system whose default is "all"
 * silently grants power nobody reviewed.
 *
 * <p>
 * <b>Granting is owner-only</b> and is not itself a resource. If it were, a
 * manager holding it could grant themselves the rest and the model would be
 * decorative.
 */
@Service
public class ManagerAccessPolicy {

    private final PropertyRepository propertyRepository;
    private final PropertyManagerRepository propertyManagerRepository;
    private final ManagerPermissionRepository managerPermissionRepository;

    public ManagerAccessPolicy(
            PropertyRepository propertyRepository,
            PropertyManagerRepository propertyManagerRepository,
            ManagerPermissionRepository managerPermissionRepository) {
        this.propertyRepository = propertyRepository;
        this.propertyManagerRepository = propertyManagerRepository;
        this.managerPermissionRepository = managerPermissionRepository;
    }

    @Transactional(readOnly = true)
    public void ensureCanView(UUID actorUserId, UUID propertyId, ManagerResource resource) {
        if (!levelFor(actorUserId, propertyId, resource).canView()) {
            throw new ForbiddenException("You do not have access to this section");
        }
    }

    /**
     * Passes if the actor can view ANY of the given resources.
     *
     * <p>
     * For reference data that several differently-governed screens legitimately
     * need. Exit policies are the case: they are edited under
     * {@code TENANCY_RULES}, but ending a stay ({@code TENANCIES}) and settling a
     * deposit ({@code DEPOSITS}) both have to read the damage schedule and
     * checklist. Gating the read on the editing resource alone would refuse a
     * move-out the manager is allowed to run.
     *
     * <p>
     * Only ever use this for reads. A write belongs to exactly one resource.
     */
    @Transactional(readOnly = true)
    public void ensureCanViewAny(UUID actorUserId, UUID propertyId, ManagerResource... resources) {
        for (ManagerResource resource : resources) {
            if (levelFor(actorUserId, propertyId, resource).canView()) {
                return;
            }
        }
        throw new ForbiddenException("You do not have access to this section");
    }

    @Transactional(readOnly = true)
    public void ensureCanManage(UUID actorUserId, UUID propertyId, ManagerResource resource) {
        ManagerAccessLevel level = levelFor(actorUserId, propertyId, resource);
        if (!level.canManage()) {
            // Distinguished on purpose: "you can look but not change this" is a
            // different problem for the user than "this is not yours".
            throw new ForbiddenException(level.canView()
                    ? "You have view-only access to this section"
                    : "You do not have access to this section");
        }
    }

    @Transactional(readOnly = true)
    public ManagerAccessLevel levelFor(UUID actorUserId, UUID propertyId, ManagerResource resource) {
        if (isOwnerInternal(actorUserId, propertyId)) {
            return ManagerAccessLevel.MANAGE;
        }
        if (!isActiveManager(actorUserId, propertyId)) {
            return ManagerAccessLevel.NONE;
        }

        return managerPermissionRepository
                .findByPropertyIdAndManagerUserId(propertyId, actorUserId)
                .stream()
                .filter(permission -> permission.getResource() == resource)
                .map(ManagerPermission::getAccessLevel)
                .findFirst()
                .orElse(ManagerAccessLevel.NONE);
    }

    /**
     * The actor's level for every resource — what the client needs to decide
     * which sections to render at all.
     *
     * <p>
     * Always complete: every resource appears, NONE included, so the client never
     * has to guess what a missing key means.
     */
    @Transactional(readOnly = true)
    public Map<ManagerResource, ManagerAccessLevel> levelsFor(UUID actorUserId, UUID propertyId) {
        Map<ManagerResource, ManagerAccessLevel> levels = new EnumMap<>(ManagerResource.class);

        if (isOwnerInternal(actorUserId, propertyId)) {
            for (ManagerResource resource : ManagerResource.values()) {
                levels.put(resource, ManagerAccessLevel.MANAGE);
            }
            return levels;
        }

        for (ManagerResource resource : ManagerResource.values()) {
            levels.put(resource, ManagerAccessLevel.NONE);
        }
        if (!isActiveManager(actorUserId, propertyId)) {
            return levels;
        }

        for (ManagerPermission permission : managerPermissionRepository
                .findByPropertyIdAndManagerUserId(propertyId, actorUserId)) {
            levels.put(permission.getResource(), permission.getAccessLevel());
        }
        return levels;
    }

    /** Grants for one manager, for the owner's permission screen. */
    @Transactional(readOnly = true)
    public Map<ManagerResource, ManagerAccessLevel> grantsFor(UUID propertyId, UUID managerUserId) {
        Map<ManagerResource, ManagerAccessLevel> levels = new EnumMap<>(ManagerResource.class);
        for (ManagerResource resource : ManagerResource.values()) {
            levels.put(resource, ManagerAccessLevel.NONE);
        }
        for (ManagerPermission permission : managerPermissionRepository
                .findByPropertyIdAndManagerUserId(propertyId, managerUserId)) {
            levels.put(permission.getResource(), permission.getAccessLevel());
        }
        return levels;
    }

    /**
     * Replaces a manager's grants wholesale. Owner-only — checked by the caller
     * against ownership, never against a resource.
     */
    @Transactional
    public void replaceGrants(
            UUID ownerUserId,
            UUID propertyId,
            UUID managerUserId,
            Map<ManagerResource, ManagerAccessLevel> requested) {
        if (!isOwnerInternal(ownerUserId, propertyId)) {
            throw new ForbiddenException("Only the property owner can change manager permissions");
        }
        if (!isActiveManager(managerUserId, propertyId)) {
            throw new ValidationException("That user is not an active manager of this property");
        }

        Map<ManagerResource, ManagerPermission> existing = new EnumMap<>(ManagerResource.class);
        for (ManagerPermission permission : managerPermissionRepository
                .findByPropertyIdAndManagerUserId(propertyId, managerUserId)) {
            existing.put(permission.getResource(), permission);
        }

        for (ManagerResource resource : ManagerResource.values()) {
            ManagerAccessLevel level = requested.getOrDefault(resource, ManagerAccessLevel.NONE);
            ManagerPermission current = existing.get(resource);

            if (level == ManagerAccessLevel.NONE) {
                // NONE is stored as absence, so revoking means deleting the row.
                if (current != null) {
                    managerPermissionRepository.delete(current);
                }
                continue;
            }

            if (current == null) {
                managerPermissionRepository.save(
                        ManagerPermission.grant(propertyId, managerUserId, resource, level, ownerUserId));
            } else if (current.getAccessLevel() != level) {
                current.changeLevel(level, ownerUserId);
            }
        }
    }

    /** Called when a manager is removed, so re-adding them starts from nothing. */
    @Transactional
    public void clearGrants(UUID propertyId, UUID managerUserId) {
        managerPermissionRepository.deleteByPropertyIdAndManagerUserId(propertyId, managerUserId);
    }

    /** Ownership is the one thing no grant can confer or take away. */
    @Transactional(readOnly = true)
    public boolean isOwner(UUID actorUserId, UUID propertyId) {
        return propertyRepository.existsByIdAndOwnerIdAndActiveTrue(propertyId, actorUserId);
    }

    @Transactional(readOnly = true)
    public void ensureOwner(UUID actorUserId, UUID propertyId) {
        if (!isOwner(actorUserId, propertyId)) {
            throw new ForbiddenException("Only the property owner can do this");
        }
    }

    private boolean isOwnerInternal(UUID actorUserId, UUID propertyId) {
        return propertyRepository.existsByIdAndOwnerIdAndActiveTrue(propertyId, actorUserId);
    }

    private boolean isActiveManager(UUID actorUserId, UUID propertyId) {
        return propertyManagerRepository.existsByPropertyIdAndManagerUserIdAndActiveTrue(propertyId, actorUserId);
    }
}
