package com.payscope.support;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.springframework.stereotype.Component;

/**
 * Counts JDBC statements Hibernate prepares while a block runs. Requires
 * hibernate.generate_statistics, enabled in the test profile only.
 */
@Component
public class QueryCounter {

    private final Statistics statistics;

    public QueryCounter(EntityManagerFactory emf) {
        this.statistics = emf.unwrap(SessionFactory.class).getStatistics();
    }

    public long countStatements(Runnable work) {
        statistics.clear();
        work.run();
        return statistics.getPrepareStatementCount();
    }
}
