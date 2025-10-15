#!/bin/bash

set -e

echo "==> Parando os serviços de chatbot-workflows-prd..."
docker compose -f docker-compose.yaml stop chatbot-workflows-prd

echo "==> Removendo a imagem chatbot-workflows-prd..."
docker compose -f docker-compose.yaml rm chatbot-workflows-prd

echo "==> Buildando imagem chatbot-workflows-prd..."
docker compose -f docker-compose.yaml build chatbot-workflows-prd

echo "==> (Re)iniciando serviço chatbot-workflows..."
docker compose -f docker-compose.yaml up -d chatbot-workflows-prd

echo "✅ Imagem e serviço atualizados!" 