package com.payscope.analytics;

import com.payscope.analytics.dto.DistributionGroup;
import com.payscope.analytics.dto.OutlierItem;
import com.payscope.analytics.dto.SummaryResponse;
import com.payscope.common.PagedResponse;
import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.Level;
import com.payscope.employee.Role;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

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

    @GetMapping("/distribution")
    List<DistributionGroup> distribution(@RequestParam(required = false) List<String> groupBy,
                                         @RequestParam(required = false) String country,
                                         @RequestParam(required = false) Department department,
                                         @RequestParam(required = false) Role role,
                                         @RequestParam(required = false) Level level,
                                         @RequestParam(required = false) EmployeeStatus status) {
        return service.distribution(new AnalyticsFilter(country, department, role, level, status),
                GroupByDimension.parse(groupBy));
    }

    @GetMapping("/outliers")
    PagedResponse<OutlierItem> outliers(@RequestParam(required = false) String country,
                                        @RequestParam(required = false) Department department,
                                        @RequestParam(required = false) Role role,
                                        @RequestParam(required = false) Level level,
                                        @RequestParam(required = false) EmployeeStatus status,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "25") int size) {
        return service.outliers(new AnalyticsFilter(country, department, role, level, status), page, size);
    }
}
