package com.payscope.analytics;

import com.payscope.analytics.dto.CompaRatioBucket;
import com.payscope.analytics.dto.SummaryResponse;
import com.payscope.common.MoneyDto;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

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
                new MoneyDto(t.get("total_ctc", BigDecimal.class).setScale(2, RoundingMode.HALF_UP).toPlainString(), "USD"),
                new MoneyDto(t.get("mean_base", BigDecimal.class).setScale(2, RoundingMode.HALF_UP).toPlainString(), "USD"),
                ((Number) t.get("unbanded")).longValue(),
                List.of(
                        new CompaRatioBucket("LT_80", ((Number) t.get("lt80")).longValue()),
                        new CompaRatioBucket("B80_90", ((Number) t.get("b80_90")).longValue()),
                        new CompaRatioBucket("B90_110", ((Number) t.get("b90_110")).longValue()),
                        new CompaRatioBucket("B110_120", ((Number) t.get("b110_120")).longValue()),
                        new CompaRatioBucket("GT_120", ((Number) t.get("gt120")).longValue())));
    }

    static Query bind(Query query, AnalyticsFilter f) {
        return query
                .setParameter("country", f.country())
                .setParameter("department", f.department() == null ? null : f.department().name())
                .setParameter("role", f.role() == null ? null : f.role().name())
                .setParameter("level", f.level() == null ? null : f.level().name())
                .setParameter("status", f.status() == null ? null : f.status().name());
    }
}
