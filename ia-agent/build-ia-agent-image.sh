#!/bin/bash

set -e

echo "==> Parando os serviços de ia-agent-prd..."
docker compose -f ../docker-compose.yaml stop ia-agent-prd

echo "==> Removendo a imagem ia-agent-prd..."
docker compose -f ../docker-compose.yaml rm -f ia-agent-prd 

echo "==> Buildando imagem ia-agent-prd..."
docker compose -f ../docker-compose.yaml build ia-agent-prd

echo "==> (Re)iniciando serviço ia-agent-prd..."
docker compose -f ../docker-compose.yaml up -d ia-agent-prd

echo "✅ Imagem e serviço atualizados!" 