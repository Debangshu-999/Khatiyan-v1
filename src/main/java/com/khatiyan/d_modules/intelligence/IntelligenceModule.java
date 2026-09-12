package com.khatiyan.d_modules.intelligence;

import org.springframework.stereotype.Component;

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

    public IntelligenceModule(IntelligenceProperties properties) {
        this.properties = properties;
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
}
