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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class SummaryApiTest {

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

    @Test
    void reports_headcount_total_payroll_and_mean_in_one_currency() throws Exception {
        mvc.perform(get("/api/analytics/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headcount").value(12))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.amount").value("1405077.50"))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.currency").value("USD"))
                .andExpect(jsonPath("$.meanBaseUsd.amount").value("117089.79"));
    }

    @Test
    void counts_employees_whose_role_level_and_country_has_no_band() throws Exception {
        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.unbandedCount").value(1));
    }

    @Test
    void buckets_every_banded_employee_by_compa_ratio() throws Exception {
        // 11 banded employees: 0.70 | 0.80 0.80 | 0.90 1.00 1.00 1.00 | 1.10 1.20 | 1.25 1.30
        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'LT_80')].headcount").value(1))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'B80_90')].headcount").value(2))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'B90_110')].headcount").value(5))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'B110_120')].headcount").value(2))
                .andExpect(jsonPath("$.compaRatioBuckets[?(@.bucket == 'GT_120')].headcount").value(2));
    }

    @Test
    void narrows_every_figure_when_a_country_filter_is_applied() throws Exception {
        // Germany only: 95040 + 106920 + 130680 + 142560 = 475200, mean 118800
        mvc.perform(get("/api/analytics/summary").param("country", "DE"))
                .andExpect(jsonPath("$.headcount").value(4))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.amount").value("475200.00"))
                .andExpect(jsonPath("$.meanBaseUsd.amount").value("118800.00"))
                .andExpect(jsonPath("$.unbandedCount").value(0));
    }

    @Test
    void excludes_soft_deleted_employees_from_every_figure() throws Exception {
        // Deleting U4 (193050 USD) must move both headcount and the payroll total.
        String body = mvc.perform(get("/api/employees").param("q", "u4@acme.test"))
                .andReturn().getResponse().getContentAsString();
        int idIndex = body.indexOf("\"id\":") + 5;
        long id = Long.parseLong(body.substring(idIndex, body.indexOf(',', idIndex)).trim());
        mvc.perform(delete("/api/employees/{id}", id)).andExpect(status().isNoContent());

        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.headcount").value(11))
                .andExpect(jsonPath("$.totalCostToCompanyUsd.amount").value("1212027.50"));
    }

    @Test
    void keeps_inactive_employees_in_the_payroll_total_because_leavers_are_a_real_fact() throws Exception {
        String body = mvc.perform(get("/api/employees").param("q", "u4@acme.test"))
                .andReturn().getResponse().getContentAsString();
        int idIndex = body.indexOf("\"id\":") + 5;
        long id = Long.parseLong(body.substring(idIndex, body.indexOf(',', idIndex)).trim());
        mvc.perform(post("/api/employees/{id}/deactivate", id)).andExpect(status().isOk());

        mvc.perform(get("/api/analytics/summary"))
                .andExpect(jsonPath("$.headcount").value(12));
        mvc.perform(get("/api/analytics/summary").param("status", "ACTIVE"))
                .andExpect(jsonPath("$.headcount").value(11));
    }

    @Test
    void computes_the_whole_summary_in_a_single_statement() throws Exception {
        long statements = queries.countStatements(
                () -> analytics.summary(new AnalyticsFilter(null, null, null, null, null)));

        assertThat(statements).isEqualTo(1);
    }
}
