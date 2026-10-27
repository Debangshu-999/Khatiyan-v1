#!/usr/bin/env bash
# Builds the backend for a fast start: the jar, unpacked, plus a JDK 25 AOT cache
# recorded from one training start (2026-10-19). See docs/backend-aot-cache.md.
#
#   bash scripts/build-backend-aot.sh            build, unpack, train
#   bash scripts/build-backend-aot.sh --no-build use target/khatiyan-*.jar as it is
#
# Run it where the app will run, with the same JDK and the same environment
# (profile, .env, database reachable): the cache is only used by that exact JDK
# and that exact jar. The training start builds the whole Spring context and
# exits before the web server or any scheduled job starts.
#
# Do not build while `mvn spring-boot:run` is running from this folder: the build
# rewrites target/classes under it. Stop it first, or pass --no-build.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="build/aot"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"

version=$("$JAVA" -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.specification.version = //p')
if [ "${version%%.*}" -lt 25 ] 2>/dev/null || [ -z "$version" ]; then
  echo "Needs JDK 25 or later, found '${version:-unknown}' at $JAVA. Set JAVA_HOME." >&2
  exit 1
fi

if [ "${1:-}" != "--no-build" ]; then
  mvn -q package -DskipTests
fi
JAR=$(ls target/khatiyan-*.jar | grep -v -- '-plain' | head -1)

rm -rf "$OUT"
"$JAVA" -Djarmode=tools -jar "$JAR" extract --destination "$OUT/application" > /dev/null
APP="$OUT/application/$(basename "$JAR")"

echo "Training start (records the cache)..."
"$JAVA" -XX:AOTCacheOutput="$OUT/application/app.aot" -Xlog:aot=error \
  -Dspring.context.exit=onRefresh -jar "$APP" --server.port=0 > "$OUT/training.log" 2>&1 \
  || { echo "Training start failed, see $OUT/training.log" >&2; exit 1; }

echo "Done. Start the backend with:"
echo "  \"$JAVA\" -XX:AOTCache=$OUT/application/app.aot -jar $APP"
