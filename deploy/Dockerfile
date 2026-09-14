# Single-image build for a hosted demo: the Angular bundle and the Spring Boot
# jar in one container, nginx in front of both.
#
# docker-compose.yml remains the honest picture of how this is structured -
# three separate services. This image exists because a free hosting tier gives
# you one container and one port, and a reviewer clicking a link should not
# have to care. The trade-off is recorded in README's deployment section.

# --- 1. Angular bundle ----------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npx ng build

# --- 2. Spring Boot jar ---------------------------------------------------
FROM eclipse-temurin:21-jdk AS api
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B dependency:go-offline
COPY src/ src/
RUN ./mvnw -B -DskipTests package

# --- 3. Runtime -----------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache nginx

COPY --from=web /build/dist/web/browser /usr/share/nginx/html
COPY --from=api /build/target/payscope-*.jar /app/app.jar
COPY deploy/nginx.conf /etc/nginx/nginx.conf.template
COPY deploy/entrypoint.sh /app/entrypoint.sh

# There is no data to seed against otherwise: a hosted instance starts with an
# empty managed database. Seeding is idempotent under pg_advisory_xact_lock,
# so a restart or a second instance cannot double-seed.
ENV PAYSCOPE_SEED_ENABLED=true

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
