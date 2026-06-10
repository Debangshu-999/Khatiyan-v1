package com.khatiyan.d_modules.payment.api;

import java.net.URI;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.payment.PaymentModule;
import com.khatiyan.d_modules.payment.api.dto.CreatePaymentOrderRequest;
import com.khatiyan.d_modules.payment.api.dto.PaymentOrderResponse;
import com.khatiyan.d_modules.payment.api.dto.PaymentWebhookEventResponse;
import com.khatiyan.d_modules.payment.api.dto.RecordClientPaymentFailureRequest;
import com.khatiyan.d_modules.payment.api.dto.VerifyProviderPaymentRequest;
import com.khatiyan.d_modules.payment.provider.razorpay.RazorpayPaymentProperties;

import jakarta.validation.Valid;

/**
 * REST API boundary for tenant payment checkout actions.
 *
 * <p>
 * The controller receives the standard {@code Idempotency-Key} header and
 * forwards it into the payment service. Amounts are never accepted from the
 * frontend; the service derives payable amounts from billing cycles.
 */
@SuppressWarnings("null")
@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {

    private final PaymentModule paymentModule;
    private final RazorpayPaymentProperties razorpayPaymentProperties;

    public PaymentController(
            PaymentModule paymentModule,
            RazorpayPaymentProperties razorpayPaymentProperties) {
        this.paymentModule = paymentModule;
        this.razorpayPaymentProperties = razorpayPaymentProperties;
    }

    @PostMapping("/billing-cycles/{billingCycleId}/orders")
    public ResponseEntity<PaymentOrderResponse> createOrderForBillingCycle(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID billingCycleId,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody(required = false) CreatePaymentOrderRequest request) {
        CreatePaymentOrderRequest resolvedRequest = resolveRequest(request, idempotencyKey);
        PaymentOrderResponse response = paymentModule.createOrderForBillingCycle(
                user.userId(),
                billingCycleId,
                resolvedRequest);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .header(HttpHeaders.LOCATION, "/api/v1/payments/orders/" + response.id())
                .location(URI.create("/api/v1/payments/orders/" + response.id()))
                .body(response);
    }

    @PostMapping("/orders/verify")
    public ResponseEntity<PaymentOrderResponse> verifyCheckoutReturn(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody VerifyProviderPaymentRequest request) {
        PaymentOrderResponse response = paymentModule.verifyCheckoutReturn(user.userId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/checkout/verify")
    public ResponseEntity<PaymentOrderResponse> verifyPublicCheckoutReturn(
            @Valid @RequestBody VerifyProviderPaymentRequest request) {
        PaymentOrderResponse response = paymentModule.verifyCheckoutReturnPublic(request);
        return ResponseEntity.ok(response);
    }

    @org.springframework.web.bind.annotation.GetMapping(
            value = "/checkout/{paymentOrderId}",
            produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> checkoutPage(
            @PathVariable UUID paymentOrderId,
            @org.springframework.web.bind.annotation.RequestParam(name = "method", required = false) String method) {
        PaymentOrderResponse order = paymentModule.getCheckoutOrder(paymentOrderId);

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(renderCheckoutPage(order, method));
    }

    @PostMapping("/orders/{paymentOrderId}/client-failure")
    public ResponseEntity<PaymentOrderResponse> recordClientPaymentFailure(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID paymentOrderId,
            @Valid @RequestBody RecordClientPaymentFailureRequest request) {
        PaymentOrderResponse response = paymentModule.recordClientPaymentFailure(
                user.userId(),
                paymentOrderId,
                request);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/webhooks/razorpay")
    public ResponseEntity<PaymentWebhookEventResponse> handleRazorpayWebhook(
            @RequestHeader(name = "X-Razorpay-Signature", required = false) String signature,
            @RequestHeader(name = "X-Razorpay-Event-Id", required = false) String eventId,
            @RequestBody String payloadJson) {
        PaymentWebhookEventResponse response = paymentModule.handleRazorpayWebhook(
                payloadJson,
                signature,
                eventId);
        return ResponseEntity.ok(response);
    }

    private CreatePaymentOrderRequest resolveRequest(
            CreatePaymentOrderRequest request,
            String idempotencyKey) {
        if (request == null) {
            return new CreatePaymentOrderRequest(null, idempotencyKey);
        }

        String resolvedKey = idempotencyKey;
        if (resolvedKey == null || resolvedKey.isBlank()) {
            resolvedKey = request.idempotencyKey();
        }

        return new CreatePaymentOrderRequest(request.provider(), resolvedKey);
    }

    private String renderCheckoutPage(PaymentOrderResponse order, String requestedMethod) {
        String keyId = razorpayPaymentProperties.keyId();
        String providerOrderId = order.providerOrderId();
        if (keyId == null || keyId.isBlank() || providerOrderId == null || providerOrderId.isBlank()) {
            return """
                    <!doctype html>
                    <html>
                      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
                      <body style="font-family:system-ui;padding:24px">
                        <h2>Checkout unavailable</h2>
                        <p>The payment gateway order is not ready. Return to Khatiyan and try again.</p>
                      </body>
                    </html>
                    """;
        }

        String amountText = String.format(Locale.ROOT, "%.2f", order.amountPaise() / 100.0);
        return """
                <!doctype html>
                <html>
                  <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
                    <style>
                      body{margin:0;background:#fff;color:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
                      main{min-height:100vh;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:24px}
                      section{width:100%%;max-width:420px;border:1px solid #e2e8f0;border-radius:20px;padding:24px;box-sizing:border-box}
                      h1{font-size:24px;margin:0 0 8px}
                      p{color:#64748b;line-height:1.5}
                      .amount{color:#1f8a76;font-size:34px;font-weight:900;margin:18px 0}
                      button{width:100%%;min-height:52px;border:0;border-radius:14px;background:#1f8a76;color:#fff;font-weight:900;font-size:16px}
                      #status{margin-top:16px;font-weight:700;color:#64748b}
                    </style>
                  </head>
                  <body>
                    <main>
                      <section>
                        <h1>Khatiyan payment</h1>
                        <p>Order %s</p>
                        <div class="amount">Rs. %s</div>
                        <button id="payButton">Pay securely</button>
                        <p id="status"></p>
                      </section>
                    </main>
                    <script>
                      const statusNode = document.getElementById("status");
                      const checkout = new Razorpay({
                        key: "%s",
                        amount: %d,
                        currency: "%s",
                        name: "Khatiyan",
                        description: "Billing cycle payment",
                        order_id: "%s",
                        %s
                        theme: { color: "#1f8a76" },
                        handler: async function (response) {
                          statusNode.textContent = "Verifying payment...";
                          const verifyResponse = await fetch("/api/v1/payments/checkout/verify", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              providerOrderId: response.razorpay_order_id,
                              providerPaymentId: response.razorpay_payment_id,
                              signature: response.razorpay_signature
                            })
                          });
                          if (verifyResponse.ok) {
                            statusNode.textContent = "Payment verified. Return to Khatiyan and pull to refresh.";
                          } else {
                            statusNode.textContent = "Payment returned, but backend verification failed. Contact support before retrying.";
                          }
                        },
                        modal: {
                          ondismiss: function () {
                            statusNode.textContent = "Checkout closed. Return to Khatiyan to retry.";
                          }
                        }
                      });
                      checkout.on("payment.failed", function (response) {
                        statusNode.textContent = response?.error?.description || "Payment failed. Return to Khatiyan to retry.";
                      });
                      document.getElementById("payButton").addEventListener("click", function () {
                        checkout.open();
                      });
                    </script>
                  </body>
                </html>
                """.formatted(
                escapeHtml(order.referenceCode()),
                amountText,
                escapeJavaScript(keyId),
                order.amountPaise(),
                escapeJavaScript(order.currency()),
                escapeJavaScript(providerOrderId),
                prefillSnippet(requestedMethod));
    }

    /**
     * Builds the Razorpay {@code prefill.method} option from the method the
     * tenant chose on the in-app selection screen. This only preselects the
     * method tab among methods the account already has enabled; it cannot
     * enable a disabled method. Blank/unknown values produce no prefill so
     * Razorpay shows all available methods.
     */
    private String prefillSnippet(String requestedMethod) {
        if (requestedMethod == null) {
            return "";
        }

        String normalized = requestedMethod.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "upi", "card", "netbanking", "wallet" -> "prefill: { method: \"" + normalized + "\" },";
            default -> "";
        };
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }

        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private String escapeJavaScript(String value) {
        if (value == null) {
            return "";
        }

        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "")
                .replace("\r", "");
    }
}
