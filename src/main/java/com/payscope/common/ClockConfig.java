package com.payscope.common;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ClockConfig {

    /**
     * Injected everywhere a date or timestamp is needed. Services must never call
     * LocalDate.now() or Instant.now() directly - tests replace this with Clock.fixed.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
