#!/bin/bash

# Script para parar o sistema de workflows de chatbot
# Autor: InovaAI Analytics

echo "🛑 Parando Sistema de Workflows de Chatbot..."

# Parar apenas os serviços de workflows
docker-compose stop chatbot-workflows nginx-workflows

echo "✅ Serviços de workflows parados!"
echo "💡 Para parar todos os serviços: docker-compose down"
echo "💡 Para ver logs: docker-compose logs chatbot-workflows" 