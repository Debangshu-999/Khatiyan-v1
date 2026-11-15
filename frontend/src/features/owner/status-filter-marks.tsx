import type { ComponentType } from "react";
import { View } from "react-native";
import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  CalendarX2,
  Check,
  Clock3,
  FileSignature,
  History,
  Home,
  Hourglass,
  ListFilter,
  LogOut,
  X,
  type LucideProps,
} from "lucide-react-native";

import { UnpaidBillGlyph } from "@/components/billing-vector-icons";
import { useTheme } from "@/theme/use-theme";

function Disc({ color, glyphSize = 13, icon: Icon }: { color: string; glyphSize?: number; icon: ComponentType<LucideProps> }) {
  return (
    <View style={{ alignItems: "center", backgroundColor: color, borderRadius: 999, height: 22, justifyContent: "center", width: 22 }}>
      <Icon color="#FFFFFF" size={glyphSize} strokeWidth={glyphSize > 13 ? 2.2 : 2.6} />
    </View>
  );
}

/** "All", in a filter of coloured marks. */
export function AllMark() {
  const { colors } = useTheme();
  return <Disc color={colors.muted} icon={ListFilter} />;
}

/**
 * The coloured marks in the Tenancy and Billing status filters, like the notice
 * priority picker (user, 2026-10-31). A status mark is a filled disc with a white
 * glyph.
 */
export function StayStatusMark({ value }: { value: string }) {
  const { colors } = useTheme();
  switch (value) {
    case "ALL":
      return <AllMark />;
    case "ACTIVE":
      return <Disc color={colors.jade} icon={Check} />;
    case "ON_NOTICE":
      return <Disc color={colors.warning} icon={BellRing} />;
    case "ENDS_TODAY":
      return <Disc color={colors.danger} icon={CalendarX2} />;
    case "ENDS_SOON":
      return <Disc color={colors.warning} icon={CalendarClock} />;
    case "PENDING_EXIT":
      return <Disc color={colors.danger} icon={AlertTriangle} />;
    case "PENDING_ACCEPTANCE":
      return <Disc color={colors.primary} icon={FileSignature} />;
    default:
      return null;
  }
}

export function BillStatusMark({ value }: { value: string }) {
  const { colors } = useTheme();
  switch (value) {
    case "ALL":
      return <AllMark />;
    case "UPCOMING":
      return <Disc color={colors.primary} icon={CalendarClock} />;
    case "UNPAID":
      return <Disc color={colors.warning} glyphSize={16} icon={UnpaidBillGlyph} />;
    case "OVERDUE":
      return <Disc color={colors.danger} icon={AlertTriangle} />;
    case "CONFIRMATION_PENDING":
      return <Disc color={colors.primary} icon={Hourglass} />;
    case "PAID":
      return <Disc color={colors.jade} icon={Check} />;
    case "LATE_PAY":
      return <Disc color={colors.warning} icon={Clock3} />;
    default:
      return null;
  }
}

/** The other filters' choices, each in the same coloured mark. Months and years have none. */
export function FilterMark({ value }: { value: string }) {
  const { colors } = useTheme();
  switch (value) {
    case "ALL":
      return <AllMark />;
    case "PAID":
    case "APPROVED":
    case "ACTIVE":
      return <Disc color={colors.jade} icon={Check} />;
    case "UNPAID":
      return <Disc color={colors.warning} glyphSize={16} icon={UnpaidBillGlyph} />;
    case "OVERDUE":
      return <Disc color={colors.danger} icon={AlertTriangle} />;
    case "CONFIRMATION_PENDING":
      return <Disc color={colors.primary} icon={Hourglass} />;
    case "REJECTED":
      return <Disc color={colors.danger} icon={X} />;
    case "CURRENT":
      return <Disc color={colors.primary} icon={Home} />;
    case "PAST":
      return <Disc color={colors.muted} icon={History} />;
    case "EXIT":
      return <Disc color={colors.warning} icon={LogOut} />;
    case "ROOM_CHANGE":
      return <Disc color={colors.primary} icon={ArrowLeftRight} />;
    case "INACTIVE":
      return <Disc color={colors.muted} icon={Archive} />;
    default:
      return null;
  }
}
