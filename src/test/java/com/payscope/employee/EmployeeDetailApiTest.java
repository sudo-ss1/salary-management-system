package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class EmployeeDetailApiTest {

    @Autowired
    MockMvc mvc;

    /** Creates an employee and returns their id, parsed from the Location header. */
    private long create(String number, String email, String amount, String currency, String country,
                        String role, String level) throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "%s", "fullName": "Asha Menon", "email": "%s",
                          "department": "ENGINEERING", "countryCode": "%s", "role": "%s",
                          "level": "%s", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "%s", "currency": "%s" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """.formatted(number, email, country, role, level, amount, currency)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getHeader("Location");
        return Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
    }

    @Test
    void returns_the_record_with_salary_in_both_currencies_and_both_version_tokens() throws Exception {
        long id = create("E-3001", "d1@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Asha Menon"))
                .andExpect(jsonPath("$.salary.amount").value("3712500.00"))
                .andExpect(jsonPath("$.salary.currency").value("INR"))
                .andExpect(jsonPath("$.salaryBaseUsd.amount").value("44550.00"))
                .andExpect(jsonPath("$.salaryBaseUsd.currency").value("USD"))
                .andExpect(jsonPath("$.employeeVersion").value(0))
                .andExpect(jsonPath("$.salaryVersion").value(0));
    }

    @Test
    void serializes_money_as_a_string_never_as_a_json_number() throws Exception {
        long id = create("E-3002", "d2@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.salary.amount").isString());
    }

    @Test
    void reports_a_compa_ratio_of_one_for_a_salary_on_the_band_midpoint() throws Exception {
        long id = create("E-3003", "d3@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.compaRatio").value(1.0000))
                .andExpect(jsonPath("$.bandMid.amount").value("3712500.00"));
    }

    @Test
    void reports_a_compa_ratio_below_one_for_a_salary_under_the_midpoint() throws Exception {
        // 2970000 / 3712500 = 0.8000
        long id = create("E-3004", "d4@acme.test", "2970000.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.compaRatio").value(0.8000));
    }

    @Test
    void reports_a_null_compa_ratio_and_no_band_for_a_combination_with_no_band() throws Exception {
        long id = create("E-3005", "d5@acme.test", "100000.00", "USD", "US", "RECRUITER", "PRINCIPAL");

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.compaRatio").doesNotExist())
                .andExpect(jsonPath("$.bandMid").doesNotExist());
    }

    @Test
    void returns_not_found_for_an_id_that_never_existed() throws Exception {
        mvc.perform(get("/api/employees/{id}", 999_999_999L))
                .andExpect(status().isNotFound())
                // Assert the problem body, not just the status: an unmapped or
                // broken route also yields 404, so a status-only assertion would
                // pass even if this handler were never reached.
                .andExpect(jsonPath("$.detail").value(containsString("999999999")));
    }

    @Test
    @Disabled("enabled by Task 11")
    void returns_not_found_rather_than_gone_for_a_soft_deleted_employee() throws Exception {
        long id = create("E-3006", "d6@acme.test", "3712500.00", "INR", "IN", "SOFTWARE_ENGINEER", "SENIOR");
        mvc.perform(delete("/api/employees/{id}", id));

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value(containsString(String.valueOf(id))));
    }
}
