#!/bin/bash

set -e

echo "==> Buildando imagem chatwoot-chatbot-workflows..."
docker compose build chatbot-workflows

echo "==> (Re)iniciando serviço chatbot-workflows..."
docker compose up -d chatbot-workflows

echo "✅ Imagem e serviço atualizados!" 