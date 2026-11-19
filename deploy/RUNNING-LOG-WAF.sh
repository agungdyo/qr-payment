#!/bin/bash
docker compose -f deploy/docker-compose.yml logs --tail=100 -f waf
