package com.payscope.employee;

import com.payscope.employee.dto.CreateEmployeeRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
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
}
