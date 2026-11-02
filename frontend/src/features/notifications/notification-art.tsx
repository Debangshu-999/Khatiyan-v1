import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { artworkIcon } from "@/components/artwork-icon";
import type { NotificationItem } from "@/store/services/notification-api";

/*
 * Real objects in full colour, one per kind of notification (user, 2026-10-31).
 * The second number is how much of each file's canvas is actually drawing, so
 * they all land at the same size on the card.
 */
const TenancyArt = artworkIcon(require("../../../assets/images/workspace/tenancy-module.png"), 0.91);
const BillingArt = artworkIcon(require("../../../assets/images/workspace/billing-module.png"), 0.88);
const WalletArt = artworkIcon(require("../../../assets/images/workspace/service-balance-purple-wallet.png"), 0.98);
const ConcernArt = artworkIcon(require("../../../assets/images/workspace/concern-module.png"), 0.88);
const NoticeArt = artworkIcon(require("../../../assets/icons/workspace/notice-module.png"), 0.64);
const PropertyArt = artworkIcon(require("../../../assets/images/workspace/property-module.png"), 0.86);
const BookingArt = artworkIcon(require("../../../assets/icons/home-tools/bookings.png"), 0.85);
const VisitArt = artworkIcon(require("../../../assets/images/workspace/manage_visits.png"), 0.96);
const EnquiryArt = artworkIcon(require("../../../assets/icons/home-tools/property-leads.png"), 0.87);
const MealArt = artworkIcon(require("../../../assets/images/workspace/food-preference-module-card.png"), 0.88);
const StaffArt = artworkIcon(require("../../../assets/images/workspace/staff-module.png"), 0.97);

/** No artwork exists for these three, so they are drawn to sit beside the pictures. */
function ChatArt({ size = 24 }: LucideProps) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="chatFill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#60A5FA" />
          <Stop offset="1" stopColor="#1D4ED8" />
        </LinearGradient>
      </Defs>
      <Path d="M16 8h32a12 12 0 0 1 12 12v18a12 12 0 0 1-12 12H30L16 60V50a12 12 0 0 1-12-12V20A12 12 0 0 1 16 8Z" fill="url(#chatFill)" />
      <Circle cx={20} cy={29} fill="#FFFFFF" r={4.5} />
      <Circle cx={32} cy={29} fill="#FFFFFF" r={4.5} />
      <Circle cx={44} cy={29} fill="#FFFFFF" r={4.5} />
    </Svg>
  );
}

function BellArt({ size = 24 }: LucideProps) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="bellFill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FDE68A" />
          <Stop offset="1" stopColor="#D97706" />
        </LinearGradient>
      </Defs>
      <Circle cx={32} cy={8} fill="#B45309" r={5} />
      <Path d="M24 50a8 8 0 0 0 16 0Z" fill="#92400E" />
      <Path d="M32 8c-11 0-18 8-18 19 0 11-3 15-7 19-1.5 1.5-.5 5 2 5h46c2.5 0 3.5-3.5 2-5-4-4-7-8-7-19C50 16 43 8 32 8Z" fill="url(#bellFill)" />
    </Svg>
  );
}

export function PersonArt({ size = 24 }: LucideProps) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="personFill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#60A5FA" />
          <Stop offset="1" stopColor="#1D4ED8" />
        </LinearGradient>
        <LinearGradient id="personSkin" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FCD9BD" />
          <Stop offset="1" stopColor="#F2B48A" />
        </LinearGradient>
      </Defs>
      <Path d="M8 60c0-14 10-22 24-22s24 8 24 22Z" fill="url(#personFill)" />
      <Rect fill="url(#personSkin)" height={32} rx={15} width={30} x={17} y={8} />
      <Path d="M16 24C14 10 24 4 33 4c10 0 17 7 15 20-2-6-6-9-11-9-6 0-9 2-14 2-3 0-5 3-7 7Z" fill="#3B2A20" />
    </Svg>
  );
}

/**
 * One picture per kind of notification. Never per event: everything about a
 * tenancy looks like tenancy. Bookings, visits, meals and staff are told apart
 * by subtype, because the server files them under broader categories.
 */
export function categoryArt(notification: NotificationItem): ComponentType<LucideProps> {
  const subtype = notification.subtype?.toUpperCase() ?? "";
  if (subtype.startsWith("BOOKING_") || subtype.startsWith("BOOKED_") || subtype.startsWith("FUTURE_BOOKING")) {
    return BookingArt;
  }
  if (subtype.startsWith("VISIT")) {
    return VisitArt;
  }
  if (subtype.startsWith("ENQUIRY_")) {
    return EnquiryArt;
  }
  if (subtype.startsWith("FOOD_")) {
    return MealArt;
  }
  if (subtype.startsWith("MANAGER_") || subtype.startsWith("STAFF_")) {
    return StaffArt;
  }
  if (subtype.startsWith("BUDGET_")) {
    return WalletArt;
  }
  if (subtype.startsWith("BILLING_") || subtype.startsWith("DAMAGE_") || subtype.startsWith("PAYMENT_") || subtype.startsWith("PAYOUT_")) {
    return BillingArt;
  }
  switch (notification.category.toUpperCase()) {
    case "TENANCY":
      return TenancyArt;
    case "BILLING":
    case "PAYMENT":
      return BillingArt;
    case "EXPENSE":
      return WalletArt;
    case "CONCERN":
      return ConcernArt;
    case "NOTICE":
      return NoticeArt;
    case "PROPERTY":
      return PropertyArt;
    case "ENQUIRY":
      return EnquiryArt;
    case "CHAT":
      return ChatArt;
    case "AUTH":
    case "ACCOUNT":
      return PersonArt;
    default:
      return BellArt;
  }
}
