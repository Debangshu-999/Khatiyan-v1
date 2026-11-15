import { useState } from "react";
import { Text, View } from "react-native";
import { Star } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { MEAL_LABEL } from "@/features/food/food-ui";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import { indiaDate } from "@/features/visits/visit-clock";
import { useGetMyMealRatingQuery, useSubmitMealRatingMutation, type MealRatingPrompt } from "@/store/services/food-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const REVIEW_LIMIT = 300;

/** "Dinner, last night", "Lunch, today". */
function mealMoment(prompt: MealRatingPrompt) {
  const meal = MEAL_LABEL[prompt.mealType];
  if (prompt.date === indiaDate()) {
    return `${meal}, today`;
  }
  return `${meal}, ${prompt.mealType === "DINNER" ? "last night" : "yesterday"}`;
}

/**
 * The rating offer as a button on the meals card's sky (user, 2026-11-10), not
 * a card of its own: frosted glass with white text so the white Meals and plan
 * button stays the main one. Everyone's average so far, or Not rated, on the
 * right. Nothing shows when there is no meal to rate.
 */
export function MealRatingButton({ skip = false }: { skip?: boolean }) {
  const { fonts } = useTheme();
  const [open, setOpen] = useState(false);
  const query = useGetMyMealRatingQuery(undefined, { pollingInterval: 5 * 60_000, refetchOnFocus: true, skip });
  const prompt = query.data;
  if (!prompt) {
    return null;
  }
  const average = prompt.averageRating;
  const meal = MEAL_LABEL[prompt.mealType].toLowerCase();
  // Rated, the button stays to change it until the next meal starts (user, 2026-11-14).
  const rated = (prompt.mine ?? []).length > 0;
  return (
    <>
      <AnimatedPressable
        accessibilityHint={rated ? "Change your rating of your last meal" : "Rate the dishes of your last meal"}
        accessibilityLabel={`Rate ${meal}, ${average == null ? "not rated yet" : `average ${average.toFixed(1)}`}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: "rgba(255, 255, 255, 0.16)",
          borderColor: "rgba(255, 255, 255, 0.55)",
          borderCurve: "continuous",
          borderRadius: radii.card - 2,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 44,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Star color="#FFC83D" fill="#FFC83D" size={18} />
        <Text numberOfLines={1} style={{ color: "#FFFFFF", flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {rated ? `Edit rating, ${mealMoment(prompt).toLowerCase()}` : `Rate ${mealMoment(prompt).toLowerCase()}`}
        </Text>
        {average == null ? (
          <Text style={{ color: "rgba(255, 255, 255, 0.82)", fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>Not rated</Text>
        ) : (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 3 }}>
            <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 14 }}>{average.toFixed(1)}</Text>
            <Star color="#FFC83D" fill="#FFC83D" size={13} />
          </View>
        )}
      </AnimatedPressable>
      {open ? <MealRatingSheet onClose={() => setOpen(false)} prompt={prompt} /> : null}
    </>
  );
}

type Draft = Record<string, { rating: number; review: string }>;

function MealRatingSheet({ onClose, prompt }: { onClose: () => void; prompt: MealRatingPrompt }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const form = useFormErrors<"ratings">();
  // Opens on what they gave before, to change it (user, 2026-11-14).
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries((prompt.mine ?? []).map((given) => [given.itemId, { rating: given.rating, review: given.review ?? "" }])),
  );
  const [submit, state] = useSubmitMealRatingMutation();
  const meal = MEAL_LABEL[prompt.mealType].toLowerCase();
  const rated = (prompt.mine ?? []).length > 0;

  async function save() {
    const ratings = prompt.dishes
      .filter((dish) => draft[dish.itemId])
      .map((dish) => ({
        itemId: dish.itemId,
        rating: draft[dish.itemId].rating,
        review: draft[dish.itemId].review.trim() || undefined,
      }));
    if (!form.validate(ratings.length > 0 ? {} : { ratings: "Rate at least one dish." })) {
      return;
    }
    try {
      await submit({ date: prompt.date, mealType: prompt.mealType, ratings }).unwrap();
      onClose();
      toast.success(rated ? `Your rating of ${meal} is updated.` : `Thanks for rating ${meal}.`);
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not save your rating. Try again.");
    }
  }

  return (
    <SheetShell onClose={onClose} size="medium" title={rated ? `Edit your rating of ${meal}` : `Rate ${meal}`}>
      <Text style={[type.description, { color: colors.muted }]}>Your name is not shown to the owner.</Text>
      {prompt.dishes.map((dish, index) => {
        const entry = draft[dish.itemId];
        return (
          <View key={dish.itemId} style={{ borderTopColor: colors.border, borderTopWidth: index === 0 ? 0 : 1, gap: spacing.sm, paddingTop: index === 0 ? 0 : spacing.md }}>
            <Text style={{ color: colors.ink, fontFamily: type.bodyStrong.fontFamily, fontSize: 15 }}>{dish.name}</Text>
            <Stars
              label={dish.name}
              onChange={(rating) => {
                setDraft({ ...draft, [dish.itemId]: { rating, review: entry?.review ?? "" } });
                form.clearField("ratings");
              }}
              value={entry?.rating ?? 0}
            />
            {entry ? (
              <AppTextInput
                accessibilityLabel={`Review of ${dish.name}, optional`}
                maxLength={REVIEW_LIMIT}
                multiline
                onChangeText={(review) => setDraft({ ...draft, [dish.itemId]: { ...entry, review } })}
                placeholder="Add a review, optional"
                placeholderTextColor={colors.kicker}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radii.card,
                  borderWidth: 1,
                  color: colors.ink,
                  fontFamily: type.body.fontFamily,
                  fontSize: 14,
                  minHeight: 44,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
                value={entry.review}
              />
            ) : null}
          </View>
        );
      })}
      {form.errors.ratings ? <Text style={[type.caption, { color: colors.danger }]}>{form.errors.ratings}</Text> : null}
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
      <ActionButton
        disabled={state.isLoading || form.blocked}
        label={state.isLoading ? "Saving" : rated ? "Update" : "Submit"}
        onPress={() => void save()}
      />
    </SheetShell>
  );
}

/** Whole stars only: a rating is a whole number from 1 to 5 (user, 2026-11-01). */
function Stars({ label, onChange, value }: { label: string; onChange: (rating: number) => void; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <AnimatedPressable
          accessibilityLabel={`${label}, ${star} of 5`}
          accessibilityRole="button"
          accessibilityState={{ selected: star === value }}
          hitSlop={4}
          key={star}
          onPress={() => onChange(star)}
          tapLockMs={0}
        >
          <Star
            color={star <= value ? colors.warning : colors.borderStrong}
            fill={star <= value ? colors.warning : "transparent"}
            size={30}
            strokeWidth={1.8}
          />
        </AnimatedPressable>
      ))}
    </View>
  );
}
