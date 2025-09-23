#!/bin/bash

set -e

echo "==> Parando os serviços de chatbot-workflows-dev..."
docker-compose -f docker-compose-dev.yaml stop chatbot-workflows-dev

echo "==> Removendo a imagem chatbot-workflows-dev..."
docker-compose -f docker-compose-dev.yaml rm chatbot-workflows-dev

echo "==> Buildando imagem chatbot-workflows-dev..."
docker-compose -f docker-compose-dev.yaml build chatbot-workflows-dev

echo "==> (Re)iniciando serviço chatbot-workflows..."
docker-compose -f docker-compose-dev.yaml up -d chatbot-workflows-dev

echo "✅ Imagem e serviço atualizados!" 