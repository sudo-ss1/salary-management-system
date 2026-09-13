package com.payscope.salary;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
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
class RecordSalaryApiTest {

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

    private String raiseBody(String amount, String currency, String effectiveFrom, long version) {
        return """
                {
                  "salary": { "amount": "%s", "currency": "%s" },
                  "effectiveFrom": "%s",
                  "changeReason": "Annual review",
                  "salaryVersion": %d
                }
                """.formatted(amount, currency, effectiveFrom, version);
    }

    @Test
    void replaces_the_current_salary_and_returns_the_new_figures() throws Exception {
        long id = create("R-001", "r1@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.salary.amount").value("4640625.00"))
                .andExpect(jsonPath("$.salaryBaseUsd.amount").value("55687.50"))
                .andExpect(jsonPath("$.compaRatio").value("1.2500"))
                .andExpect(jsonPath("$.salaryVersion").value(1));
    }

    @Test
    void archives_the_superseded_salary_with_its_own_effective_period() throws Exception {
        long id = create("R-002", "r2@acme.test");
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)));

        mvc.perform(get("/api/employees/{id}/salary-history", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].salary.amount").value("3712500.00"))
                .andExpect(jsonPath("$[0].effectiveFrom").value("2024-03-01"))
                .andExpect(jsonPath("$[0].effectiveTo").value("2026-01-01"))
                .andExpect(jsonPath("$[0].changeReason").value("Annual review"));
    }

    @Test
    void rejects_a_replayed_request_carrying_the_version_it_already_consumed() throws Exception {
        // The optimistic-lock token doubles as an idempotency key: applying a
        // raise twice is the expensive mistake, and this closes it - ADR-0007.
        long id = create("R-003", "r3@acme.test");
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)));

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.currentVersion").value(1));
    }

    @Test
    void labels_a_replayed_raise_as_a_stale_version_conflict() throws Exception {
        // Same defect as ADR-0007's replay case: a client cannot tell a stale
        // version apart from a uniqueness conflict without this label.
        long id = create("R-003A", "r3a@acme.test");
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)));

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)))
                .andExpect(jsonPath("$.conflictKind").value("STALE_VERSION"));
    }

    @Test
    void rejects_a_raise_denominated_in_a_currency_the_country_does_not_use() throws Exception {
        long id = create("R-004", "r4@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("80000.00", "GBP", "2026-01-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("INR")));
    }

    @Test
    void rejects_an_effective_date_that_is_not_after_the_current_salarys_own() throws Exception {
        long id = create("R-005", "r5@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2024-03-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("after")));
    }

    @Test
    void rejects_an_effective_date_in_the_future() throws Exception {
        long id = create("R-006", "r6@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2027-01-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("future")));
    }

    @Test
    void rejects_a_salary_that_is_not_strictly_positive() throws Exception {
        long id = create("R-007", "r7@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("0.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("positive")));
    }

    @Test
    void requires_a_salary_version_on_every_raise() throws Exception {
        long id = create("R-008", "r8@acme.test");

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON).content("""
                        {
                          "salary": { "amount": "4640625.00", "currency": "INR" },
                          "effectiveFrom": "2026-01-01", "changeReason": "No version"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("salaryVersion"));
    }

    @Test
    void returns_not_found_when_raising_a_soft_deleted_employee() throws Exception {
        long id = create("R-009", "r9@acme.test");
        mvc.perform(delete("/api/employees/{id}", id));

        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                        .content(raiseBody("4640625.00", "INR", "2026-01-01", 0)))
                .andExpect(status().isNotFound())
                // Assert the problem body, not just the status: an unmapped or
                // broken route also yields 404, so a status-only assertion would
                // pass even if this handler were never reached.
                .andExpect(jsonPath("$.detail").value(containsString(String.valueOf(id))));
    }

    @Test
    void returns_an_empty_history_for_an_employee_who_has_never_had_a_raise() throws Exception {
        long id = create("R-010", "r10@acme.test");

        mvc.perform(get("/api/employees/{id}/salary-history", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void lists_multiple_raises_most_recent_first() throws Exception {
        long id = create("R-011", "r11@acme.test");
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4000000.00", "INR", "2025-01-01", 0)));
        mvc.perform(post("/api/employees/{id}/salary", id).contentType(APPLICATION_JSON)
                .content(raiseBody("4640625.00", "INR", "2026-01-01", 1)));

        mvc.perform(get("/api/employees/{id}/salary-history", id))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].effectiveTo").value("2026-01-01"))
                .andExpect(jsonPath("$[1].effectiveTo").value("2025-01-01"));
    }
}
