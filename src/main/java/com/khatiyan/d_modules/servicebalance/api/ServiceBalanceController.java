package com.khatiyan.d_modules.servicebalance.api;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.servicebalance.ServiceBalanceModule;
import com.khatiyan.d_modules.servicebalance.api.dto.CreateTopUpRequest;
import com.khatiyan.d_modules.servicebalance.api.dto.ServiceBalanceEntryResponse;
import com.khatiyan.d_modules.servicebalance.api.dto.ServiceBalanceResponse;
import com.khatiyan.d_modules.servicebalance.api.dto.TopUpResponse;
import com.khatiyan.d_modules.servicebalance.model.ServiceBalanceTopUp;
import com.khatiyan.d_modules.servicebalance.service.ServiceBalanceProperties;

import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import jakarta.validation.Valid;

/**
 * The owner's Service balance.
 *
 * <p>Owner-only, including the reads. Managers run properties but do not hold
 * the purse, and keeping one payer per account is what keeps one refund
 * destination per account.
 */
@RestController
@RequestMapping("/api/v1/service-balance")
public class ServiceBalanceController {

    private static final int MAX_PAGE_SIZE = 50;

    private final ServiceBalanceModule serviceBalanceModule;
    private final ServiceBalanceProperties properties;

    public ServiceBalanceController(
            ServiceBalanceModule serviceBalanceModule, ServiceBalanceProperties properties) {
        this.serviceBalanceModule = serviceBalanceModule;
        this.properties = properties;
    }

    @GetMapping
    public ResponseEntity<ServiceBalanceResponse> summary(@AuthenticationPrincipal UserPrincipal user) {
        return ResponseEntity.ok(serviceBalanceModule.summary(user.userId()));
    }

    @GetMapping("/entries")
    public ResponseEntity<Page<ServiceBalanceEntryResponse>> statement(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        return ResponseEntity.ok(
                serviceBalanceModule.statement(user.userId(), PageRequest.of(Math.max(page, 0), safeSize)));
    }

    @PostMapping("/top-ups")
    public ResponseEntity<TopUpResponse> startTopUp(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreateTopUpRequest request) {
        return ResponseEntity.ok(
                serviceBalanceModule.startTopUp(user.userId(), request.amountPaise(), requestBaseUrl()));
    }

    /**
     * What actually happened to a checkout.
     *
     * <p>The app polls this after the sheet closes instead of believing it. Only
     * the webhook credits, so a sheet reporting success before the webhook lands
     * is simply early, not wrong.
     */
    @GetMapping("/top-ups/{topUpId}")
    public ResponseEntity<TopUpResponse> readTopUp(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID topUpId) {
        return ResponseEntity.ok(serviceBalanceModule.readTopUp(user.userId(), topUpId, requestBaseUrl()));
    }

    /**
     * The page the owner actually pays on, opened in the phone's browser.
     *
     * <p>Public and session-less, because a browser opened by the operating
     * system carries no token. It is addressed by an unguessable id and shows
     * only an amount and a gateway order, which is the same posture the parked
     * tenant checkout page took.
     *
     * <p>Rendered here rather than in the app because Razorpay's checkout is a
     * web SDK. The native module alternative cannot run in Expo Go, which is
     * how this app is developed day to day.
     */
    @GetMapping(value = "/checkout/{topUpId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> checkoutPage(@PathVariable UUID topUpId) {
        ServiceBalanceTopUp topUp = serviceBalanceModule.checkoutTopUp(topUpId);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(renderCheckout(topUp));
    }

    /**
     * The gateway calling us. Public, and authenticated by signature alone.
     *
     * <p>The body is taken as a String and passed through untouched: the
     * signature covers the exact bytes Razorpay sent, and re-serialising parsed
     * JSON would fail every check.
     *
     * <p>The reply says only what was done with the event. A public endpoint
     * that reports whose account it found would be an oracle.
     */
    @PostMapping("/webhooks/razorpay")
    public ResponseEntity<String> razorpayWebhook(
            @RequestHeader(name = "X-Razorpay-Signature", required = false) String signature,
            @RequestBody String rawBody) {
        return ResponseEntity.ok(serviceBalanceModule.handleRazorpayWebhook(rawBody, signature));
    }

    /**
     * The scheme, host and port this very request arrived on.
     *
     * <p>The one address we know the caller's phone can resolve. A configured
     * public base URL overrides it, which is what production should do.
     */
    private String requestBaseUrl() {
        return ServletUriComponentsBuilder.fromCurrentRequest()
                .replacePath(null)
                .replaceQuery(null)
                .build()
                .toUriString();
    }

    /**
     * A single self-contained page: open the gateway, then say what happened.
     *
     * <p>It never claims the money arrived. Only the webhook credits, so the
     * success text says the balance updates shortly and the app shows the truth
     * when the owner returns to it.
     */
    private String renderCheckout(ServiceBalanceTopUp topUp) {
        String amount = "Rs. " + (topUp.getAmountPaise() / 100);
        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <title>Add to Service balance</title>
                  <style>
                    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                           margin: 0; padding: 32px 20px; color: #10151c; background: #f6f7f9; }
                    .card { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 10px;
                            border: 1px solid #e3e6ea; padding: 24px; }
                    h1 { font-size: 20px; margin: 0 0 8px; }
                    p { margin: 0 0 16px; line-height: 1.5; color: #55606d; }
                    .amount { font-size: 28px; font-weight: 600; color: #10151c; margin: 0 0 20px; }
                    button { width: 100%%; padding: 14px; font-size: 16px; border: 0; border-radius: 8px;
                             background: #1f6feb; color: #fff; }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <h1>Add to Service balance</h1>
                    <p class="amount">%s</p>
                    <p id="status">Opening the payment window.</p>
                    <button id="pay" type="button">Pay now</button>
                  </div>
                  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
                  <script>
                    var status = document.getElementById('status');
                    var options = {
                      key: '%s',
                      amount: %d,
                      currency: '%s',
                      order_id: '%s',
                      name: 'Khatiyan',
                      description: 'Service balance top-up',
                      handler: function () {
                        // Never "added to your balance": only the webhook
                        // decides that, and it may land a moment later.
                        status.textContent = 'Payment received. Taking you back to Khatiyan.';
                        document.getElementById('pay').style.display = 'none';
                        goBack('paid');
                      },
                      modal: { ondismiss: function () {
                        status.textContent = 'Payment cancelled. Taking you back to Khatiyan.';
                        goBack('cancelled');
                      } }
                    };
                    // Returning to the app's own scheme is what closes the
                    // in-app browser tab. Without it the owner is left staring
                    // at a finished page with nothing to press.
                    function goBack(outcome) {
                      setTimeout(function () { window.location.href = '%s?status=' + outcome; }, 900);
                    }
                    function start() { new Razorpay(options).open(); }
                    document.getElementById('pay').addEventListener('click', start);
                    start();
                  </script>
                </body>
                </html>
                """.formatted(
                amount,
                properties.getRazorpay().getKeyId(),
                topUp.getAmountPaise(),
                properties.getCurrency(),
                topUp.getProviderOrderId(),
                properties.getReturnUrl());
    }
}
