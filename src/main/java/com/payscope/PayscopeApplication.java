package com.payscope;

import com.payscope.seed.SeedProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(SeedProperties.class)
public class PayscopeApplication {
    public static void main(String[] args) {
        SpringApplication.run(PayscopeApplication.class, args);
    }
}
