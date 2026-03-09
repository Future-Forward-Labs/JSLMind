# Pre-built JAR approach: build with `mvn package -DskipTests` on the host first,
# then COPY the JAR into the image. This avoids Maven pulling deps through the
# corporate proxy (Netskope) inside the Docker build layer.
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY target/jslmind-integration-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
