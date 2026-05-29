package com.khatiyan.d_modules.payment.provider;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.payment.model.PaymentProviderType;

/**
 * Registry of available payment provider implementations.
 *
 * <p>Spring injects every {@code PaymentProvider} bean. The payment service
 * asks this registry for the provider requested by configuration or payload.
 */
@Component
public class PaymentProviderRegistry {

    private final Map<PaymentProviderType, PaymentProvider> providers;

    public PaymentProviderRegistry(List<PaymentProvider> providerList) {
        this.providers = new EnumMap<>(PaymentProviderType.class);

        for (PaymentProvider provider : providerList) {
            this.providers.put(provider.type(), provider);
        }
    }

    public PaymentProvider get(PaymentProviderType providerType) {
        PaymentProvider provider = providers.get(providerType);
        if (provider == null) {
            throw new ValidationException("Payment provider is not configured: " + providerType);
        }

        return provider;
    }
}
