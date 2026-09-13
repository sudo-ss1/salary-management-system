package com.payscope;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.servlet.mvc.method.RequestMappingInfoHandlerMapping;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The README lists the API. This fails if an endpoint exists that the README
 * does not mention, so the documentation cannot silently drift.
 */
@IntegrationTest
class DocumentedEndpointsTest {

    @Autowired
    RequestMappingInfoHandlerMapping handlerMapping;

    @Test
    void every_api_path_appears_in_the_readme() throws Exception {
        String readme = Files.readString(Path.of("README.md"));

        handlerMapping.getHandlerMethods().keySet().stream()
                .flatMap(info -> info.getPathPatternsCondition().getPatterns().stream())
                .map(Object::toString)
                .filter(path -> path.startsWith("/api/"))
                .distinct()
                .forEach(path -> assertThat(readme)
                        .as("README.md must document %s", path)
                        .contains(path));
    }
}
