package com.khatiyan.d_modules.intelligence.mealreview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.intelligence.MealReviewBrief;
import com.khatiyan.d_modules.intelligence.MealReviewBrief.Subject;
import com.khatiyan.d_modules.intelligence.MealReviewReading;

class MealReviewAnalystTest {

    private static final MealReviewBrief BRIEF = new MealReviewBrief(
            List.of(new Subject("P2", "Veg meals")), List.of(new Subject("D8", "Dal tadka")), List.of());

    private static MealReviewReading read(String key, String review) {
        return MealReviewAnalyst.collect(new MealReviewAnalyst.Answer(List.of(
                new MealReviewAnalyst.Item(key, 3.74, review),
                new MealReviewAnalyst.Item(key.equals("D8") ? "P2" : "D8", 4.0, "Fine."))), BRIEF).get(0);
    }

    @Test
    void aKeyWrittenInTheTextBecomesTheRealName() {
        MealReviewReading reading = read("P2", "Tenants of P2 like D8 but want it **less bland**.");

        assertThat(reading.review()).isEqualTo("Tenants of Veg meals like Dal tadka but want it **less bland**.");
        assertThat(reading.rating()).isEqualTo(3.7);
    }

    @Test
    void anAnswerWithPlansButNoDishesFailsSoTheOwnerKeepsTheTurn() {
        assertThatThrownBy(() -> MealReviewAnalyst.collect(new MealReviewAnalyst.Answer(List.of(
                new MealReviewAnalyst.Item("P2", 4.0, "Plans only."))), BRIEF))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("P2=4.0");
    }

    @Test
    void anEntryWithoutAScoreFromOneToFiveIsDropped() {
        assertThatThrownBy(() -> MealReviewAnalyst.collect(new MealReviewAnalyst.Answer(List.of(
                new MealReviewAnalyst.Item("P2", null, "No score."),
                new MealReviewAnalyst.Item("D8", 8.0, "Out of range."))), BRIEF))
                .isInstanceOf(IllegalStateException.class);
        assertThat(MealReviewAnalyst.collect(new MealReviewAnalyst.Answer(List.of(
                new MealReviewAnalyst.Item("P2", null, "No score."),
                new MealReviewAnalyst.Item("D8", 4.0, "Scored."))), BRIEF))
                .extracting(MealReviewReading::key).containsExactly("D8");
    }

    @Test
    void aNameInTheKeyFieldStillFindsItsKey() {
        assertThat(read("dal Tadka", "Liked.").key()).isEqualTo("D8");
    }

    @Test
    void anAnswerMatchingNothingFailsSoTheOwnerKeepsTheTurn() {
        assertThatThrownBy(() -> MealReviewAnalyst.collect(new MealReviewAnalyst.Answer(List.of(
                new MealReviewAnalyst.Item("D99", 4.0, "Fine."))), BRIEF))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void anUnknownKeyIsDroppedAndOrdinaryWordsAreLeftAlone() {
        List<MealReviewReading> readings = MealReviewAnalyst.collect(new MealReviewAnalyst.Answer(List.of(
                new MealReviewAnalyst.Item("D99", 4.0, "Fine."),
                new MealReviewAnalyst.Item("D8", 4.0, "Served at P9 and in PD8 style."))), BRIEF);

        assertThat(readings).extracting(MealReviewReading::key).containsExactly("D8");
        assertThat(readings.get(0).review()).isEqualTo("Served at P9 and in PD8 style.");
    }
}
