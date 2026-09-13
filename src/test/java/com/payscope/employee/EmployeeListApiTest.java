package com.payscope.employee;

import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
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
class EmployeeListApiTest {

    @Autowired
    MockMvc mvc;

    private void create(String number, String name, String email, String country, String currency,
                        String amount, String department, String level) throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                {
                  "employeeNumber": "%s", "fullName": "%s", "email": "%s",
                  "department": "%s", "countryCode": "%s", "role": "SOFTWARE_ENGINEER",
                  "level": "%s", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                  "salary": { "amount": "%s", "currency": "%s" },
                  "salaryEffectiveFrom": "2024-03-01"
                }
                """.formatted(number, name, email, department, country, level, amount, currency)))
                .andExpect(status().isCreated());
    }

    @Autowired
    DatabaseCleaner cleaner;

    @BeforeEach
    void seed() throws Exception {
        // totalElements is a global count; earlier test classes leave rows behind.
        cleaner.clean();
        create("L-001", "Asha Menon",  "l1@acme.test", "IN", "INR", "3712500.00", "ENGINEERING", "SENIOR");
        create("L-002", "Ben Carter",  "l2@acme.test", "GB", "GBP", "100000.00",  "ENGINEERING", "MID");
        create("L-003", "Chen Wei",    "l3@acme.test", "SG", "SGD", "120000.00",  "SALES",       "SENIOR");
        create("L-004", "Dana Silva",  "l4@acme.test", "BR", "BRL", "300000.00",  "SALES",       "JUNIOR");
    }

    @Test
    void returns_the_first_page_sorted_by_name_with_page_metadata() throws Exception {
        mvc.perform(get("/api/employees").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].fullName").value("Asha Menon"))
                .andExpect(jsonPath("$.content[1].fullName").value("Ben Carter"))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void filters_by_country() throws Exception {
        mvc.perform(get("/api/employees").param("country", "IN"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].countryCode").value("IN"));
    }

    @Test
    void filters_by_department_and_level_together() throws Exception {
        mvc.perform(get("/api/employees").param("department", "SALES").param("level", "SENIOR"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].fullName").value("Chen Wei"));
    }

    @Test
    void searches_across_name_email_and_employee_number_case_insensitively() throws Exception {
        mvc.perform(get("/api/employees").param("q", "carter"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].fullName").value("Ben Carter"));

        mvc.perform(get("/api/employees").param("q", "L-003"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void sorts_by_base_salary_descending_so_the_comparison_is_currency_neutral() throws Exception {
        // Base USD: Asha 44550, Ben 127000, Chen 88800, Dana 57000
        mvc.perform(get("/api/employees").param("sort", "SALARY").param("direction", "desc"))
                .andExpect(jsonPath("$.content[0].fullName").value("Ben Carter"))
                .andExpect(jsonPath("$.content[1].fullName").value("Chen Wei"));
    }

    @Test
    void excludes_soft_deleted_employees_from_the_list() throws Exception {
        String location = mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content("""
                        {
                          "employeeNumber": "L-005", "fullName": "Erased Person", "email": "l5@acme.test",
                          "department": "ENGINEERING", "countryCode": "IN", "role": "SOFTWARE_ENGINEER",
                          "level": "SENIOR", "employmentType": "FULL_TIME", "hireDate": "2024-03-01",
                          "salary": { "amount": "3712500.00", "currency": "INR" },
                          "salaryEffectiveFrom": "2024-03-01"
                        }
                        """)).andReturn().getResponse().getHeader("Location");
        mvc.perform(delete(location)).andExpect(status().isNoContent());

        mvc.perform(get("/api/employees").param("q", "Erased"))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void includes_inactive_employees_unless_the_status_filter_excludes_them() throws Exception {
        mvc.perform(post("/api/employees/{id}/deactivate", idOf("l2@acme.test")));

        mvc.perform(get("/api/employees"))
                .andExpect(jsonPath("$.totalElements").value(4));
        mvc.perform(get("/api/employees").param("status", "ACTIVE"))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void rejects_a_page_size_above_one_hundred_rather_than_clamping_it() throws Exception {
        mvc.perform(get("/api/employees").param("size", "500"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("100")));
    }

    @Test
    void rejects_a_page_size_below_one() throws Exception {
        mvc.perform(get("/api/employees").param("size", "0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejects_a_sort_field_that_is_not_on_the_whitelist() throws Exception {
        mvc.perform(get("/api/employees").param("sort", "email; drop table employee"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("FULL_NAME")));
    }

    @Test
    void rejects_an_unknown_level_filter_and_lists_the_permitted_values() throws Exception {
        mvc.perform(get("/api/employees").param("level", "ARCHMAGE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("SENIOR")));
    }

    /** Resolves an employee id by email through the list endpoint. */
    private long idOf(String email) throws Exception {
        String body = mvc.perform(get("/api/employees").param("q", email))
                .andReturn().getResponse().getContentAsString();
        int idIndex = body.indexOf("\"id\":") + 5;
        return Long.parseLong(body.substring(idIndex, body.indexOf(',', idIndex)).trim());
    }
}
