package com.payscope.analytics;

import com.payscope.employee.EmployeeService;
import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.Fixtures;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class OutliersApiTest {

    @Autowired MockMvc mvc;
    @Autowired EmployeeService employees;
    @Autowired DatabaseCleaner cleaner;

    @BeforeEach
    void seedTheFixedDataset() {
        cleaner.clean();
        Fixtures.twelveEmployees(employees);
    }

    @Test
    void lists_exactly_the_employees_outside_the_eighty_to_one_hundred_and_twenty_window() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void orders_the_most_underpaid_first_so_the_worst_case_is_at_the_top() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[0].employeeNumber").value("F-U1"))
                .andExpect(jsonPath("$.content[0].compaRatio").value(0.7000))
                .andExpect(jsonPath("$.content[1].employeeNumber").value("F-I3"))
                .andExpect(jsonPath("$.content[1].compaRatio").value(1.2500))
                .andExpect(jsonPath("$.content[2].employeeNumber").value("F-U4"))
                .andExpect(jsonPath("$.content[2].compaRatio").value(1.3000));
    }

    @Test
    void shows_the_salary_and_the_band_midpoint_it_was_measured_against() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[0].salary.amount").value("103950.00"))
                .andExpect(jsonPath("$.content[0].salary.currency").value("USD"))
                .andExpect(jsonPath("$.content[0].bandMid.amount").value("148500.00"));
    }

    @Test
    void expresses_an_indian_outlier_in_rupees_against_its_rupee_band() throws Exception {
        // Compa-ratio never crosses a currency: both sides are local - ADR-0002.
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[1].salary.currency").value("INR"))
                .andExpect(jsonPath("$.content[1].salary.amount").value("4640625.00"))
                .andExpect(jsonPath("$.content[1].bandMid.amount").value("3712500.00"));
    }

    @Test
    void never_reports_an_unbanded_employee_as_an_outlier() throws Exception {
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[?(@.employeeNumber == 'F-N1')]").isEmpty());
    }

    @Test
    void treats_exactly_eighty_and_exactly_one_hundred_and_twenty_percent_as_within_band() throws Exception {
        // G1 sits at 0.8000 and G4 at 1.2000. Both are inside the window.
        mvc.perform(get("/api/analytics/outliers"))
                .andExpect(jsonPath("$.content[?(@.employeeNumber == 'F-G1')]").isEmpty())
                .andExpect(jsonPath("$.content[?(@.employeeNumber == 'F-G4')]").isEmpty());
    }

    @Test
    void narrows_the_list_when_a_country_filter_is_applied() throws Exception {
        mvc.perform(get("/api/analytics/outliers").param("country", "IN"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].employeeNumber").value("F-I3"));
    }

    @Test
    void paginates_the_results() throws Exception {
        mvc.perform(get("/api/analytics/outliers").param("size", "2"))
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));

        mvc.perform(get("/api/analytics/outliers").param("size", "2").param("page", "1"))
                .andExpect(jsonPath("$.content.length()").value(1));
    }

    @Test
    void rejects_a_page_size_above_one_hundred() throws Exception {
        mvc.perform(get("/api/analytics/outliers").param("size", "500"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("100")));
    }
}
