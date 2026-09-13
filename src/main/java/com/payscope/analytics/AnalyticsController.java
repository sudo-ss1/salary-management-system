package com.payscope.analytics;

import com.payscope.analytics.dto.SummaryResponse;
import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    SummaryResponse summary(@RequestParam(required = false) String country,
                            @RequestParam(required = false) Department department,
                            @RequestParam(required = false) Role role,
                            @RequestParam(required = false) Level level,
                            @RequestParam(required = false) EmployeeStatus status) {
        return service.summary(new AnalyticsFilter(country, department, role, level, status));
    }
}
