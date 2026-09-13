package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class UpdateEmployeeApiTest {

    @Autowired
    MockMvc mvc;

    private long create(String number, String email) throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "%s", "fullName": "Asha Menon", "email": "%s",
                          "department": "ENGINEERING", "countryCode": "IN", "role": "SOFTWARE_ENGINEER",
                          "level": "SENIOR", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """.formatted(number, email)))
                .andReturn().getResponse().getHeader("Location");
        return Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
    }

    // Each test's employee gets its own updated-email literal: this suite shares
    // one Postgres container across the whole run with no per-test rollback, so
    // two different employees updated to the same literal email would collide on
    // employee_email_unique and mask the behaviour each test actually exercises.
    private String updateBody(String fullName, String email, String level, long version) {
        return """
                {
                  "fullName": "%s", "email": "%s", "department": "PRODUCT",
                  "role": "PRODUCT_MANAGER", "level": "%s", "employmentType": "FULL_TIME",
                  "employeeVersion": %d
                }
                """.formatted(fullName, email, level, version);
    }

    @Test
    void applies_the_change_and_returns_the_incremented_version() throws Exception {
        long id = create("E-5001", "u1@acme.test");

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                        .content(updateBody("Asha Menon-Rao", "updated1@acme.test", "STAFF", 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Asha Menon-Rao"))
                .andExpect(jsonPath("$.level").value("STAFF"))
                .andExpect(jsonPath("$.employeeVersion").value(1));
    }

    @Test
    void recomputes_compa_ratio_against_the_band_for_the_new_level() throws Exception {
        long id = create("E-5002", "u2@acme.test");

        // PRODUCT_MANAGER / STAFF / IN mid = 125000 x 1.70 x 0.30 / 0.012 = 5312500 INR.
        // The salary is unchanged at 3712500, so 3712500 / 5312500 = 0.6988.
        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                .content(updateBody("Asha Menon", "updated2@acme.test", "STAFF", 0)));

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(jsonPath("$.compaRatio").value(0.6988));
    }

    @Test
    void rejects_a_stale_version_with_a_conflict() throws Exception {
        long id = create("E-5003", "u3@acme.test");
        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                .content(updateBody("First Edit", "updated3@acme.test", "STAFF", 0)));

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                        .content(updateBody("Second Edit", "updated3@acme.test", "STAFF", 0)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"));
    }

    @Test
    void reports_the_current_version_in_the_conflict_so_the_client_can_recover() throws Exception {
        long id = create("E-5004", "u4@acme.test");
        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                .content(updateBody("First Edit", "updated4@acme.test", "STAFF", 0)));

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                        .content(updateBody("Second Edit", "updated4@acme.test", "STAFF", 0)))
                .andExpect(jsonPath("$.currentVersion").value(1));
    }

    @Test
    void labels_a_stale_version_conflict_so_the_client_can_show_a_reload_prompt() throws Exception {
        long id = create("E-5004A", "u4a@acme.test");
        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                .content(updateBody("First Edit", "updated4a@acme.test", "STAFF", 0)));

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON)
                        .content(updateBody("Second Edit", "updated4a@acme.test", "STAFF", 0)))
                .andExpect(jsonPath("$.conflictKind").value("STALE_VERSION"));
    }

    @Test
    void requires_a_version_on_every_update() throws Exception {
        long id = create("E-5005", "u5@acme.test");

        String withoutVersion = """
                {
                  "fullName": "No Version", "email": "nv@acme.test", "department": "PRODUCT",
                  "role": "PRODUCT_MANAGER", "level": "STAFF", "employmentType": "FULL_TIME"
                }
                """;

        mvc.perform(put("/api/employees/{id}", id).contentType(APPLICATION_JSON).content(withoutVersion))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("employeeVersion"));
    }

    @Test
    void returns_not_found_when_updating_an_employee_that_does_not_exist() throws Exception {
        mvc.perform(put("/api/employees/{id}", 999_999_999L).contentType(APPLICATION_JSON)
                        .content(updateBody("Ghost", "ghost@acme.test", "STAFF", 0)))
                .andExpect(status().isNotFound())
                // Assert the problem body, not just the status: an unmapped or
                // broken route also yields 404, so a status-only assertion would
                // pass even if this handler were never reached.
                .andExpect(jsonPath("$.detail").value(containsString("999999999")));
    }
}
