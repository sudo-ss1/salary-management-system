package com.payscope.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

@TestConfiguration(proxyBeanMethods = false)
public class ContainerConfig {

    /**
     * One container per Spring test context. Because the context is cached across
     * test classes, the whole suite shares a single Postgres and Flyway runs once.
     * reWriteBatchedInserts matches production so batch behaviour is tested, not assumed.
     */
    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgres() {
        return new PostgreSQLContainer<>("postgres:16-alpine")
                .withUrlParam("reWriteBatchedInserts", "true");
    }
}
