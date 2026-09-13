package com.payscope.analytics;

import com.payscope.analytics.dto.DistributionGroup;
import com.payscope.analytics.dto.OutlierItem;
import com.payscope.analytics.dto.SummaryResponse;
import com.payscope.common.DomainException;
import com.payscope.common.PagedResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AnalyticsService {

    public static final int MAX_PAGE_SIZE = 100;

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

    @Transactional(readOnly = true)
    public PagedResponse<OutlierItem> outliers(AnalyticsFilter filter, int page, int size) {
        if (page < 0) {
            throw new DomainException("Page must not be negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new DomainException("Page size must be between 1 and " + MAX_PAGE_SIZE + ", was " + size);
        }
        return repository.outliers(filter, page, size);
    }
}
