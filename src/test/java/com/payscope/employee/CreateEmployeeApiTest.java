package com.payscope.employee;

import com.payscope.support.FixedClockConfig;
import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
@AutoConfigureMockMvc
@Import(FixedClockConfig.class)
class CreateEmployeeApiTest {

    @Autowired
    MockMvc mvc;

    private String requestBody(String employeeNumber, String email, String amount, String currency,
                               String countryCode, String hireDate) {
        return """
                {
                  "employeeNumber": "%s",
                  "fullName": "Asha Menon",
                  "email": "%s",
                  "department": "ENGINEERING",
                  "countryCode": "%s",
                  "role": "SOFTWARE_ENGINEER",
                  "level": "SENIOR",
                  "employmentType": "FULL_TIME",
                  "hireDate": "%s",
                  "salary": { "amount": "%s", "currency": "%s" },
                  "salaryEffectiveFrom": "%s"
                }
                """.formatted(employeeNumber, email, countryCode, hireDate, amount, currency, hireDate);
    }

    @Test
    void creates_an_employee_with_an_initial_salary_and_returns_its_location() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2001", "create1@acme.test", "3500000.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/employees/\\d+")));
    }

    @Test
    void rejects_a_malformed_email_with_a_field_level_error() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2002", "not-an-email", "3500000.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors[0].field").value("email"));
    }

    @Test
    void rejects_a_salary_denominated_in_a_currency_the_country_does_not_use() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2003", "create3@acme.test", "80000.00", "GBP", "IN", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("INR")))
                .andExpect(jsonPath("$.detail", containsString("GBP")));
    }

    @Test
    void rejects_a_hire_date_in_the_future() throws Exception {
        // The fixed clock reads 2026-09-12, so this date has not happened yet.
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2004", "create4@acme.test", "3500000.00", "INR", "IN", "2027-01-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("future")));
    }

    @Test
    void rejects_a_salary_that_is_not_strictly_positive() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2005", "create5@acme.test", "0.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("positive")));
    }

    @Test
    void rejects_an_unknown_country() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2006", "create6@acme.test", "3500000.00", "INR", "ZZ", "2024-03-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("ZZ")));
    }

    @Test
    void rejects_a_second_employee_with_the_same_email_as_a_conflict() throws Exception {
        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                .content(requestBody("E-2007", "dupe@acme.test", "3500000.00", "INR", "IN", "2024-03-01")));

        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON)
                        .content(requestBody("E-2008", "dupe@acme.test", "3500000.00", "INR", "IN", "2024-03-01")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"));
    }

    @Test
    void rejects_an_unparseable_enum_with_four_hundred_and_lists_the_permitted_values() throws Exception {
        String body = requestBody("E-2009", "create9@acme.test", "3500000.00", "INR", "IN", "2024-03-01")
                .replace("\"SENIOR\"", "\"ARCHMAGE\"");

        mvc.perform(post("/api/employees").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("SENIOR")));
    }
}
