package com.khatiyan.d_modules.property.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.property.api.dto.RoomConditionWrite;
import com.khatiyan.d_modules.property.api.dto.RoomItemConditionResponse;
import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.support.IntegrationTest;

/** A room's running item condition (2026-10-29), against the real schema. */
@IntegrationTest
class RoomConditionServiceTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private RoomConditionService conditions;

    private BookingFixtures fx;
    private UUID room;
    private UUID actor;

    @BeforeEach
    void seed() {
        fx = new BookingFixtures(jdbc);
        UUID property = fx.property();
        actor = fx.ownerAccount(property);
        room = fx.room(property, 2, 0);
    }

    @AfterEach
    void remove() {
        jdbc.update("DELETE FROM property.room_item_conditions WHERE room_id = ?", room);
        fx.remove();
    }

    @Test
    void raiseKeepsTheWorseLevelAndReplacesPhotos() {
        conditions.applyMoveIn(room, actor, List.of(new RoomConditionWrite("AC", "ROOM", DamageLevel.D2, List.of("a.jpg"))));

        DamageLevel before = conditions.raise(room, actor, "AC", "ROOM", DamageLevel.D1, List.of("b.jpg"));

        assertThat(before).isEqualTo(DamageLevel.D2);
        RoomItemConditionResponse ac = only();
        assertThat(ac.level()).isEqualTo(DamageLevel.D2);
        assertThat(ac.photoUrls()).containsExactly("b.jpg");
    }

    @Test
    void raiseOnAMissingItemCreatesIt() {
        DamageLevel before = conditions.raise(room, actor, "Fan", "ROOM", DamageLevel.D1, List.of("f.jpg"));

        assertThat(before).isEqualTo(DamageLevel.NA);
        assertThat(only().level()).isEqualTo(DamageLevel.D1);
    }

    @Test
    void resetSetsExactly() {
        conditions.raise(room, actor, "Cupboard", "ROOM", DamageLevel.D3, List.of("c.jpg"));

        conditions.reset(room, actor, "Cupboard", "ROOM", DamageLevel.NA, List.of("new.jpg"));

        RoomItemConditionResponse cupboard = only();
        assertThat(cupboard.level()).isEqualTo(DamageLevel.NA);
        assertThat(cupboard.photoUrls()).containsExactly("new.jpg");
    }

    @Test
    void applyMoveInUpsertsByCaseInsensitiveName() {
        conditions.applyMoveIn(room, actor, List.of(new RoomConditionWrite("AC", "ROOM", DamageLevel.NA, List.of("a.jpg"))));
        conditions.applyMoveIn(room, actor, List.of(new RoomConditionWrite(" ac ", "ROOM", DamageLevel.D1, List.of("b.jpg"))));

        assertThat(conditions.list(room)).hasSize(1);
        assertThat(only().level()).isEqualTo(DamageLevel.D1);
    }

    private RoomItemConditionResponse only() {
        List<RoomItemConditionResponse> all = conditions.list(room);
        assertThat(all).hasSize(1);
        return all.get(0);
    }
}
