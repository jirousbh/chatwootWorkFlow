#!/bin/bash

echo "🔄 Reiniciando containers com correções de timezone..."

# Parar containers
echo "⏹️ Parando containers..."
docker-compose down

# Rebuild do container chatbot-workflows com nova configuração de timezone
echo "🔨 Rebuild do container chatbot-workflows..."
docker-compose build chatbot-workflows

# Iniciar containers
echo "▶️ Iniciando containers..."
docker-compose up -d

# Aguardar um pouco para os serviços inicializarem
echo "⏳ Aguardando inicialização dos serviços..."
sleep 10

# Verificar status dos containers
echo "📊 Status dos containers:"
docker-compose ps

# Testar timezone do PostgreSQL
echo "🌍 Verificando timezone do PostgreSQL..."
docker-compose exec postgres psql -U postgres -d chatwoot -c "SHOW timezone;"

# Testar timezone do container chatbot-workflows
echo "🌍 Verificando timezone do chatbot-workflows..."
docker-compose exec chatbot-workflows date

echo "✅ Reinicialização concluída!"
echo ""
echo "📝 Para testar o agendamento, execute:"
echo "   docker-compose exec chatbot-workflows node test-scheduling.js" 