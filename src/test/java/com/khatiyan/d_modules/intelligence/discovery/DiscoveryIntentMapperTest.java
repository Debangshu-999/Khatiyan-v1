package com.khatiyan.d_modules.intelligence.discovery;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.khatiyan.d_modules.intelligence.discovery.DiscoveryIntentMapper.MappedIntent;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;

/**
 * The airlock between what the model read and what the search applies.
 *
 * <p>Every case here is a sentence that went wrong in real use. The model is
 * not under test — each draft is written the way the model actually answered —
 * so these pin the rules that stop a plausible misreading becoming a filter
 * nobody asked for.
 */
class DiscoveryIntentMapperTest {

    private final DiscoveryIntentMapper mapper = new DiscoveryIntentMapper();

    /** A draft with nothing in it. Each test sets only what the model said. */
    private static Draft draft() {
        return new Draft();
    }

    private static final class Draft {
        String landmarkText;
        PgFor pgFor;
        Integer minRent;
        Integer maxRent;
        PreferredTenantType preferredFor;
        Boolean food;
        List<MealType> meals;
        Boolean electricity;
        BathroomType bathroom;
        PropertyType type;
        Integer maxDeposit;
        List<PropertyFacility> facilities;

        Draft landmark(String value) { landmarkText = value; return this; }
        Draft pgFor(PgFor value) { pgFor = value; return this; }
        Draft rent(Integer min, Integer max) { minRent = min; maxRent = max; return this; }
        Draft preferredFor(PreferredTenantType value) { preferredFor = value; return this; }
        Draft food(Boolean value) { food = value; return this; }
        Draft meals(MealType... value) { meals = List.of(value); return this; }
        Draft electricity(Boolean value) { electricity = value; return this; }
        Draft bathroom(BathroomType value) { bathroom = value; return this; }
        Draft type(PropertyType value) { type = value; return this; }
        Draft deposit(Integer value) { maxDeposit = value; return this; }
        Draft facilities(PropertyFacility... value) { facilities = List.of(value); return this; }

        DiscoveryIntentDraft build() {
            return new DiscoveryIntentDraft(
                    "kolkata", landmarkText, SearchAnchor.PLACE, null, pgFor, minRent, maxRent, preferredFor,
                    food, meals, electricity, bathroom, null, type, maxDeposit, facilities, List.of(), 0.9);
        }
    }

    private MappedIntent map(Draft draft, String sentence) {
        return mapper.map(draft.build(), sentence);
    }

    @Nested
    @DisplayName("rent and deposit")
    class RentAndDeposit {

        @Test
        @DisplayName("a lone deposit figure the model filed as rent becomes the deposit (2026-09-13)")
        void depositFiledAsRentIsMovedToDeposit() {
            MappedIntent intent = map(draft().rent(null, 10_000),
                    "PG in kolkata near Hospitals with Wifi and attached bathroom and food included with deposit under 10K");

            assertThat(intent.searchArgs().maxRentPaise()).isNull();
            assertThat(intent.preferences().maxDepositPaise()).isEqualTo(1_000_000L);
        }

        @Test
        @DisplayName("a deposit figure copied into rent as well is kept only as the deposit (2026-09-13)")
        void depositCopiedIntoRentIsDroppedFromRent() {
            MappedIntent intent = map(draft().rent(null, 10_000).deposit(10_000),
                    "Girls PG in kolkata near metro stations with food and wifi, deposit under 10000");

            assertThat(intent.searchArgs().maxRentPaise()).isNull();
            assertThat(intent.preferences().maxDepositPaise()).isEqualTo(1_000_000L);
        }

        @Test
        @DisplayName("two different amounts keep both limits")
        void rentAndDepositBothStated() {
            MappedIntent intent = map(draft().rent(null, 8_000).deposit(20_000),
                    "pg under 8000 with deposit under 20000");

            assertThat(intent.searchArgs().maxRentPaise()).isEqualTo(800_000L);
            assertThat(intent.preferences().maxDepositPaise()).isEqualTo(2_000_000L);
        }

        @Test
        @DisplayName("the same amount written twice is two limits, not one deposit")
        void sameAmountForBoth() {
            MappedIntent intent = map(draft().rent(null, 10_000).deposit(10_000),
                    "pg under 10k deposit under 10k");

            assertThat(intent.searchArgs().maxRentPaise()).isEqualTo(1_000_000L);
            assertThat(intent.preferences().maxDepositPaise()).isEqualTo(1_000_000L);
        }

        @Test
        @DisplayName("a sentence that names rent keeps the rent even beside a deposit")
        void rentWordKeepsRent() {
            MappedIntent intent = map(draft().rent(null, 10_000).deposit(10_000),
                    "rent and deposit both under 10000");

            assertThat(intent.searchArgs().maxRentPaise()).isEqualTo(1_000_000L);
        }

        @Test
        @DisplayName("rent with no deposit in sight is left alone")
        void plainRent() {
            MappedIntent intent = map(draft().rent(null, 9_000), "pg in kolkata under 9000");

            assertThat(intent.searchArgs().maxRentPaise()).isEqualTo(900_000L);
            assertThat(intent.preferences().maxDepositPaise()).isNull();
        }

        @Test
        @DisplayName("zero is the model saying no bound, not a budget, and is not reported")
        void zeroRentIsNoBound() {
            MappedIntent intent = map(draft().rent(0, 0), "pg in kolkata");

            assertThat(intent.searchArgs().minRentPaise()).isNull();
            assertThat(intent.searchArgs().maxRentPaise()).isNull();
            assertThat(intent.unresolvedRequirements()).isEmpty();
        }

