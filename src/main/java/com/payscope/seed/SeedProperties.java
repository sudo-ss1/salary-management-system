package com.payscope.seed;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "payscope.seed")
public class SeedProperties {

    private boolean enabled = false;
    private int employeeCount = 10_000;
    /** Fixed, so the same population appears on every run - CLAUDE.md bans unseeded randomness. */
    private long randomSeed = 20260912L;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public int getEmployeeCount() { return employeeCount; }
    public void setEmployeeCount(int employeeCount) { this.employeeCount = employeeCount; }
    public long getRandomSeed() { return randomSeed; }
    public void setRandomSeed(long randomSeed) { this.randomSeed = randomSeed; }
}
