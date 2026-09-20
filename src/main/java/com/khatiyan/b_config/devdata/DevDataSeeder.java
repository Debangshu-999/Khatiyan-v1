package com.khatiyan.b_config.devdata;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.model.User;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.a_auth.repository.UserRepository;
import com.khatiyan.d_modules.property.api.dto.CreatePropertyRequest;
import com.khatiyan.d_modules.property.api.dto.CreatePropertyRequest.DiscoveryImage;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.model.PropertyFacility;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.property.model.SharingType;
import com.khatiyan.d_modules.discovery.service.PropertyDiscoveryService;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.service.PropertyService;

/**
 * Dummy owners and properties, for testing against something that looks real.
 *
 * <p><b>Why it exists.</b> Smart search is geography first — a place name has to
 * resolve, a region scope has to bind the results, and "Salt Lake" must not
 * return a Hyderabad listing. None of that can be judged against a handful of
 * pins. Kolkata gets twenty properties across six areas, several per area, so a
 * search returns a list rather than a single lucky hit and the ten-result cap
 * for an unbounded area search actually has something to cap. Hyderabad and
 * Bengaluru get eight each, which is enough to prove region scope keeps them
 * out of a Kolkata search.
 *
 * <p><b>Owners are derived, not listed.</b> A property owner may hold at most
 * {@link Property#MAX_ACTIVE_PER_OWNER} active properties, so twenty in one city
 * needs five owners. The seeder chunks each city's list by that constant rather
 * than hard-coding the split — change the cap or add a property and the owners
 * follow.
 *
 * <p><b>Deliberately varied.</b> Every property having the same facilities,
 * sharing types and price would let a filter look like it works when it is
 * doing nothing. The rotation below gives each one a different combination, so
 * a filter that is ignored shows up as a result set that did not change.
 *
 * <p><b>Why it goes through the service, not SQL.</b> {@code createProperty}
 * enforces the owner cap, stamps defaults and publishes
 * {@code PropertyCreatedEvent}, which is what builds the discovery profile a
 * search can actually find. Rows inserted straight into the table would be
 * invisible to discovery and could hold combinations the domain forbids — seed
 * data that lies is worse than no seed data.
 *
 * <p><b>Off, and never in production.</b> Two independent guards: the property
 * {@code app.seed.dev-data} must be explicitly true, and the {@code prod}
 * profile disables it outright. It is idempotent as well — it looks for its own
 * first owner and does nothing if that owner is already there — so a restart
 * with the flag left on does not pile up duplicates.
 *
 * <p>Delete this class the day there is real data worth testing against.
 */
