# Resolve docker compose vs legacy docker-compose (Ubuntu packages differ)
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  echo "Error: install Docker Compose (docker-compose-plugin or docker-compose package)"
  exit 1
fi
