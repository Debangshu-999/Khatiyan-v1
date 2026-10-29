import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AirVent, Fan } from "lucide-react-native";
import { BeddingIcon, CupboardIcon, MugIcon } from "@/features/property/room-amenity-icons";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * A picture for a room's thing, by its name (user, 2026-10-29). Items are the
 * owner's own words on the damage list, so they are matched by keyword, first
 * match wins: "Study table" is a desk, "Towel rail" a hanger. Anything not
 * matched is a plain box.
 */
const RULES: [RegExp, IconName][] = [
  [/\bac\b|air ?con/i, "air-conditioner"],
  [/toilet|commode|wc\b/i, "toilet"],
  [/geyser|water heater|boiler/i, "water-boiler"],
  [/shower/i, "shower-head"],
  [/tap|faucet/i, "faucet"],
  [/basin|sink|wash ?stand/i, "hand-wash-outline"],
  [/mirror/i, "mirror"],
  [/bucket/i, "bucket-outline"],
  [/\b(?:mugs?|cups?)\b/i, "coffee-outline"],
  [/\b(?:glass|glasses)\b/i, "cup-outline"],
  [/towel|hanger|rail|hook/i, "hanger"],
  [/mattress/i, "bed-empty"],
  [/bed ?sheet|sheet|cover|blanket|quilt/i, "bed-king-outline"],
  [/pillow|cushion/i, "sleep"],
  [/bunk/i, "bunk-bed-outline"],
  [/bedding|bed\b|cot/i, "bed-outline"],
  [/curtain|blind/i, "curtains"],
  [/kettle/i, "kettle-outline"],
  [/cupboard|wardrobe|almirah|closet/i, "wardrobe-outline"],
  [/drawer|dresser/i, "dresser-outline"],
  [/\btv\b|television/i, "television"],
  [/ceiling fan|fan/i, "ceiling-fan"],
  [/study table|desk/i, "desk"],
  [/table/i, "table-furniture"],
  [/chair|stool|seat/i, "chair-rolling"],
  [/sofa|couch/i, "sofa-outline"],
  [/lamp/i, "lamp"],
  [/bulb|light|tube/i, "lightbulb-outline"],
  [/lock/i, "lock-outline"],
  [/key/i, "key-outline"],
  [/door/i, "door"],
  [/window/i, "window-closed-variant"],
  [/fridge|refrigerator/i, "fridge-outline"],
  [/iron/i, "iron-outline"],
  [/washing machine|washer/i, "washing-machine"],
  [/microwave|oven/i, "microwave"],
  [/dustbin|bin\b|trash|garbage/i, "trash-can-outline"],
  [/wi-?fi|router|internet/i, "wifi"],
  [/shoe/i, "shoe-formal"],
  [/balcony/i, "balcony"],
  [/tray/i, "tray"],
  [/purifier|filter|pump/i, "water-pump"],
  [/tissue|paper/i, "paper-roll-outline"],
];

export function itemIconName(name: string): IconName {
  return RULES.find(([pattern]) => pattern.test(name))?.[1] ?? "package-variant-closed";
}

export function ItemIcon({ color, name, size = 18 }: { color: string; name: string; size?: number }) {
  // AC and Fan keep the app's own marks, the ones the AC and Non-AC chips use;
  // a bedsheet takes Bedding's, which is gone (user, 2026-10-29).
  if (/\bac\b|air ?con/i.test(name)) return <AirVent color={color} size={size} strokeWidth={2} />;
  if (/^fan$/i.test(name.trim())) return <Fan color={color} size={size} strokeWidth={2} />;
  if (/bed ?sheet/i.test(name)) return <BeddingIcon color={color} size={size} />;
  if (/cupboard|wardrobe|almirah|closet/i.test(name)) return <CupboardIcon color={color} size={size} />;
  if (/\b(?:mugs?|cups?)\b/i.test(name)) return <MugIcon color={color} size={size} />;
  return <MaterialCommunityIcons color={color} name={itemIconName(name)} size={size} />;
}
