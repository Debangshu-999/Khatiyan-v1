package com.khatiyan.d_modules.servicebalance.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import com.khatiyan.c_shared.exception.BusinessException;
import com.khatiyan.d_modules.servicebalance.model.ServiceCode;

/**
 * Runtime configuration for the Service balance.
 *
 * <p>The bounds are deliberately modest. This balance buys identity checks
 * costing a few rupees each, so a large top-up serves nobody and only makes a
 * refund conversation bigger.
 */
@Component
@ConfigurationProperties(prefix = "app.service-balance")
public class ServiceBalanceProperties {

    private boolean enabled = false;
    private String currency = "INR";
    private long minTopUpPaise = 10_000L;
    private long maxTopUpPaise = 2_500_000L;
    private List<Long> quickAmountsPaise = List.of(50_000L, 100_000L, 250_000L);
    private int checkoutExpiryMinutes = 30;
    /**
     * How much an owner may owe before services stop.
     *
     * <p>A service may run on an empty balance so that nobody is stranded
     * mid-onboarding, which means we carry the provider's bill until the next
     * top-up. This is the ceiling on that exposure.
     */
    private long maxOutstandingPaise = 25_000L;
    /**
     * How far ahead an owner may commit beyond what they have paid in.
     *
     * <p>Dues plus every ordered-but-unused attempt, less the balance. The dues
     * ceiling cannot see this on its own: ordering checks creates no debt until
     * a tenant actually runs one, so an owner can sit under the ceiling on every
     * individual order and still have several times it waiting to land.
     *
     * <p>Rs 1,000 is roughly sixty checks ahead of their balance, which is more
     * than any honest onboarding queue and far less than a bad month.
     */
    private long maxExposurePaise = 100_000L;
    /**
     * What each service costs, keyed by {@link ServiceCode} name.
     *
     * <p>Configuration rather than constants: prices change, and a charge made
     * last month must not start looking wrong the day one does.
     */
    private Map<String, Long> pricesPaise = new HashMap<>(Map.of(ServiceCode.AADHAAR_OKYC.name(), 1_500L));
    /**
     * Where this server is reachable from the owner's phone browser.
     *
     * <p><b>Blank on purpose.</b> Left empty, the checkout link is built from
     * the host the APP just reached us on, which is the one host we know that
     * phone can resolve — a LAN address over Wi-Fi, an adb-tunnelled localhost
     * over USB, or a tunnel domain.
     *
     * <p>A fixed default was worse than useless: it said localhost, and on a
     * phone connected over Wi-Fi localhost is the phone itself, so the checkout
     * page loaded nothing at all.
     *
     * <p>Set it in production, where the domain is known and a forged Host
     * header should not decide where owners are sent to pay.
     */
    private String publicBaseUrl = "";
    /**
     * Where the checkout page sends the payer when it is finished.
     *
     * <p>The app's own scheme. Redirecting to it is what closes the in-app
     * browser tab, and it brings the phone's browser back to the app too.
     */
    private String returnUrl = "khatiyan://service-balance";
    private final Razorpay razorpay = new Razorpay();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public long getMaxExposurePaise() {
        return maxExposurePaise;
    }

    public void setMaxExposurePaise(long maxExposurePaise) {
        this.maxExposurePaise = maxExposurePaise;
    }

    public long getMinTopUpPaise() {
        return minTopUpPaise;
    }

    public void setMinTopUpPaise(long minTopUpPaise) {
        this.minTopUpPaise = minTopUpPaise;
    }

    public long getMaxTopUpPaise() {
        return maxTopUpPaise;
    }

    public void setMaxTopUpPaise(long maxTopUpPaise) {
        this.maxTopUpPaise = maxTopUpPaise;
    }

    public List<Long> getQuickAmountsPaise() {
        return quickAmountsPaise;
    }

    public void setQuickAmountsPaise(List<Long> quickAmountsPaise) {
        this.quickAmountsPaise = quickAmountsPaise;
    }

    public int getCheckoutExpiryMinutes() {
        return checkoutExpiryMinutes;
    }

    public void setCheckoutExpiryMinutes(int checkoutExpiryMinutes) {
        this.checkoutExpiryMinutes = checkoutExpiryMinutes;
    }

    public String getPublicBaseUrl() {
        return publicBaseUrl;
    }

    public void setPublicBaseUrl(String publicBaseUrl) {
        this.publicBaseUrl = publicBaseUrl;
    }

    public String getReturnUrl() {
        return returnUrl;
    }

    public void setReturnUrl(String returnUrl) {
        this.returnUrl = returnUrl;
    }

    public long getMaxOutstandingPaise() {
        return maxOutstandingPaise;
    }

    public void setMaxOutstandingPaise(long maxOutstandingPaise) {
        this.maxOutstandingPaise = maxOutstandingPaise;
    }

    public Map<String, Long> getPricesPaise() {
        return pricesPaise;
    }

    public void setPricesPaise(Map<String, Long> pricesPaise) {
        this.pricesPaise = pricesPaise;
    }

    /** What this service costs today. */
    public long priceOf(ServiceCode service) {
        Long price = pricesPaise.get(service.name());
        if (price == null || price <= 0) {
            throw new BusinessException(
                    "SERVICE_PRICE_MISSING", "That service is not available yet. Please try again later.");
        }
        return price;
    }

    public Razorpay getRazorpay() {
        return razorpay;
    }

    /** Same gateway account as the parked payment module, read under our own key. */
    public static class Razorpay {

        private String keyId = "";
        private String keySecret = "";
        private String webhookSecret = "";
        private String baseUrl = "https://api.razorpay.com/v1";

        public String getKeyId() {
            return keyId;
        }

        public void setKeyId(String keyId) {
            this.keyId = keyId;
        }

        public String getKeySecret() {
            return keySecret;
        }

        public void setKeySecret(String keySecret) {
            this.keySecret = keySecret;
        }

        public String getWebhookSecret() {
            return webhookSecret;
        }

        public void setWebhookSecret(String webhookSecret) {
            this.webhookSecret = webhookSecret;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public boolean isConfigured() {
            return !keyId.isBlank() && !keySecret.isBlank();
        }
    }
}
