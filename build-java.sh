#!/usr/bin/env bash
# Build both Java modules on the host before docker compose up.
# Must be re-run after any change to workflows/ or integration/.
set -euo pipefail

JAVA_HOME=$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home)
export JAVA_HOME

echo "==> Building workflows module (Temporal CBMWorker)..."
cd "$(dirname "$0")/workflows"
mvn package install -DskipTests -q
echo "    workflows/target/jslmind-workflows-1.0.0.jar  ✓"

echo "==> Building integration module (Camel/Spring Boot)..."
cd "../integration"
mvn package -DskipTests -q
echo "    integration/target/jslmind-integration-*.jar  ✓"

cd ..
echo ""
echo "Both JARs built. Run 'docker compose up -d --build camel-integration cbm-worker' to apply."
