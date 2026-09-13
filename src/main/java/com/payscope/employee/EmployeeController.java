package com.payscope.employee;

import com.payscope.employee.dto.CreateEmployeeRequest;
import com.payscope.employee.dto.EmployeeDetailResponse;
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
