package com.payscope.seed;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Starts the seed on boot. Deliberately separate from {@link Seeder}: calling a
 * @Transactional method from another method of the same bean is self-invocation,
 * which bypasses the Spring proxy. The transaction would never begin, and
 * pg_advisory_xact_lock - which releases on commit - would never hold. Tests
 * would not catch it, because they call Seeder.seed() from outside, through the
 * proxy, where the annotation does apply.
 */
@Component
public class SeedRunner implements ApplicationRunner {

    private final Seeder seeder;
    private final SeedProperties properties;

    public SeedRunner(Seeder seeder, SeedProperties properties) {
        this.seeder = seeder;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (properties.isEnabled()) {
            seeder.seed();
        }
    }
}
