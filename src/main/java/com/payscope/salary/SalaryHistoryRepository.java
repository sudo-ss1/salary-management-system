package com.payscope.salary;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SalaryHistoryRepository extends JpaRepository<SalaryHistory, Long> {

    List<SalaryHistory> findByEmployeeIdOrderByEffectiveToDesc(Long employeeId);
}