@Component
@Profile("!prod")
@ConditionalOnProperty(name = "app.seed.dev-data", havingValue = "true")
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

    /**
     * Synthetic numbers, in a block chosen to be obviously fake at a glance.
     * The first one is also how the seeder recognises its own previous run.
     */
    private static final String PHONE_PREFIX = "+9190000000";

    private static final List<String> OWNER_NAMES = List.of(
            "Arindam Sen", "Paromita Ghosh", "Subhas Dutta", "Rima Chatterjee", "Tapan Bose",
            "Sridevi Rao", "Naveen Reddy",
            "Vinay Kamath", "Deepa Shetty");

    private final UserRepository userRepository;
    private final PropertyService propertyService;
    private final PropertyDiscoveryService propertyDiscoveryService;

    public DevDataSeeder(
            UserRepository userRepository,
            PropertyService propertyService,
            PropertyDiscoveryService propertyDiscoveryService) {
        this.userRepository = userRepository;
        this.propertyService = propertyService;
        this.propertyDiscoveryService = propertyDiscoveryService;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (userRepository.existsByPhoneAndActiveTrue(ownerPhone(0))) {
            log.info("Dev seed data already present, skipping");
            return;
        }

        List<SeedProperty> all = new ArrayList<>();
        all.addAll(kolkata());
        all.addAll(hyderabad());
        all.addAll(bengaluru());

        int created = 0;
        int ownerIndex = 0;
        for (int from = 0; from < all.size(); from += Property.MAX_ACTIVE_PER_OWNER) {
            List<SeedProperty> forOneOwner =
                    all.subList(from, Math.min(from + Property.MAX_ACTIVE_PER_OWNER, all.size()));
            UUID ownerId = owner(ownerIndex);
            for (SeedProperty seed : forOneOwner) {
                create(ownerId, seed, created);
                created++;
            }
            ownerIndex++;
        }

        log.info("Dev seed complete: {} owners, {} properties (Kolkata {}, Hyderabad {}, Bengaluru {})",
                ownerIndex, created, kolkata().size(), hyderabad().size(), bengaluru().size());
    }

    // ------------------------------------------------------------ the places

    /**
     * Twenty, clustered so area searches have depth.
     *
     * <p>Salt Lake and New Town are adjacent and easy to confuse, Ballygunge and
     * Jadavpur are south, Howrah is across the river, Behala is south-west.
     * Between them they exercise "different parts of one city" rather than
     * twenty pins on the same street.
     */
    private static List<SeedProperty> kolkata() {
        return List.of(
                place("Sen Residency", "DD Block, Sector 1", "Salt Lake", "700064", "22.5867", "88.4172"),
                place("Sector V Stay", "Block GP, Sector 5", "Salt Lake", "700091", "22.5760", "88.4340"),
                place("Bidhannagar House", "AE Block", "Salt Lake", "700064", "22.5840", "88.4090"),
                place("Karunamoyee Lodge", "CF Block", "Salt Lake", "700064", "22.5790", "88.4210"),
                place("Labony Rooms", "BE Block", "Salt Lake", "700064", "22.5905", "88.4130"),

                place("Action Area Homes", "Action Area I", "New Town", "700156", "22.5800", "88.4700"),
                place("Eco Park Stay", "Action Area II", "New Town", "700157", "22.6010", "88.4620"),
                place("Rajarhat Rooms", "Action Area III", "New Town", "700160", "22.6190", "88.4530"),
                place("Novotel Lane PG", "Street 245", "New Town", "700156", "22.5745", "88.4655"),

                place("Lake View Stay", "Ballygunge Circular Road", "Ballygunge", "700019", "22.5266", "88.3654"),
                place("Gariahat House", "Gariahat Road", "Ballygunge", "700019", "22.5185", "88.3660"),
                place("Ekdalia Rooms", "Ekdalia Road", "Ballygunge", "700019", "22.5230", "88.3705"),
                place("Deshapriya Stay", "Rashbehari Avenue", "Ballygunge", "700029", "22.5150", "88.3520"),

                place("Jadavpur Lodge", "Raja S C Mallick Road", "Jadavpur", "700032", "22.4966", "88.3712"),
                place("Sulekha Rooms", "Prince Anwar Shah Road", "Jadavpur", "700033", "22.4930", "88.3620"),
                place("Baghajatin House", "Baghajatin Station Road", "Jadavpur", "700086", "22.4790", "88.3780"),

                place("Shibpur House", "Grand Trunk Road", "Shibpur", "711102", "22.5800", "88.3100"),
                place("Santragachi Stay", "Santragachi Junction Road", "Santragachi", "711104", "22.5920", "88.2740"),

                place("Behala Rooms", "Diamond Harbour Road", "Behala", "700034", "22.4989", "88.3186"),
                place("Thakurpukur Lodge", "James Long Sarani", "Thakurpukur", "700063", "22.4720", "88.3050"));
    }

    private static List<SeedProperty> hyderabad() {
        return List.of(
                place("Gachibowli Nest", "Financial District Road", "Gachibowli", "500032", "17.4400", "78.3489"),
                place("Nanakramguda Stay", "Nanakramguda Road", "Gachibowli", "500032", "17.4180", "78.3450"),
                place("Madhapur Stay", "Ayyappa Society", "Madhapur", "500081", "17.4483", "78.3915"),
                place("Hitec City Rooms", "Cyber Towers Road", "Madhapur", "500081", "17.4504", "78.3808"),
                place("Kondapur Comfort", "Botanical Garden Road", "Kondapur", "500084", "17.4615", "78.3677"),
                place("Kothaguda House", "Kothaguda Junction", "Kondapur", "500084", "17.4560", "78.3620"),
                place("Kukatpally Lodge", "JNTU Road", "Kukatpally", "500072", "17.4849", "78.4138"),
                place("KPHB Rooms", "KPHB Phase 6", "Kukatpally", "500072", "17.4930", "78.3990"));
    }

    private static List<SeedProperty> bengaluru() {
        return List.of(
                place("Koramangala Court", "80 Feet Road", "Koramangala", "560034", "12.9352", "77.6245"),
                place("Forum Lane Stay", "7th Block", "Koramangala", "560095", "12.9340", "77.6120"),
                place("Whitefield Rooms", "ITPL Main Road", "Whitefield", "560066", "12.9698", "77.7500"),
                place("Varthur House", "Varthur Road", "Whitefield", "560066", "12.9410", "77.7420"),
                place("HSR Haven", "27th Main Road", "HSR Layout", "560102", "12.9116", "77.6474"),
                place("Agara Lake Stay", "Sector 1", "HSR Layout", "560102", "12.9230", "77.6390"),
                place("Indiranagar Stay", "100 Feet Road", "Indiranagar", "560038", "12.9784", "77.6408"),
                place("Domlur Rooms", "Old Airport Road", "Domlur", "560071", "12.9610", "77.6380"));
    }

    // ------------------------------------------------------------- machinery

    /** One property to create. City and state come from the pincode block. */
    private record SeedProperty(
            String name, String address, String area, String city, String state,
            String pincode, String latitude, String longitude) {
    }

    /**
     * City and state are inferred from the pincode's first digit, which is what
     * it encodes in India: 7 is West Bengal, 5 is Telangana and Karnataka. It
     * saves repeating them on forty lines and cannot fall out of step with the
     * coordinates.
     */
    private static SeedProperty place(
            String name, String address, String area, String pincode, String latitude, String longitude) {
        String city;
        String state;
        if (pincode.startsWith("711")) {
            city = "Howrah";
            state = "West Bengal";
        } else if (pincode.startsWith("7")) {
            city = "Kolkata";
            state = "West Bengal";
        } else if (pincode.startsWith("50")) {
            city = "Hyderabad";
            state = "Telangana";
        } else {
            city = "Bengaluru";
            state = "Karnataka";
        }
        return new SeedProperty(name, address, area, city, state, pincode, latitude, longitude);
    }

    private UUID owner(int index) {
        String name = OWNER_NAMES.get(index % OWNER_NAMES.size());
        User user = User.create(ownerPhone(index), name, UserRole.OWNER);
        user.updateProfile(name);
        return userRepository.save(user).getId();
    }

    private static String ownerPhone(int index) {
        return PHONE_PREFIX + "%02d".formatted(index + 1);
    }

    /**
     * One property, fully populated and deliberately unlike its neighbours.
     *
     * <p>The rotations below are the point: identical properties would let a
     * broken filter look like a working one, because every result set would be
     * the same set. Rotating on the running index gives each area a spread of
     * audiences, prices and amenities without hand-writing forty variants.
     */
    private void create(UUID ownerId, SeedProperty seed, int index) {
        UUID propertyId = register(ownerId, seed, index);

        // Registering a property does NOT list it. The event listener creates a
        // DRAFT discovery profile — public_visible false — because putting a
        // property in front of the public is the owner's decision, not a side
        // effect of filling in a form. Seed data that is invisible to search is
        // no use, so the seeder makes that decision explicitly, exactly as an
        // owner would from the listing screen.
        propertyDiscoveryService.publishProfile(ownerId, propertyId);
    }

    private UUID register(UUID ownerId, SeedProperty seed, int index) {
        PgFor pgFor = switch (index % 3) {
            case 0 -> PgFor.MALE;
            case 1 -> PgFor.FEMALE;
            default -> PgFor.ANYONE;
        };

        // 6,500 to 16,000 a month in deposit terms, in steps, so a "under 12k"
        // style filter has properties on both sides of the line.
        long depositPaise = 650_000L + (index % 8) * 135_000L;

        Set<SharingType> sharing = switch (index % 4) {
            case 0 -> Set.of(SharingType.SINGLE, SharingType.DOUBLE);
            case 1 -> Set.of(SharingType.DOUBLE, SharingType.TRIPLE);
            case 2 -> Set.of(SharingType.SINGLE);
            default -> Set.of(SharingType.TRIPLE, SharingType.FOUR_SHARING, SharingType.DORMITORY);
        };

        Set<PropertyFacility> facilities = switch (index % 4) {
            case 0 -> Set.of(PropertyFacility.WIFI, PropertyFacility.POWER_BACKUP, PropertyFacility.CCTV);
            case 1 -> Set.of(PropertyFacility.WIFI, PropertyFacility.GYM, PropertyFacility.PARKING);
            case 2 -> Set.of(PropertyFacility.POWER_BACKUP, PropertyFacility.ROOM_CLEANING);
            default -> Set.of(PropertyFacility.WIFI, PropertyFacility.MESS,
                    PropertyFacility.WASHING_MACHINE, PropertyFacility.CCTV);
        };

        boolean foodIncluded = index % 3 != 2;
        Set<MealType> meals = foodIncluded
                ? Set.of(MealType.BREAKFAST, MealType.DINNER)
                : Set.of();

        PropertyResponse created = propertyService.createProperty(ownerId, new CreatePropertyRequest(
                seed.name(),
                seed.address(),
                seed.area(),
                seed.city(),
                seed.state(),
                seed.pincode(),
                new BigDecimal(seed.latitude()),
                new BigDecimal(seed.longitude()),
                PropertyType.PG,
                pgFor,
                index % 2 == 0 ? PreferredTenantType.STUDENT : PreferredTenantType.PROFESSIONAL,
                foodIncluded,
                meals,
                true,
                index % 2 == 0 ? BathroomType.ATTACHED : BathroomType.COMMON,
                sharing,
                facilities,
                Set.of(),
                null,
                null,
                10_000L,
                5,
                depositPaise,
                NoticePeriod.ONE_MONTH,
                null,
                seed.name() + " in " + seed.area(),
                "Seeded test property in " + seed.area() + ", " + seed.city() + ". Not a real listing.",
                null,
                List.of(new DiscoveryImage(
                        "https://res.cloudinary.com/demo/image/upload/sample.jpg", "seed/sample"))));

        return created.id();
    }
}
