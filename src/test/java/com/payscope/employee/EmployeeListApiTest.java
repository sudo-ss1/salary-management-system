package com.payscope.employee;

import com.jayway.jsonpath.JsonPath;
import com.payscope.support.DatabaseCleaner;
import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
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
    void accepts_any_case_of_desc_so_direction_parsing_matches_sort_parsing() throws Exception {
        mvc.perform(get("/api/employees").param("sort", "SALARY").param("direction", "DESC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].fullName").value("Ben Carter"));
    }

    @Test
    void rejects_an_unrecognised_direction_rather_than_silently_sorting_ascending() throws Exception {
        // "descending" is not "desc": the old behaviour (anything but a
        // case-insensitive "desc" sorts ascending) would silently return
        // ascending-sorted data here and tell the caller nothing.
        mvc.perform(get("/api/employees").param("sort", "SALARY").param("direction", "descending"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("asc")))
                .andExpect(jsonPath("$.detail", containsString("desc")));
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

    @Test
    void breaks_a_tie_on_id_so_paging_through_identical_full_names_neither_skips_nor_repeats_a_row()
            throws Exception {
        // Three employees that tie on the sort column itself (full_name). Without
        // a unique final sort key, ties among them have no defined relative order
        // at all - paging through them one at a time must still hit each one
        // exactly once, in a single well-defined order (ascending id).
        create("T-101", "Tied Person", "tie1@acme.test", "IN", "INR", "3712500.00", "ENGINEERING", "SENIOR");
        create("T-102", "Tied Person", "tie2@acme.test", "IN", "INR", "3712500.00", "ENGINEERING", "SENIOR");
        create("T-103", "Tied Person", "tie3@acme.test", "IN", "INR", "3712500.00", "ENGINEERING", "SENIOR");

        long id1 = idOf("tie1@acme.test");
        long id2 = idOf("tie2@acme.test");
        long id3 = idOf("tie3@acme.test");

        List<Long> seen = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            seen.add(idOnPage("q", "Tied Person", "sort", "FULL_NAME", page));
        }

        assertThat(seen).containsExactly(id1, id2, id3);
        // Membership alone (three distinct ids, union equal to the full set)
        // would also pass without the tiebreaker here, because full_name already
        // has a dedicated covering index - employee_default_sort on
        // (full_name, id) - so this particular sort column happens to get its
        // id-ordering for free from that index regardless of what the query's
        // ORDER BY clause says. Asserting the exact ascending sequence is the
        // stronger, still-correct property, and it is what the DEPARTMENT test
        // below actually needs in order to discriminate.
    }

    @Test
    void breaks_a_tie_on_id_when_the_sort_column_is_department_where_ties_are_the_normal_case()
            throws Exception {
        // Sorting by department, every row in one department ties by definition -
        // this is the ordinary case, not a coincidence like the full-name test
        // above. Unlike full_name, department has no covering index, so nothing
        // protects tie order here except the explicit id tiebreaker.
        //
        // The @BeforeEach fixture already has two ENGINEERING and two SALES
        // employees; three FINANCE employees keep department a genuine sort key
        // (not one Postgres can fold away as constant with an equality filter)
        // while sorting all seven unfiltered. ENGINEERING < FINANCE < SALES
        // alphabetically, so the FINANCE trio always occupies offsets 2-4 - what
        // the id tiebreaker controls is their order within that window.
        create("T-201", "Dep One",   "dep1@acme.test", "IN", "INR", "3712500.00", "FINANCE", "SENIOR");
        create("T-202", "Dep Two",   "dep2@acme.test", "IN", "INR", "3712500.00", "FINANCE", "SENIOR");
        create("T-203", "Dep Three", "dep3@acme.test", "IN", "INR", "3712500.00", "FINANCE", "SENIOR");

        long id1 = idOf("dep1@acme.test");
        long id2 = idOf("dep2@acme.test");
        long id3 = idOf("dep3@acme.test");

        List<Long> seen = new ArrayList<>();
        for (int page = 2; page < 5; page++) {
            seen.add(idOnPage(null, null, "sort", "DEPARTMENT", page));
        }

        assertThat(seen).containsExactly(id1, id2, id3);
    }

    /** The id of the single row on a size=1 page of the given sort, with an optional filter. */
    private long idOnPage(String filterParam, String filterValue, String sortParam, String sortValue, int page)
            throws Exception {
        var request = get("/api/employees")
                .param(sortParam, sortValue)
                .param("size", "1")
                .param("page", String.valueOf(page));
        if (filterParam != null) {
            request.param(filterParam, filterValue);
        }
        String body = mvc.perform(request).andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(body, "$.content[0].id");
        return id.longValue();
    }

    /** Resolves an employee id by email through the list endpoint. */
    private long idOf(String email) throws Exception {
        String body = mvc.perform(get("/api/employees").param("q", email))
                .andReturn().getResponse().getContentAsString();
        int idIndex = body.indexOf("\"id\":") + 5;
        return Long.parseLong(body.substring(idIndex, body.indexOf(',', idIndex)).trim());
    }
}
