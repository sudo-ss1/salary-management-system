package com.payscope.analytics;

import com.payscope.employee.EmployeeService;
import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.Fixtures;
import com.payscope.support.IntegrationTest;
import com.payscope.support.QueryCounter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class DistributionApiTest {

    @Autowired MockMvc mvc;
    @Autowired EmployeeService employees;
    @Autowired DatabaseCleaner cleaner;
    @Autowired AnalyticsService analytics;
    @Autowired QueryCounter queries;

    @BeforeEach
    void seedTheFixedDataset() {
        cleaner.clean();
        Fixtures.twelveEmployees(employees);
    }

    private static final String DE = "$[?(@.key.country == 'DE')]";
    private static final String IN = "$[?(@.key.country == 'IN')]";
    private static final String US = "$[?(@.key.country == 'US')]";

    @Test
    void reports_exact_percentiles_for_each_country() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath(DE + ".headcount").value(4))
                .andExpect(jsonPath(DE + ".p25.amount").value("103950.00"))
                .andExpect(jsonPath(DE + ".p50.amount").value("118800.00"))
                .andExpect(jsonPath(DE + ".p75.amount").value("133650.00"))
                .andExpect(jsonPath(DE + ".p90.amount").value("138996.00"))
                .andExpect(jsonPath(DE + ".mean.amount").value("118800.00"));
    }

    @Test
    void interpolates_the_median_of_an_even_sized_group_rather_than_picking_a_row() throws Exception {
        // Germany's two middle salaries are 106920 and 130680. percentile_cont
        // returns their mean, 118800, which no employee actually earns. This is
        // what "median" means to the persona and what other comp tools report.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(DE + ".p50.amount").value("118800.00"));
    }

    @Test
    void reports_exact_percentiles_for_an_odd_sized_group() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(IN + ".headcount").value(3))
                .andExpect(jsonPath(IN + ".p25.amount").value("40095.00"))
                .andExpect(jsonPath(IN + ".p50.amount").value("44550.00"))
                .andExpect(jsonPath(IN + ".p75.amount").value("50118.75"))
                .andExpect(jsonPath(IN + ".p90.amount").value("53460.00"))
                .andExpect(jsonPath(IN + ".mean.amount").value("45292.50"));
    }

    @Test
    void includes_unbanded_employees_in_the_pay_distribution() throws Exception {
        // The United States group is five, not four: the principal recruiter has
        // no band but is still paid and still counts towards cost.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(US + ".headcount").value(5))
                .andExpect(jsonPath(US + ".mean.amount").value("158800.00"))
                .andExpect(jsonPath(US + ".p90.amount").value("197220.00"));
    }

    @Test
    void excludes_unbanded_employees_from_the_median_compa_ratio() throws Exception {
        // US compa-ratios are 0.70, 1.00, 1.00, 1.30 - the unbanded employee
        // contributes nothing. The median of those four is 1.0000.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY"))
                .andExpect(jsonPath(US + ".medianCompaRatio").value(1.0000));
    }

    @Test
    void aggregates_a_mixed_currency_group_on_the_base_amount() throws Exception {
        // Eleven SENIOR employees across EUR, USD and INR. 106920.00 is only
        // reachable by aggregating amount_base_usd; touching amount_original
        // would produce a meaningless mixture.
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "LEVEL"))
                .andExpect(jsonPath("$[?(@.key.level == 'SENIOR')].headcount").value(11))
                .andExpect(jsonPath("$[?(@.key.level == 'SENIOR')].p50.amount").value("106920.00"));
    }

    @Test
    void groups_by_two_dimensions_at_once() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY", "LEVEL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key.country == 'IN' && @.key.level == 'SENIOR')].headcount")
                        .value(3));
    }

    @Test
    void narrows_the_groups_when_a_filter_is_applied() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "COUNTRY").param("level", "SENIOR"))
                .andExpect(jsonPath(US + ".headcount").value(4));
    }

    @Test
    void rejects_more_than_two_grouping_dimensions() throws Exception {
        mvc.perform(get("/api/analytics/distribution")
                        .param("groupBy", "COUNTRY", "LEVEL", "DEPARTMENT"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("two")));
    }

    @Test
    void rejects_a_grouping_dimension_that_is_not_on_the_whitelist() throws Exception {
        mvc.perform(get("/api/analytics/distribution").param("groupBy", "SALARY"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("COUNTRY")));
    }

    @Test
    void defaults_to_a_single_group_covering_the_whole_organization() throws Exception {
        mvc.perform(get("/api/analytics/distribution"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].headcount").value(12));
    }

    @Test
    void computes_every_group_in_a_single_statement() throws Exception {
        long statements = queries.countStatements(() -> analytics.distribution(
                new AnalyticsFilter(null, null, null, null, null), List.of(GroupByDimension.COUNTRY)));

        assertThat(statements).isEqualTo(1);
    }
}
