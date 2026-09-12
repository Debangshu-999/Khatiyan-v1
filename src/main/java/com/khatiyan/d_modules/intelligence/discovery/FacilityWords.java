package com.khatiyan.d_modules.intelligence.discovery;

import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.khatiyan.d_modules.property.model.PropertyFacility;

/**
 * What somebody has to have actually said for a facility to count.
 *
 * <p>A model asked for a list of facilities will offer plausible ones. "PG in
 * Kolkata" is a sentence about a city, and a wifi requirement appearing in the
 * answer to it would quietly reorder the results and mark honest listings as
 * weak matches for something nobody asked about. So each facility needs its
 * own word in the sentence before it is allowed to count — the same rule the
 * audience and bathroom fields already live under.
 *
 * <p>Spelled out rather than derived from the enum names. Deriving would cover
 * {@code WIFI} and {@code GYM} and miss every way people actually write the
 * rest: nobody types "air conditioning" when they mean AC, or "refrigerator"
 * when they mean a fridge.
 *
 * <p>Substring matching, so "wifi" catches "wi-fi" only where the hyphen is
 * absent — both spellings are listed for that reason. A false positive here
 * costs a chip somebody can remove. A false negative costs a requirement that
 * silently does nothing, which is worse, so the lists lean generous.
 */
final class FacilityWords {

    private static final Map<PropertyFacility, List<String>> WORDS = build();

    private FacilityWords() {
    }

    /** Whether the sentence names this facility at all. */
    static boolean mentioned(PropertyFacility facility, String sentence) {
        if (facility == null || sentence == null || sentence.isBlank()) {
            return false;
        }
        String text = sentence.toLowerCase(Locale.ROOT);
        return WORDS.getOrDefault(facility, List.of()).stream().anyMatch(text::contains);
    }

    private static Map<PropertyFacility, List<String>> build() {
        Map<PropertyFacility, List<String>> words = new EnumMap<>(PropertyFacility.class);
        words.put(PropertyFacility.WIFI, List.of("wifi", "wi-fi", "wi fi", "internet", "broadband"));
        words.put(PropertyFacility.WASHING_MACHINE, List.of("washing machine", "washer"));
        words.put(PropertyFacility.MESS, List.of("mess", "tiffin", "canteen"));
        words.put(PropertyFacility.ROOM_CLEANING, List.of("room cleaning", "cleaning", "cleaned"));
        words.put(PropertyFacility.GYM, List.of("gym", "fitness", "workout"));
        words.put(PropertyFacility.PARKING, List.of("parking", "garage", "car park"));
        words.put(PropertyFacility.POWER_BACKUP, List.of("power backup", "backup", "generator", "inverter", "no power cut"));
        words.put(PropertyFacility.CCTV, List.of("cctv", "camera", "surveillance"));
        words.put(PropertyFacility.SECURITY, List.of("security", "guard", "watchman", "safe"));
        words.put(PropertyFacility.DRINKING_WATER, List.of("drinking water", "ro water", "water purifier", "filtered water"));
        words.put(PropertyFacility.HOT_WATER, List.of("hot water", "geyser", "water heater"));
        words.put(PropertyFacility.COMMON_KITCHEN, List.of("kitchen", "cook", "cooking"));
        words.put(PropertyFacility.REFRIGERATOR, List.of("refrigerator", "fridge"));
        words.put(PropertyFacility.STUDY_AREA, List.of("study", "study area", "reading room", "desk"));
        words.put(PropertyFacility.LIFT, List.of("lift", "elevator"));
        words.put(PropertyFacility.AIR_CONDITIONING, List.of("air conditioning", "air conditioned", "air-conditioned", " ac ", "ac room", "with ac"));
        words.put(PropertyFacility.HOUSEKEEPING, List.of("housekeeping", "house keeping"));
        words.put(PropertyFacility.LAUNDRY_SERVICE, List.of("laundry", "dhobi", "ironing"));
        return Map.copyOf(words);
    }
}
