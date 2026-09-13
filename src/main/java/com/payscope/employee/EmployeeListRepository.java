package com.payscope.employee;

import com.payscope.common.Money;
import com.payscope.common.MoneyDto;
import com.payscope.common.PagedResponse;
import com.payscope.employee.dto.EmployeeListItem;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.Currency;
import java.util.List;

/**
 * The list endpoint loads no entities. One projection query joins employee,
 * salary and pay_band; one count query follows. Two statements per page,
 * constant in page size - spec section 4.
 *
 * Executed through the EntityManager rather than JdbcTemplate so Hibernate's
 * Statistics can count it: a JdbcTemplate query would bypass Hibernate and the
 * N+1 regression test would silently measure nothing.
 */
@Repository
public class EmployeeListRepository {

    private static final String FROM_AND_WHERE = """
            from employee e
            join salary s on s.employee_id = e.id
            left join pay_band b on b.job_role = e.job_role
                                and b.job_level = e.job_level
                                and b.country_code = e.country_code
            where e.deleted_at is null
              -- Each optional filter is cast explicitly. PostgreSQL cannot infer a
              -- type for an untyped null bind and fails the whole statement with
              -- "could not determine data type of parameter"; the cast supplies it.
              -- Casting rather than concatenating keeps these as bind parameters,
              -- which is what stops the filters being an injection vector.
              and (cast(:country    as text) is null or e.country_code   = cast(:country    as text))
              and (cast(:department as text) is null or e.department     = cast(:department as text))
              and (cast(:level      as text) is null or e.job_level      = cast(:level      as text))
              and (cast(:status     as text) is null or e.status         = cast(:status     as text))
              and (cast(:q as text) is null or e.full_name       ilike cast(:like as text)
                                            or e.email           ilike cast(:like as text)
                                            or e.employee_number ilike cast(:like as text))
            """;

    private final EntityManager em;

    public EmployeeListRepository(EntityManager em) {
        this.em = em;
    }

    public PagedResponse<EmployeeListItem> search(EmployeeQuery query) {
        String direction = query.ascending() ? "asc" : "desc";

        // The sort column comes from a closed enum, never from user text, and the
        // id tiebreaker is mandatory: without a unique final key, rows sharing a
        // sort value can appear on two pages or be skipped entirely.
        String sql = """
                select e.id, e.employee_number, e.full_name, e.email, e.department, e.country_code,
                       e.job_role, e.job_level, e.status,
                       s.amount_original, s.currency_code, s.amount_base_usd,
                       case when b.band_mid is null then null
                            else round(s.amount_original / b.band_mid, 4) end as compa_ratio
                """ + FROM_AND_WHERE + """
                order by %s %s, e.id asc
                limit :size offset :offset
                """.formatted(query.sort().column(), direction);

        Query rows = bind(em.createNativeQuery(sql, Tuple.class), query)
                .setParameter("size", query.size())
                .setParameter("offset", query.offset());

        @SuppressWarnings("unchecked")
        List<Tuple> tuples = rows.getResultList();

        Number total = (Number) bind(em.createNativeQuery("select count(*) " + FROM_AND_WHERE), query)
                .getSingleResult();

        List<EmployeeListItem> content = tuples.stream().map(EmployeeListRepository::toItem).toList();
        return PagedResponse.of(content, query.page(), query.size(), total.longValue());
    }

    private Query bind(Query query, EmployeeQuery q) {
        return query
                .setParameter("country", q.country())
                .setParameter("department", q.department() == null ? null : q.department().name())
                .setParameter("level", q.level() == null ? null : q.level().name())
                .setParameter("status", q.status() == null ? null : q.status().name())
                .setParameter("q", q.q())
                .setParameter("like", q.q() == null ? null : "%" + q.q() + "%");
    }

    private static EmployeeListItem toItem(Tuple t) {
        BigDecimal compaRatio = t.get("compa_ratio", BigDecimal.class);
        String currencyCode = t.get("currency_code", String.class);
        // amount_original/amount_base_usd are numeric(19,4) columns, so Postgres
        // always returns a scale-4 BigDecimal regardless of the currency's own
        // fraction digits. Money.of rescales to the currency's minor unit, the
        // same normalisation EmployeeDetailResponse gets via Salary.original().
        Money original = Money.of(t.get("amount_original", BigDecimal.class), Currency.getInstance(currencyCode));
        Money baseUsd = Money.of(t.get("amount_base_usd", BigDecimal.class), Currency.getInstance("USD"));
        return new EmployeeListItem(
                ((Number) t.get("id")).longValue(),
                t.get("employee_number", String.class),
                t.get("full_name", String.class),
                t.get("email", String.class),
                t.get("department", String.class),
                t.get("country_code", String.class),
                t.get("job_role", String.class),
                t.get("job_level", String.class),
                t.get("status", String.class),
                MoneyDto.from(original),
                MoneyDto.from(baseUsd),
                compaRatio);
    }
}
