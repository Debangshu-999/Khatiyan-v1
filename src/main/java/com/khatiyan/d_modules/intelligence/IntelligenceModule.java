package com.khatiyan.d_modules.intelligence;

import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.intelligence.mealreview.MealReviewAnalyst;

/**
 * The one door into the intelligence module.
 *
 * <p>Empty for now by design. It exists from the first commit so the dependency
 * direction is established before there is anything to depend on: other modules
 * call this, never the services behind it, exactly as they do with
 * {@code BillingModule} and {@code PropertyModule}.
 *
 * <p>Capabilities arrive behind it — smart search first, then owner insights —
 * and each answers whether it is switched on before it does anything.
 */
@Component
public class IntelligenceModule {

    private final IntelligenceProperties properties;
    /** Absent while the module is off. */
    private final ObjectProvider<MealReviewAnalyst> mealReviewAnalyst;

    public IntelligenceModule(IntelligenceProperties properties, ObjectProvider<MealReviewAnalyst> mealReviewAnalyst) {
        this.properties = properties;
        this.mealReviewAnalyst = mealReviewAnalyst;
    }

    /**
     * Whether the module is switched on at all.
     *
     * <p>Callers should ask before offering an AI-backed affordance, so a
     * disabled module reads as a feature that is not there rather than as a
     * button that fails.
     */
    public boolean isEnabled() {
        return properties.enabled();
    }

    /**
     * Whether smart search specifically may run.
     *
     * <p>Both switches, because the master one can be on while this capability
     * is still off — that is how a capability is rolled out without turning the
     * whole module on for everybody.
     */
    public boolean isSmartSearchEnabled() {
        return properties.smartSearchLive();
    }

    /**
     * Reads a week of written meal reviews. Throws if the provider fails or says
     * no, so the caller keeps the owner's turn. Ask {@link #isEnabled()} first.
     */
    public List<MealReviewReading> readMealReviews(MealReviewBrief brief, UUID actorUserId, UUID propertyId) {
        return mealReviewAnalyst.getObject().read(brief, actorUserId, propertyId);
    }
}
