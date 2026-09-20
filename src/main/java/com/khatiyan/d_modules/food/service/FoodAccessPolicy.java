package com.khatiyan.d_modules.food.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerResource;

@Component
public class FoodAccessPolicy {

    private final PropertyModule propertyModule;

    public FoodAccessPolicy(PropertyModule propertyModule) {
        this.propertyModule = propertyModule;
    }

    public void ensureCanView(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanView(actorUserId, propertyId, ManagerResource.FOOD);
    }

    public void ensureCanManage(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.FOOD);
    }
}
