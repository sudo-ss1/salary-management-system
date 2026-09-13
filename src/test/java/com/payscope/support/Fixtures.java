package com.payscope.support;

import com.payscope.common.MoneyDto;
import com.payscope.employee.Department;
import com.payscope.employee.EmployeeService;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import com.payscope.employee.dto.CreateEmployeeRequest;

import java.time.LocalDate;

/**
 * The fixed analytics dataset. Every expected value in the analytics tests is
 * computed by hand from this table - see the plan's Task 14 for the derivation.
 * Do not change an amount without recomputing every assertion that depends on it.
 */
public final class Fixtures {

    private static final LocalDate HIRED = LocalDate.of(2024, 3, 1);

    private Fixtures() {
    }

    public static void twelveEmployees(EmployeeService service) {
        // Germany: an even-sized group, so percentile_cont's interpolation is pinned.
        engineer(service, "F-G1", "g1@acme.test", "DE", "88000.00",  "EUR");
        engineer(service, "F-G2", "g2@acme.test", "DE", "99000.00",  "EUR");
        engineer(service, "F-G3", "g3@acme.test", "DE", "121000.00", "EUR");
        engineer(service, "F-G4", "g4@acme.test", "DE", "132000.00", "EUR");

        // United States: contains both outlier directions.
        engineer(service, "F-U1", "u1@acme.test", "US", "103950.00", "USD");
        engineer(service, "F-U2", "u2@acme.test", "US", "148500.00", "USD");
        engineer(service, "F-U3", "u3@acme.test", "US", "148500.00", "USD");
        engineer(service, "F-U4", "u4@acme.test", "US", "193050.00", "USD");

        // India: an odd-sized group, so its p50 is an actual observed value.
        engineer(service, "F-I1", "i1@acme.test", "IN", "2970000.00",  "INR");
        engineer(service, "F-I2", "i2@acme.test", "IN", "3712500.00",  "INR");
        engineer(service, "F-I3", "i3@acme.test", "IN", "4640625.00",  "INR");

        // No band exists for a principal recruiter. Counted in headcount and
        // payroll, excluded from compa-ratio, reported via unbandedCount.
        service.create(new CreateEmployeeRequest("F-N1", "Unbanded Person", "n1@acme.test",
                Department.PEOPLE, "US", Role.RECRUITER, Level.PRINCIPAL, EmploymentType.FULL_TIME,
                HIRED, new MoneyDto("200000.00", "USD"), HIRED));
    }

    private static void engineer(EmployeeService service, String number, String email,
                                 String country, String amount, String currency) {
        service.create(new CreateEmployeeRequest(number, "Engineer " + number, email,
                Department.ENGINEERING, country, Role.SOFTWARE_ENGINEER, Level.SENIOR,
                EmploymentType.FULL_TIME, HIRED, new MoneyDto(amount, currency), HIRED));
    }
}
