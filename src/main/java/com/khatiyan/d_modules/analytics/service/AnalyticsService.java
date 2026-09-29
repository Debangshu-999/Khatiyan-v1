package com.khatiyan.d_modules.analytics.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.d_modules.analytics.api.AnalyticsResponse;
import com.khatiyan.d_modules.analytics.api.PeriodResponse;
import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.metric.DivisionAssembler;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.period.AnalyticsPeriodResolver;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.analytics.period.ResolvedPeriod;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.property.api.dto.ManagerPermissionsResponse;
import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * One division request: who may see what, over which dates, then the assembler.
 *
 * <p>Permission filtering happens BEFORE assembly, so a metric a manager may not
 * see is never even queried (spec §6.7).
 */
@Service
public class AnalyticsService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final PropertyModule propertyModule;
    private final PropertyAnalytics propertyAnalytics;
    private final Map<AnalyticsDivision, DivisionAssembler> assemblers = new EnumMap<>(AnalyticsDivision.class);

    @Autowired
    public AnalyticsService(
            PropertyModule propertyModule,
            PropertyAnalytics propertyAnalytics,
            ObjectProvider<DivisionAssembler> assemblers) {
        this(propertyModule, propertyAnalytics, assemblers.orderedStream().toList());
    }

    AnalyticsService(PropertyModule propertyModule, PropertyAnalytics propertyAnalytics, List<DivisionAssembler> assemblers) {
        this.propertyModule = propertyModule;
        this.propertyAnalytics = propertyAnalytics;
        for (DivisionAssembler assembler : assemblers) {
            if (this.assemblers.put(assembler.division(), assembler) != null) {
                throw new IllegalStateException("Two analytics assemblers for " + assembler.division());
            }
        }
    }

    public AnalyticsResponse divisionAnalytics(
            UUID actorUserId, UUID propertyId, AnalyticsDivision division, PeriodPreset preset, LocalDate from, LocalDate to) {
        return divisionAnalytics(actorUserId, propertyId, division, preset, from, to, LocalDate.now(IST));
    }

    AnalyticsResponse divisionAnalytics(
            UUID actorUserId,
            UUID propertyId,
            AnalyticsDivision division,
            PeriodPreset preset,
            LocalDate from,
            LocalDate to,
            LocalDate today) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        ManagerPermissionsResponse permissions = propertyModule.permissionsFor(actorUserId, propertyId);
        Map<ManagerResource, ManagerAccessLevel> levels = permissions.levels();
        if (!permissions.owner() && division.resources().stream()
                .noneMatch(resource -> levels.getOrDefault(resource, ManagerAccessLevel.NONE).canView())) {
            throw new ForbiddenException("You do not have access to this section");
        }

        ResolvedPeriod period = AnalyticsPeriodResolver.resolve(preset, from, to, today, propertyAnalytics.registeredOn(propertyId));
        Set<MetricKey> visible = MetricKey.visibleIn(division, permissions.owner(), levels);
        DivisionAssembler assembler = assemblers.get(division);
        List<MetricResult> metrics = assembler == null || visible.isEmpty()
                ? List.of()
                : assembler.assemble(new AnalyticsContext(propertyId, period, today, visible));
        return new AnalyticsResponse(division, PeriodResponse.from(period), metrics);
    }
}
