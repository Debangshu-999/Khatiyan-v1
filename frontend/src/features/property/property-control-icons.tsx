import type { ImageSourcePropType } from "react-native";
import { Image } from "react-native";
import type { LucideProps } from "lucide-react-native";

/**
 * Illustrated property-control marks, exposed with the same props as a Lucide
 * icon so they can be dropped into ActionCard without a second card API.
 */
function illustratedIcon(source: ImageSourcePropType) {
  return function PropertyControlIllustration({ size = 24 }: LucideProps) {
    const dimension = Number(size);
    return (
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={source}
        style={{ height: dimension, width: dimension }}
      />
    );
  };
}

export const ManageListingIcon = illustratedIcon(
  require("../../../assets/property-control/manage-listing.png"),
);
export const EnquiriesIcon = illustratedIcon(
  require("../../../assets/property-control/enquiries.png"),
);
export const RoomsAndBedsIcon = illustratedIcon(
  require("../../../assets/property-control/rooms-beds.png"),
);
export const PropertyBoardIcon = illustratedIcon(
  require("../../../assets/property-control/property-board.png"),
);
export const NearbyLocationsIcon = illustratedIcon(
  require("../../../assets/property-control/nearby-locations.png"),
);
export const PropertyVisitsIcon = illustratedIcon(
  require("../../../assets/property-control/property-visits.png"),
);
