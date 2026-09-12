package com.khatiyan.d_modules.intelligence;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the module's settings.
 *
 * <p>{@code @EnableConfigurationProperties} rather than the {@code @Component}
 * this codebase uses elsewhere, because {@link IntelligenceProperties} is a
 * record. Records bind through their constructor, and a bare {@code @Component}
 * would need setters — which would make a settings object that anything could
 * mutate at runtime. Immutable is the right shape for configuration.
 *
 * <p>Declared inside the module rather than on the application class, so the
 * whole module stays one deletable folder.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(IntelligenceProperties.class)
public class IntelligenceConfiguration {
}
