"use dom";

type RazorpayFailure = {
  errorCode: string;
  errorDescription: string | null;
  errorReason: string | null;
  errorSource: string | null;
  errorStep: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
};

type RazorpaySuccess = {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
};

type Props = {
  amountPaise: number;
  currency: string;
  description: string;
  dom?: import("expo/dom").DOMProps;
  keyId: string;
  orderReference: string;
  providerOrderId: string;
  tenantName: string;
  tenantPhone?: string | null;
  onClose: () => Promise<void>;
  onFailure: (payload: RazorpayFailure) => Promise<void>;
  onSuccess: (payload: RazorpaySuccess) => Promise<void>;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      on: (eventName: string, callback: (payload: any) => void) => void;
      open: () => void;
    };
  }
}

export default function RazorpayCheckoutDom({
  amountPaise,
  currency,
  description,
  keyId,
  orderReference,
  providerOrderId,
  tenantName,
  tenantPhone,
  onClose,
  onFailure,
  onSuccess,
}: Props) {
  const openCheckout = () => {
    if (!window.Razorpay) {
      void onFailure({
        errorCode: "RAZORPAY_SCRIPT_UNAVAILABLE",
        errorDescription: "Razorpay checkout script did not load.",
        errorReason: null,
        errorSource: "client",
        errorStep: "script_load",
        providerOrderId,
        providerPaymentId: null,
      });
      return;
    }

    const checkout = new window.Razorpay({
      amount: amountPaise,
      currency,
      description,
      handler: (response: any) => {
        void onSuccess({
          providerOrderId: String(response.razorpay_order_id || providerOrderId),
          providerPaymentId: String(response.razorpay_payment_id || ""),
          signature: String(response.razorpay_signature || ""),
        });
      },
      key: keyId,
      modal: {
        ondismiss: () => {
          void onClose();
        },
      },
      name: "Khatiyan",
      order_id: providerOrderId,
      prefill: {
        contact: tenantPhone || undefined,
        name: tenantName,
      },
      theme: {
        color: "#1F8A76",
      },
    });

    checkout.on("payment.failed", (response: any) => {
      const error = response?.error ?? {};
      const metadata = error.metadata ?? {};
      void onFailure({
        errorCode: String(error.code || "CLIENT_PAYMENT_FAILED"),
        errorDescription: error.description ? String(error.description) : "Razorpay checkout reported payment failure.",
        errorReason: error.reason ? String(error.reason) : null,
        errorSource: error.source ? String(error.source) : null,
        errorStep: error.step ? String(error.step) : null,
        providerOrderId: metadata.order_id ? String(metadata.order_id) : providerOrderId,
        providerPaymentId: metadata.payment_id ? String(metadata.payment_id) : null,
      });
    });

    checkout.open();
  };

  return (
    <html>
      <head>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <script src="https://checkout.razorpay.com/v1/checkout.js" />
        <style>{`
          body {
            background: #ffffff;
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
          }

          .shell {
            align-items: center;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 100vh;
            padding: 24px;
            text-align: center;
          }

          .card {
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            box-sizing: border-box;
            max-width: 420px;
            padding: 22px;
            width: 100%;
          }

          .title {
            font-size: 22px;
            font-weight: 800;
            margin: 0 0 8px;
          }

          .subtitle {
            color: #64748b;
            font-size: 14px;
            line-height: 20px;
            margin: 0 0 18px;
          }

          .amount {
            color: #1f8a76;
            font-size: 30px;
            font-weight: 900;
            margin: 0 0 18px;
          }

          button {
            background: #1f8a76;
            border: 0;
            border-radius: 14px;
            color: #ffffff;
            font-size: 16px;
            font-weight: 800;
            min-height: 50px;
            padding: 14px 18px;
            width: 100%;
          }

          .reference {
            color: #94a3b8;
            font-size: 12px;
            margin-top: 14px;
            word-break: break-word;
          }
        `}</style>
      </head>
      <body>
        <div className="shell">
          <div className="card">
            <p className="title">Complete payment</p>
            <p className="subtitle">{description}</p>
            <p className="amount">{formatMoney(amountPaise, currency)}</p>
            <button type="button" onClick={openCheckout}>
              Open Razorpay checkout
            </button>
            <div className="reference">Order {orderReference}</div>
          </div>
        </div>
      </body>
    </html>
  );
}

function formatMoney(amountPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    currency,
    maximumFractionDigits: amountPaise % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(amountPaise / 100);
}
