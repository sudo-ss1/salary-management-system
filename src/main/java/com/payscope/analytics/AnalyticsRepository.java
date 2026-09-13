package com.payscope.analytics;

import com.payscope.analytics.dto.CompaRatioBucket;
import com.payscope.analytics.dto.DistributionGroup;
import com.payscope.analytics.dto.OutlierItem;
import com.payscope.analytics.dto.SummaryResponse;
import com.payscope.common.Money;
import com.payscope.common.MoneyDto;
import com.payscope.common.PagedResponse;
import com.payscope.salary.CompaRatio;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Currency;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * All aggregation is SQL. Nothing here loads rows into memory to compute a
 * total, a mean or a percentile.
 *
 * Every query joins employee and filters deleted_at is null. deleted_at lives
 * only on employee, so a salary-only aggregate would silently include deleted
 * people in total payroll - ADR-0005.
 */
@Repository
public class AnalyticsRepository {

    /** Shared by summary, distribution and outliers so the filters cannot drift apart. */
    static final String FROM_AND_WHERE = """
            from employee e
            join salary s on s.employee_id = e.id
            left join pay_band b on b.job_role = e.job_role
                                and b.job_level = e.job_level
                                and b.country_code = e.country_code
            where e.deleted_at is null
              -- Cast every optional filter: PostgreSQL cannot infer a type for an
              -- untyped null bind. See the Task 12 ruling in the SDD ledger.
              and (cast(:country    as text) is null or e.country_code = cast(:country    as text))
              and (cast(:department as text) is null or e.department   = cast(:department as text))
              and (cast(:role       as text) is null or e.job_role     = cast(:role       as text))
              and (cast(:level      as text) is null or e.job_level    = cast(:level      as text))
              and (cast(:status     as text) is null or e.status       = cast(:status     as text))
            """;

    private final EntityManager em;

    public AnalyticsRepository(EntityManager em) {
        this.em = em;
    }

    public SummaryResponse summary(AnalyticsFilter filter) {
        String sql = """
                select count(*)                                         as headcount,
                       coalesce(sum(s.amount_base_usd), 0)              as total_ctc,
                       coalesce(round(avg(s.amount_base_usd), 2), 0)    as mean_base,
                       count(*) filter (where b.band_mid is null)       as unbanded,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid <  0.80) as lt80,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >= 0.80
                                          and s.amount_original / b.band_mid <  0.90) as b80_90,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >= 0.90
                                          and s.amount_original / b.band_mid <  1.10) as b90_110,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >= 1.10
                                          and s.amount_original / b.band_mid <= 1.20) as b110_120,
                       count(*) filter (where b.band_mid is not null
                                          and s.amount_original / b.band_mid >  1.20) as gt120
                """ + FROM_AND_WHERE;

        Tuple t = (Tuple) bind(em.createNativeQuery(sql, Tuple.class), filter).getSingleResult();

        return new SummaryResponse(
                ((Number) t.get("headcount")).longValue(),
                usd(t.get("total_ctc", BigDecimal.class)),
                usd(t.get("mean_base", BigDecimal.class)),
                ((Number) t.get("unbanded")).longValue(),
                List.of(
                        new CompaRatioBucket("LT_80", ((Number) t.get("lt80")).longValue()),
                        new CompaRatioBucket("B80_90", ((Number) t.get("b80_90")).longValue()),
                        new CompaRatioBucket("B90_110", ((Number) t.get("b90_110")).longValue()),
                        new CompaRatioBucket("B110_120", ((Number) t.get("b110_120")).longValue()),
                        new CompaRatioBucket("GT_120", ((Number) t.get("gt120")).longValue())));
    }

