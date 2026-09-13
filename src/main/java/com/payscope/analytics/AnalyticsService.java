package com.payscope.analytics;

import com.payscope.analytics.dto.DistributionGroup;
import com.payscope.analytics.dto.SummaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AnalyticsService {

    private final AnalyticsRepository repository;

    public AnalyticsService(AnalyticsRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public SummaryResponse summary(AnalyticsFilter filter) {
        return repository.summary(filter);
    }

    @Transactional(readOnly = true)
    public List<DistributionGroup> distribution(AnalyticsFilter filter, List<GroupByDimension> groupBy) {
        return repository.distribution(filter, groupBy);
    }
}
