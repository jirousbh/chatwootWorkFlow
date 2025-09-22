#!/bin/bash

# Script de setup para o agente IA
# Este script ajuda a configurar o ambiente para o agente IA

echo "🤖 Setup do Agente IA - Chatwoot Workflows"
echo "=========================================="

# Verificar se Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker não está rodando. Inicie o Docker primeiro."
    exit 1
fi

# Verificar se o arquivo .env existe
if [ ! -f "../env-ia-agent-dev" ]; then
    echo "❌ Arquivo env-ia-agent-dev não encontrado."
    echo "📝 Copie o arquivo env-example para env-ia-agent-dev e configure as variáveis:"
    echo "   cp env-example ../env-ia-agent-dev"
    echo "   # Edite ../env-ia-agent-dev e adicione sua GROQ_API_KEY"
    exit 1
fi

# Verificar se GROQ_API_KEY está configurada
if ! grep -q "GROQ_API_KEY=" ../env-ia-agent-dev || grep -q "GROQ_API_KEY=your_groq_api_key_here" ../env-ia-agent-dev; then
    echo "⚠️  GROQ_API_KEY não configurada no arquivo env-ia-agent-dev"
    echo "📝 Configure sua chave da API Groq no arquivo ../env-ia-agent-dev"
    exit 1
fi

echo "✅ Arquivo de ambiente encontrado"

# Verificar se o banco de dados existe
echo "🔍 Verificando banco de dados..."
DB_EXISTS=$(docker exec postgres-dev psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='workflows_iaagent';" 2>/dev/null || echo "")

if [ "$DB_EXISTS" != "1" ]; then
    echo "📊 Criando banco de dados workflows_iaagent..."
    docker exec postgres-dev psql -U postgres -c "CREATE DATABASE workflows_iaagent;"
    
    if [ $? -eq 0 ]; then
        echo "✅ Banco de dados criado com sucesso"
    else
        echo "❌ Erro ao criar banco de dados"
        exit 1
    fi
else
    echo "✅ Banco de dados já existe"
fi

# Executar script SQL para criar tabelas
echo "🗃️  Criando tabelas..."
docker exec -i postgres-dev psql -U postgres -d workflows_iaagent < create-database.sql

if [ $? -eq 0 ]; then
    echo "✅ Tabelas criadas com sucesso"
else
    echo "❌ Erro ao criar tabelas"
    exit 1
fi

# Criar diretório de dados
echo "📁 Criando diretórios de dados..."
mkdir -p ../data/ia-agent-dev
echo "✅ Diretórios criados"

echo ""
echo "🎉 Setup concluído com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure sua GROQ_API_KEY no arquivo ../env-ia-agent-dev"
echo "2. Execute: docker-compose -f ../docker-compose-dev.yaml up ia-agent-dev --build"
echo "3. A API estará disponível em: http://localhost:3006"
echo ""
echo "📖 Documentação da API:"
echo "- GET  /health - Verificar status"
echo "- GET  /models - Listar modelos disponíveis"
echo "- GET  /agents - Listar agentes"
echo "- POST /agents - Criar agente"
echo "- POST /agents/{id}/upload-pdf - Upload de PDF"
echo "- POST /agents/{id}/chat - Conversar com agente"
echo ""
