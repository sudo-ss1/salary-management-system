package com.payscope.employee;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    Optional<Employee> findByIdAndDeletedAtIsNull(Long id);

    /**
     * PESSIMISTIC_READ maps to SELECT ... FOR SHARE on Postgres. A raise and a
     * soft delete touch different rows with different version columns, so they
     * do not naturally contend; this lock blocks a concurrent delete until the
     * raise commits - ADR-0007.
     */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select e from Employee e where e.id = :id and e.deletedAt is null")
    Optional<Employee> findByIdForShare(@Param("id") Long id);
}