        @Test
        @DisplayName("a rent that cannot be monthly is dropped and said to be dropped")
        void implausibleRentIsReported() {
            MappedIntent intent = map(draft().rent(null, 12), "pg under 12");

            assertThat(intent.searchArgs().maxRentPaise()).isNull();
            assertThat(intent.unresolvedRequirements()).anyMatch(line -> line.contains("maximum rent"));
        }

        @Test
        @DisplayName("a deposit is only applied when the sentence says deposit")
        void depositNeedsTheWord() {
            MappedIntent intent = map(draft().deposit(10_000), "pg in kolkata under 10000");

            assertThat(intent.preferences().maxDepositPaise()).isNull();
        }

        @Test
        @DisplayName("a lowest rent above the highest is kept and flagged as a conflict")
        void invertedRentRangeIsAConflict() {
            MappedIntent intent = map(draft().rent(9_000, 5_000), "rent between 9000 and 5000");

            assertThat(intent.conflicts()).hasSize(1);
        }
    }

    @Nested
    @DisplayName("fields the model fills whether or not they were said")
    class EvidenceGuards {

        @Test
        @DisplayName("PG alone does not mean a men's PG")
        void pgIsNotMale() {
            MappedIntent intent = map(draft().pgFor(PgFor.MALE), "pg in kolkata");

            assertThat(intent.searchArgs().pgFor()).isNull();
        }

        @Test
        @DisplayName("girls sets the audience")
        void girlsSetsFemale() {
            MappedIntent intent = map(draft().pgFor(PgFor.FEMALE), "girls pg in kolkata");

            assertThat(intent.searchArgs().pgFor()).isEqualTo(PgFor.FEMALE);
        }

        @Test
        @DisplayName("Anyone is the absence of a preference")
        void anyoneIsNoFilter() {
            MappedIntent intent = map(draft().pgFor(PgFor.ANYONE).preferredFor(PreferredTenantType.ANYONE),
                    "co-ed pg for anyone, students or working");

            assertThat(intent.searchArgs().pgFor()).isNull();
            assertThat(intent.searchArgs().preferredFor()).isNull();
        }

        @Test
        @DisplayName("students or working has to be said")
        void tenantTypeNeedsEvidence() {
            assertThat(map(draft().preferredFor(PreferredTenantType.STUDENT), "pg in kolkata")
                    .searchArgs().preferredFor()).isNull();
            assertThat(map(draft().preferredFor(PreferredTenantType.STUDENT), "pg for college students")
                    .searchArgs().preferredFor()).isEqualTo(PreferredTenantType.STUDENT);
        }

        @Test
        @DisplayName("a bathroom type needs a bathroom word")
        void bathroomNeedsEvidence() {
            assertThat(map(draft().bathroom(BathroomType.COMMON), "pg in kolkata")
                    .searchArgs().bathroomType()).isNull();
            assertThat(map(draft().bathroom(BathroomType.ATTACHED), "pg with attached bathroom")
                    .searchArgs().bathroomType()).isEqualTo(BathroomType.ATTACHED);
        }

        @Test
        @DisplayName("a no for food or electricity is a filled slot, not a requirement")
        void falseBooleansAreDropped() {
            MappedIntent intent = map(draft().food(false).electricity(false), "pg in kolkata");

            assertThat(intent.searchArgs().foodIncluded()).isNull();
            assertThat(intent.searchArgs().electricityIncluded()).isNull();
        }

        @Test
        @DisplayName("naming a meal implies food")
        void mealImpliesFood() {
            MappedIntent intent = map(draft().meals(MealType.DINNER), "pg with dinner");

            assertThat(intent.searchArgs().foodIncluded()).isTrue();
            assertThat(intent.searchArgs().mealTypes()).containsExactly(MealType.DINNER);
        }

        @Test
        @DisplayName("only facilities actually named survive")
        void facilitiesNeedTheirOwnWord() {
            MappedIntent intent = map(draft().facilities(PropertyFacility.WIFI, PropertyFacility.GYM, PropertyFacility.AIR_CONDITIONING),
                    "pg with wifi and ac room");

            assertThat(intent.preferences().facilities())
                    .containsExactlyInAnyOrder(PropertyFacility.WIFI, PropertyFacility.AIR_CONDITIONING);
        }

        @Test
        @DisplayName("a property type needs a type word")
        void propertyTypeNeedsEvidence() {
            assertThat(map(draft().type(PropertyType.PG), "rooms near salt lake").searchArgs().propertyType())
                    .isEqualTo(PropertyType.PG);
            assertThat(map(draft().type(PropertyType.HOSTEL), "somewhere near salt lake").searchArgs().propertyType())
                    .isNull();
        }
    }

    @Test
    @DisplayName("a blank landmark is no landmark, and a real one is trimmed")
    void landmarkText() {
        assertThat(map(draft().landmark("   "), "pg in kolkata").landmarkText()).isNull();
        assertThat(map(draft().landmark("  metro station "), "pg near metro station").landmarkText())
                .isEqualTo("metro station");
    }

    @ParameterizedTest(name = "{1} amount(s) in \"{0}\"")
    @DisplayName("money is counted per mention, and counts and distances are not money")
    @CsvSource(delimiter = '|', value = {
            "pg in kolkata near hospitals with deposit under 10k | 1",
            "pg under 8000 with deposit under 20000 | 2",
            "pg under 10k deposit under 10k | 2",
            "girls pg within 2 km of salt lake deposit below 15,000 | 1",
            "3bhk near metro deposit 1 lakh | 1",
            "3 sharing pg | 0",
    })
    void amountsAreCountedPerMention(String sentence, int expected) {
        assertThat(DiscoveryIntentMapper.amountsIn(sentence)).isEqualTo(expected);
    }
}
