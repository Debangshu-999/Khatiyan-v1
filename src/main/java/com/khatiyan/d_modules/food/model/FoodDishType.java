package com.khatiyan.d_modules.food.model;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * What kind of dish this is, which is how the ratings screen groups them (user,
 * 2026-11-02). Being on several plans cannot say this: paneer is often on every plan
 * and is still a veg dish, while rice is a staple.
 *
 * <p>Persisted by name. Never delete a constant: stored rows would stop loading.
 */
public enum FoodDishType {
    COMMON,
    DRINK,
    VEG,
    NON_VEG;

    private static final Pattern DRINK_WORDS = words(
            "tea|coffee|chai|juice|milk|lassi|buttermilk|chaas|shake|milkshake|water|soda|lemonade|sharbat|smoothie");
    private static final Pattern NON_VEG_WORDS = words(
            "chicken|mutton|fish|egg|eggs|prawn|prawns|meat|keema|omelette|omelet|beef|pork|lamb");
    private static final Pattern COMMON_WORDS = words(
            "rice|roti|chapati|phulka|naan|puri|bread|dal|raita|curd|dahi|salad|papad|pickle|achar|chutney");

    /**
     * A first guess from the name, for a dish saved without a type and for the dishes
     * that were there before types. V6267 holds the same words. The owner can change it.
     */
    public static FoodDishType guess(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (DRINK_WORDS.matcher(lower).find()) {
            return DRINK;
        }
        if (NON_VEG_WORDS.matcher(lower).find()) {
            return NON_VEG;
        }
        return COMMON_WORDS.matcher(lower).find() ? COMMON : VEG;
    }

    private static Pattern words(String alternatives) {
        return Pattern.compile("\\b(" + alternatives + ")\\b");
    }
}
