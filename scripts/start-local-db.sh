#!/usr/bin/env bash
set -euo pipefail

# libsql-server in Docker for local Papra development
# Uses port 8090 (HTTP) and 5001 (gRPC) to avoid conflicts with common services
# Data is persisted in ./app-data/libsql-data

CONTAINER_NAME="papra-libsql"
HTTP_PORT="${LIBSQL_PORT:-8090}"
GRPC_PORT="${LIBSQL_GRPC_PORT:-5001}"
DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/app-data/libsql-data"

# Check if ports are available
for port in "$HTTP_PORT" "$GRPC_PORT"; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -P -n &>/dev/null; then
    echo "❌ Port $port is already in use. Set LIBSQL_PORT or LIBSQL_GRPC_PORT to override."
    exit 1
  fi
done

# Stop existing container if running
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
  echo "Stopping existing $CONTAINER_NAME container..."
  docker stop "$CONTAINER_NAME" >/dev/null
fi
docker rm -f "$CONTAINER_NAME" &>/dev/null || true

# Ensure data directory exists
mkdir -p "$DATA_DIR"

echo "Starting libsql-server on port $HTTP_PORT (HTTP) and $GRPC_PORT (gRPC)..."
echo "Data directory: $DATA_DIR"

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$HTTP_PORT":8080 \
  -p "$GRPC_PORT":5001 \
  -v "$DATA_DIR":/var/lib/sqld \
  ghcr.io/tursodatabase/libsql-server:latest

echo ""
echo "✅ libsql-server running at http://localhost:$HTTP_PORT"
echo ""
echo "Set this in your .env:"
echo "  DATABASE_URL=http://localhost:$HTTP_PORT"
echo ""
echo "To stop:  docker stop $CONTAINER_NAME"
echo "To logs:  docker logs -f $CONTAINER_NAME"
