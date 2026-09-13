package com.payscope.employee;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "employee")
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_number")
    private String employeeNumber;

    @Column(name = "full_name")
    private String fullName;

    private String email;

    @Enumerated(EnumType.STRING)
    private Department department;

    @Column(name = "country_code")
    private String countryCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_role")
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_level")
    private Level level;

    @Enumerated(EnumType.STRING)
    @Column(name = "employment_type")
    private EmploymentType employmentType;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Enumerated(EnumType.STRING)
    private EmployeeStatus status;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Version
    private Long version;

    protected Employee() {
    }

    public static Employee create(String employeeNumber, String fullName, String email,
                                  Department department, String countryCode, Role role, Level level,
                                  EmploymentType employmentType, LocalDate hireDate) {
        Employee employee = new Employee();
        employee.employeeNumber = employeeNumber;
        employee.fullName = fullName;
        employee.email = email;
        employee.department = department;
        employee.countryCode = countryCode;
        employee.role = role;
        employee.level = level;
        employee.employmentType = employmentType;
        employee.hireDate = hireDate;
        employee.status = EmployeeStatus.ACTIVE;
        return employee;
    }

    public void rename(String fullName) {
        this.fullName = fullName;
    }

    public void changeEmail(String email) {
        this.email = email;
    }

    public void reassign(Department department, Role role, Level level, EmploymentType employmentType) {
        this.department = department;
        this.role = role;
        this.level = level;
        this.employmentType = employmentType;
    }

    /** The person left the company. The record stays visible and countable. */
    public void deactivate() {
        this.status = EmployeeStatus.INACTIVE;
    }

    /** The record should not exist. It disappears from every read - see ADR-0005. */
    public void softDelete(Instant at) {
        this.deletedAt = at;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public Long id() { return id; }
    public String employeeNumber() { return employeeNumber; }
    public String fullName() { return fullName; }
    public String email() { return email; }
    public Department department() { return department; }
    public String countryCode() { return countryCode; }
    public Role role() { return role; }
    public Level level() { return level; }
    public EmploymentType employmentType() { return employmentType; }
    public LocalDate hireDate() { return hireDate; }
    public EmployeeStatus status() { return status; }
    public Instant deletedAt() { return deletedAt; }
    public Long version() { return version; }
}