    public List<DistributionGroup> distribution(AnalyticsFilter filter, List<GroupByDimension> groupBy) {
        String selectedColumns = groupBy.stream()
                .map(d -> d.column() + " as " + d.key())
                .collect(Collectors.joining(",\n       "));
        String groupClause = groupBy.isEmpty() ? ""
                : "group by " + groupBy.stream().map(GroupByDimension::column).collect(Collectors.joining(", "))
                  + "\norder by " + groupBy.stream().map(GroupByDimension::column).collect(Collectors.joining(", "));

        // percentile_cont for every percentile, including the compa-ratio one, so
        // a single payload never carries two percentile methods - ADR-0003.
        // percentile_cont always returns double precision, and Postgres has no
        // round(double precision, integer) overload, so every percentile is cast
        // to numeric before rounding.
        String sql = "select " + (selectedColumns.isEmpty() ? "" : selectedColumns + ",\n       ") + """
                count(*) as headcount,
                       round(cast(percentile_cont(0.25) within group (order by s.amount_base_usd) as numeric), 2) as p25,
                       round(cast(percentile_cont(0.50) within group (order by s.amount_base_usd) as numeric), 2) as p50,
                       round(cast(percentile_cont(0.75) within group (order by s.amount_base_usd) as numeric), 2) as p75,
                       round(cast(percentile_cont(0.90) within group (order by s.amount_base_usd) as numeric), 2) as p90,
                       round(avg(s.amount_base_usd), 2) as mean,
                       round(cast(percentile_cont(0.50) within group (
                               order by s.amount_original / b.band_mid) as numeric), 4) as median_compa_ratio
                """ + FROM_AND_WHERE + groupClause;

        @SuppressWarnings("unchecked")
        List<Tuple> rows = bind(em.createNativeQuery(sql, Tuple.class), filter).getResultList();

        List<DistributionGroup> groups = new ArrayList<>();
        for (Tuple row : rows) {
            Map<String, String> key = new LinkedHashMap<>();
            for (GroupByDimension dimension : groupBy) {
                Object value = row.get(dimension.key());
                key.put(dimension.key(), value == null ? null : value.toString());
            }
            groups.add(new DistributionGroup(key,
                    ((Number) row.get("headcount")).longValue(),
                    usd(row.get("p25", BigDecimal.class)),
                    usd(row.get("p50", BigDecimal.class)),
                    usd(row.get("p75", BigDecimal.class)),
                    usd(row.get("p90", BigDecimal.class)),
                    usd(row.get("mean", BigDecimal.class)),
                    row.get("median_compa_ratio", BigDecimal.class)));
        }
        return groups;
    }

    private static MoneyDto usd(BigDecimal amount) {
        return amount == null ? null : new MoneyDto(
                amount.setScale(2, RoundingMode.HALF_UP).toPlainString(), "USD");
    }

    static Query bind(Query query, AnalyticsFilter f) {
        return query
                .setParameter("country", f.country())
                .setParameter("department", f.department() == null ? null : f.department().name())
                .setParameter("role", f.role() == null ? null : f.role().name())
                .setParameter("level", f.level() == null ? null : f.level().name())
                .setParameter("status", f.status() == null ? null : f.status().name());
    }

    /**
     * FROM_AND_WHERE already left joins pay_band, so an unbanded employee has
     * band_mid = null; the explicit "b.band_mid is not null" here is redundant
     * with SQL's three-valued logic (any comparison against null is unknown, not
     * true) but stated anyway so an unbanded employee is never an outlier without
     * relying on a reader to know that. The boundaries are inclusive, so exactly
     * 0.80 and exactly 1.20 are inside the window.
     */
    private static final String OUTLIER_PREDICATE = """
              and b.band_mid is not null
              and (s.amount_original / b.band_mid < :low or s.amount_original / b.band_mid > :high)
            """;

    public PagedResponse<OutlierItem> outliers(AnalyticsFilter filter, int page, int size) {
        String sql = """
                select e.id, e.employee_number, e.full_name, e.country_code, e.job_role, e.job_level,
                       s.amount_original, s.currency_code, b.band_mid,
                       round(s.amount_original / b.band_mid, 4) as compa_ratio
                """ + FROM_AND_WHERE + OUTLIER_PREDICATE + """
                order by compa_ratio asc, e.id asc
                limit :size offset :offset
                """;

        @SuppressWarnings("unchecked")
        List<Tuple> rows = bindOutlier(em.createNativeQuery(sql, Tuple.class), filter)
                .setParameter("size", size)
                .setParameter("offset", page * size)
                .getResultList();

        Number total = (Number) bindOutlier(
                em.createNativeQuery("select count(*) " + FROM_AND_WHERE + OUTLIER_PREDICATE), filter)
                .getSingleResult();

        List<OutlierItem> content = rows.stream().map(row -> new OutlierItem(
                ((Number) row.get("id")).longValue(),
                row.get("employee_number", String.class),
                row.get("full_name", String.class),
                row.get("country_code", String.class),
                row.get("job_role", String.class),
                row.get("job_level", String.class),
                // Rescaled through Money, not emitted raw: these are numeric(19,4)
                // columns and would otherwise carry four decimal places for a
                // currency with two. Same reason as the list projection.
                MoneyDto.from(Money.of(row.get("amount_original", BigDecimal.class),
                        Currency.getInstance(row.get("currency_code", String.class)))),
                MoneyDto.from(Money.of(row.get("band_mid", BigDecimal.class),
                        Currency.getInstance(row.get("currency_code", String.class)))),
                row.get("compa_ratio", BigDecimal.class))).toList();

        return PagedResponse.of(content, page, size, total.longValue());
    }

    private Query bindOutlier(Query query, AnalyticsFilter filter) {
        return bind(query, filter)
                .setParameter("low", CompaRatio.LOW)
                .setParameter("high", CompaRatio.HIGH);
    }
}
