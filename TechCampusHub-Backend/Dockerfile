# ============================================================
# TechCampus Hub — backend image (Render / Railway / any Docker host)
#
# Stage 1: build the Spring Boot fat jar with the official Maven
#          image (Maven + JDK 25 preinstalled). Using the Maven
#          image instead of the Maven wrapper avoids depending on
#          curl/wget inside the build container — the wrapper's
#          "only-script" mode has to download Maven at build time,
#          which is a common failure on minimal build images.
# Stage 2: slim JRE runtime.
#
# The image itself carries no environment-specific wiring: on Render
# the blueprint supplies PG_CONNECTION_URL (libpq form) and
# PgConnectionUrlEnvironmentPostProcessor converts it to JDBC settings
# at startup. Without it the app falls back to localhost dev defaults.
# ============================================================

# ---- Build stage ----
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace

# Keep the Maven JVM inside typical free-tier build limits.
ENV MAVEN_OPTS="-Xmx512m"

COPY . .
RUN mvn -B -DskipTests --no-transfer-progress package

# ---- Runtime stage ----
FROM eclipse-temurin:25-jre
WORKDIR /app

COPY --from=build /workspace/target/*.jar app.jar

# Respect the container memory limit (Render free = 512 MB).
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0"
ENV JAVA_OPTS=""

EXPOSE 8080

CMD ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
