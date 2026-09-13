package com.payscope.employee;

import com.payscope.common.DomainException;
import com.payscope.common.PagedResponse;
import com.payscope.employee.dto.CreateEmployeeRequest;
import com.payscope.employee.dto.EmployeeDetailResponse;
import com.payscope.employee.dto.EmployeeListItem;
import com.payscope.employee.dto.UpdateEmployeeRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/api/employees")
public class EmployeeController {

    private final EmployeeService service;

    public EmployeeController(EmployeeService service) {
        this.service = service;
    }

    @PostMapping
    ResponseEntity<Void> create(@Valid @RequestBody CreateEmployeeRequest request) {
        Long id = service.create(request);
        return ResponseEntity.created(URI.create("/api/employees/" + id)).build();
    }

    @GetMapping
    PagedResponse<EmployeeListItem> list(
            @RequestParam(required = false) String country,
            @RequestParam(required = false) Department department,
            @RequestParam(required = false) Level level,
            @RequestParam(required = false) EmployeeStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "asc") String direction) {

        return service.search(new EmployeeQuery(country, department, level, status, q, page, size,
                EmployeeSort.parse(sort), parseAscending(direction)));
    }

    /**
     * Parsed the same way EmployeeSort.parse is: a closed set of two permitted
     * values, case-insensitive, a 400 for anything else. Silently treating an
     * unrecognised direction as ascending would tell a caller nothing when they
     * sent "descending" or a typo and got the opposite of what they asked for.
     */
    private static boolean parseAscending(String direction) {
        if ("asc".equalsIgnoreCase(direction)) {
            return true;
        }
        if ("desc".equalsIgnoreCase(direction)) {
            return false;
        }
        throw new DomainException("Cannot sort direction by '" + direction + "'. Permitted values: asc, desc");
    }

    @GetMapping("/{id}")
    EmployeeDetailResponse detail(@PathVariable Long id) {
        return service.detail(id);
    }

    @PutMapping("/{id}")
    EmployeeDetailResponse update(@PathVariable Long id, @Valid @RequestBody UpdateEmployeeRequest request) {
        return service.update(id, request);
    }

    @PostMapping("/{id}/deactivate")
    EmployeeDetailResponse deactivate(@PathVariable Long id) {
        return service.deactivate(id);
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@PathVariable Long id) {
        service.softDelete(id);
        return ResponseEntity.noContent().build();
    }
}
