import { useLocalSearchParams } from "expo-router";
import { Landmark } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { DepositAccountDetail } from "@/features/billing/deposit-account-ui";
import { useGetMyTenancyDepositQuery } from "@/store/services/billing-api";

/**
 * The tenant's deposit account.
 *
 * <p>
 * The owner's account view, unchanged: the same balance card, the same movement
 * rows, the same type filter and the same empty state. It was a different screen
 * built from the same data — metric tiles and a stack of sunken cards — so a
 * tenant asking about "my deposit" and an owner looking at it were describing two
 * different pages. {@link DepositAccountDetail} is the one account view now.
 *
 * <p>
 * What is missing is what is not the tenant's: no Add or Deduct, and no Settle.
 * Those are passed as callbacks, and passing none renders no action row rather
 * than three greyed buttons — a control that is disabled invites the reader to
 * work out how to enable it, and here there is nothing to work out.
 */
export default function TenancyDepositScreen() {
  const { tenancyId } = useLocalSearchParams<{ tenancyId?: string }>();
  const depositQuery = useGetMyTenancyDepositQuery(tenancyId ?? "", { skip: !tenancyId });
  const deposit = depositQuery.data;

  return (
    <ScreenScrollView>
      <ScreenHeader
        italicTail="account."
        subtitle="Your deposit balance, and every movement on it."
        title="Deposit"
      />

      {depositQuery.isFetching && !deposit ? (
        <>
          <SkeletonCard />
          <SkeletonList rows={3} />
        </>
      ) : deposit ? (
        // canManage stays true: it only greys the action buttons, and there are
        // none here. Passing false would be claiming a permission problem where
        // there is simply nothing on offer.
        <DepositAccountDetail busy={false} canManage deposit={deposit} />
      ) : (
        <EmptyState
          description="Your deposit account opens once the first eligible billing cycle completes."
          icon={Landmark}
          title="Deposit account not open"
        />
      )}
    </ScreenScrollView>
  );
}
