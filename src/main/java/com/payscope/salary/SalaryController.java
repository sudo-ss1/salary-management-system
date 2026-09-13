package com.payscope.salary;

import com.payscope.salary.dto.RecordSalaryRequest;
import com.payscope.salary.dto.SalaryHistoryItem;
import com.payscope.salary.dto.SalaryResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/employees/{id}")
public class SalaryController {

    private final SalaryService service;

    public SalaryController(SalaryService service) {
        this.service = service;
    }

    /**
     * 200, not 201: /employees/{id}/salary is a singleton that was replaced. The
     * history row it produces is not separately addressable, so a Location
     * header would be fiction - spec section 8.
     */
    @PostMapping("/salary")
    SalaryResponse recordRaise(@PathVariable Long id, @Valid @RequestBody RecordSalaryRequest request) {
        return service.recordRaise(id, request);
    }

    @GetMapping("/salary-history")
    List<SalaryHistoryItem> history(@PathVariable Long id) {
        return service.historyFor(id);
    }
}
