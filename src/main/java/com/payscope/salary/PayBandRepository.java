package com.payscope.salary;

import com.payscope.employee.Level;
import com.payscope.employee.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PayBandRepository extends JpaRepository<PayBand, Long> {

    Optional<PayBand> findByRoleAndLevelAndCountryCode(Role role, Level level, String countryCode);
}
