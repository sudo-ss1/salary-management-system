package com.payscope.support;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Any assertion about a total is an assertion about the whole table, and the API
 * test classes commit rows that nothing rolls back. Called from @BeforeEach in
 * every count-sensitive test. Reference data seeded by Flyway is left untouched.
 */
@Component
public class DatabaseCleaner {

    private final JdbcTemplate jdbc;

    public DatabaseCleaner(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void clean() {
        jdbc.execute("truncate table salary_history, salary, employee restart identity cascade");
    }
}
