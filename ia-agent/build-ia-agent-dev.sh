#!/bin/bash

set -e

echo "==> Parando os serviços de ia-agent-dev..."
docker-compose -f ../docker-compose-dev.yaml stop ia-agent-dev

echo "==> Removendo a imagem ia-agent-dev..."
docker-compose -f ../docker-compose-dev.yaml rm ia-agent-dev

echo "==> Buildando imagem ia-agent-dev..."
docker-compose -f ../docker-compose-dev.yaml build ia-agent-dev

echo "==> (Re)iniciando serviço ia-agent-dev..."
docker-compose -f ../docker-compose-dev.yaml up -d ia-agent-dev

echo "✅ Imagem e serviço atualizados!" 