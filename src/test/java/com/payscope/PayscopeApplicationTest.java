package com.payscope;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class PayscopeApplicationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void starts_against_a_real_postgres_and_runs_flyway() {
        String version = jdbc.queryForObject("select version()", String.class);
        assertThat(version).contains("PostgreSQL");

        Integer historyTables = jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name = 'flyway_schema_history'",
                Integer.class);
        assertThat(historyTables).isEqualTo(1);
    }
}
