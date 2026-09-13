package com.payscope;

import com.payscope.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfoHandlerMapping;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The README lists the API. This fails if an endpoint exists that the README
 * does not mention, so the documentation cannot silently drift.
 */
@IntegrationTest
class DocumentedEndpointsTest {

    @Autowired
    RequestMappingInfoHandlerMapping handlerMapping;

    /** Every (method, path) the application serves, as "GET /api/employees". */
    private Set<String> mappedEndpoints() {
        Set<String> mapped = new TreeSet<>();
        handlerMapping.getHandlerMethods().forEach((info, handler) -> {
            Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
            info.getPathPatternsCondition().getPatterns().stream()
                    .map(Object::toString)
                    .filter(path -> path.startsWith("/api/"))
                    .forEach(path -> methods.forEach(m -> mapped.add(m.name() + " " + path)));
        });
        return mapped;
    }

    /** Every (method, path) the README's tables claim, parsed from their rows. */
    private Set<String> documentedEndpoints() throws Exception {
        Pattern row = Pattern.compile(
                "^\\|\\s*`(GET|POST|PUT|DELETE)`\\s*\\|\\s*`(/api/[^`]+)`");
        Set<String> documented = new TreeSet<>();
        for (String line : Files.readAllLines(Path.of("README.md"))) {
            Matcher m = row.matcher(line);
            if (m.find()) {
                documented.add(m.group(1) + " " + m.group(2));
            }
        }
        return documented;
    }

    @Test
    void the_readme_documents_exactly_the_endpoints_the_application_serves() throws Exception {
        // Both directions, and method-aware. Asserting only that each real path
        // appears somewhere in the README would pass while the table listed a
        // route that no longer exists, or gave a real route the wrong method.
        assertThat(documentedEndpoints())
                .as("README API tables must match the application's mappings exactly")
                .isEqualTo(mappedEndpoints());
    }
}
