package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class DeactivateAndDeleteApiTest {

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

    @Test
    void deactivating_marks_the_employee_inactive_but_leaves_the_record_readable() throws Exception {
        long id = create("E-6001", "x1@acme.test");

        mvc.perform(post("/api/employees/{id}/deactivate", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }

    @Test
    void deactivating_an_already_inactive_employee_succeeds_again() throws Exception {
        long id = create("E-6002", "x2@acme.test");
        mvc.perform(post("/api/employees/{id}/deactivate", id));

        mvc.perform(post("/api/employees/{id}/deactivate", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }

    @Test
    void deleting_returns_no_content_and_hides_the_record() throws Exception {
        long id = create("E-6003", "x3@acme.test");

        mvc.perform(delete("/api/employees/{id}", id))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/employees/{id}", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleting_twice_returns_no_content_both_times() throws Exception {
        // Idempotent: the end state is identical, so the retry must report success.
        // A retry reporting failure for work that already succeeded is how
        // double-submits get invented - spec section 7.
        long id = create("E-6004", "x4@acme.test");
        mvc.perform(delete("/api/employees/{id}", id)).andExpect(status().isNoContent());

        mvc.perform(delete("/api/employees/{id}", id))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleting_an_id_that_never_existed_also_returns_no_content() throws Exception {
        mvc.perform(delete("/api/employees/{id}", 999_999_999L))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleting_frees_the_email_address_for_a_new_employee() throws Exception {
        long id = create("E-6005", "reusable@acme.test");
        mvc.perform(delete("/api/employees/{id}", id));

        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "E-6006", "fullName": "Second Person",
                          "email": "reusable@acme.test", "department": "ENGINEERING",
                          "countryCode": "IN", "role": "SOFTWARE_ENGINEER", "level": "SENIOR",
                          "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """))
                .andExpect(status().isCreated());
    }
}
