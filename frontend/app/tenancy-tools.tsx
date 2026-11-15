import { useState } from "react";
import { View } from "react-native";
import { Wrench } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { TenancyToolGrid, useTenancyTools } from "@/features/tenancy/tenancy-tools";

/**
 * Every tool for the tenant's stay (user, 2026-11-10), opened from View more
 * on Home's Tenancy tools card: the tiles only, no summaries under them, and
 * no box around each, the art and the name on the page (user, 2026-11-15).
 */
export default function TenancyToolsScreen() {
  const { tenancyId, tools } = useTenancyTools();
  const [width, setWidth] = useState(0);

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader italicTail="tools." subtitle="Everything for your stay, in one place." title="Tenancy" />
      {!tenancyId ? (
        <EmptyState icon={Wrench} title="No current stay" description="Your tenancy tools appear once your stay has begun." />
      ) : (
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <TenancyToolGrid bare tools={tools} width={width} />
        </View>
      )}
    </ScreenScrollView>
  );
}
