import { useState } from "react";

import { useToast } from "@/components/toast";
import { BillReceiptSheet, type ReceiptProperty } from "@/features/billing/bill-receipt-sheet";
import { downloadBillReceipt } from "@/features/billing/download-bill-receipt";
import { useAppSelector } from "@/store/hooks";
import type { BillingCycle } from "@/store/services/billing-api";

/**
 * The tenant's copy of a bill.
 *
 * <p>
 * The owner's receipt, unchanged. It used to be a second layout built from the
 * same numbers — label-and-value blocks rather than the document — which meant a
 * tenant asking about "the receipt" and an owner looking at one were describing
 * two different papers. {@link BillReceiptSheet} is now the single template and
 * this is a name for the tenant's way into it.
 *
 * <p>
 * One thing is withheld rather than reshaped: the letterhead contact is empty.
 * The tenant app does not hold the owner's phone or email, and a letterhead with
 * just the property on it is honest where a guessed number would not be. The
 * PDF the button below fetches DOES carry the owner's contact — the server
 * resolves it from the property, which is the one place that knows it.
 */
export function TenantBillReceiptSheet({
  cycle,
  onClose,
  property,
}: {
  cycle: BillingCycle;
  onClose: () => void;
  property: ReceiptProperty | null;
}) {
  const toast = useToast();
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const apiBaseUrl = useAppSelector((state) => state.appConfig.apiBaseUrl);
  const [downloading, setDownloading] = useState(false);

  /**
   * The same download the owner has.
   *
   * <p>The server renders the PDF and gates it on the same rule as every other
   * read of a bill, so a tenant pulls their own copy and nobody pulls anyone
   * else's — the document is byte-identical to the one the owner sends.
   */
  async function download() {
    if (downloading) {
      return;
    }
    setDownloading(true);
    try {
      await downloadBillReceipt({
        apiBaseUrl,
        billingCycleId: cycle.id,
        fileName: cycle.referenceCode,
        token: accessToken,
      });
      // "Prepared", not "saved". On a phone the file is written to the cache and
      // handed to the system share sheet, and whether it ever reaches storage is
      // the reader's next decision — one they can cancel. Claiming it was saved
      // was a claim the app is in no position to make.
      toast.ok(`Receipt prepared for bill ${cycle.referenceCode}`);
    } catch {
      toast.error("Could not download the receipt. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <BillReceiptSheet
      contact={EMPTY_CONTACT}
      cycle={cycle}
      downloadLabel={downloading ? "Preparing…" : "Download PDF"}
      onClose={onClose}
      onDownload={download}
      property={property}
    />
  );
}

const EMPTY_CONTACT = { email: null, phone: null };
