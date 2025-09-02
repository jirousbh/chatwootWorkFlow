#!/bin/bash

# Script de teste para verificar o funcionamento do sistema
# Autor: InovaAI Analytics

echo "🧪 Testando Sistema Chatwoot + Workflows..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para testar serviço
test_service() {
    local name=$1
    local url=$2
    local description=$3
    
    echo -n "🔍 Testando $description... "
    
    if curl -s "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ FALHOU${NC}"
        return 1
    fi
}

# Função para verificar container
check_container() {
    local name=$1
    local description=$2
    
    echo -n "🔍 Verificando $description... "
    
    if docker-compose ps | grep -q "$name.*Up"; then
        echo -e "${GREEN}✅ RODANDO${NC}"
        return 0
    else
        echo -e "${RED}❌ PARADO${NC}"
        return 1
    fi
}

echo ""
echo "📋 Verificando Containers:"
echo "=========================="

# Verificar containers principais
check_container "rails" "Chatwoot Rails"
check_container "sidekiq" "Chatwoot Sidekiq"
check_container "postgres" "PostgreSQL"
check_container "redis" "Redis"
check_container "chatbot-workflows" "Sistema de Workflows"

echo ""
echo "🌐 Testando URLs:"
echo "================="

# Testar URLs
test_service "Chatwoot" "http://localhost:4500" "Chatwoot (porta 4500)"
test_service "Workflows API" "http://localhost:3001" "API de Workflows (porta 3001)"

echo ""
echo "🔧 Verificando Configurações:"
echo "============================="

# Verificar arquivos de configuração
if [ -f ".envinovai" ]; then
    echo -e "✅ Arquivo .envinovai encontrado"
else
    echo -e "${RED}❌ Arquivo .envinovai não encontrado${NC}"
fi

if [ -f "env-workflows" ]; then
    echo -e "✅ Arquivo env-workflows encontrado"
    
    # Verificar se as variáveis estão configuradas
    if grep -q "CHATWOOT_API_TOKEN" env-workflows; then
        echo -e "✅ CHATWOOT_API_TOKEN configurado"
    else
        echo -e "${YELLOW}⚠️  CHATWOOT_API_TOKEN não configurado${NC}"
    fi
    
    if grep -q "WHATSAPP_API_TOKEN" env-workflows; then
        echo -e "✅ WHATSAPP_API_TOKEN configurado"
    else
        echo -e "${YELLOW}⚠️  WHATSAPP_API_TOKEN não configurado${NC}"
    fi
else
    echo -e "${RED}❌ Arquivo env-workflows não encontrado${NC}"
fi

echo ""
echo "📊 Verificando Logs:"
echo "===================="

# Verificar se há erros nos logs
echo -n "🔍 Verificando logs do Chatwoot... "
if docker-compose logs --tail=10 rails | grep -q "ERROR\|FATAL"; then
    echo -e "${YELLOW}⚠️  Encontrados erros nos logs${NC}"
else
    echo -e "${GREEN}✅ Sem erros críticos${NC}"
fi

echo -n "🔍 Verificando logs dos Workflows... "
if docker-compose logs --tail=10 chatbot-workflows | grep -q "ERROR\|FATAL"; then
    echo -e "${YELLOW}⚠️  Encontrados erros nos logs${NC}"
else
    echo -e "${GREEN}✅ Sem erros críticos${NC}"
fi

echo ""
echo "🎯 Testes de API:"
echo "================="

# Testar API de workflows
echo -n "🔍 Testando API de workflows... "
if curl -s "http://localhost:3001/api/conversation/test" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API funcionando${NC}"
else
    echo -e "${RED}❌ API não responde${NC}"
fi

echo ""
echo "📝 Resumo:"
echo "=========="

# Contar containers rodando
running_containers=$(docker-compose ps | grep "Up" | wc -l)
total_containers=$(docker-compose ps | grep -v "NAME" | wc -l)

echo "📦 Containers: $running_containers/$total_containers rodando"

if [ $running_containers -eq $total_containers ]; then
    echo -e "${GREEN}🎉 Sistema funcionando corretamente!${NC}"
else
    echo -e "${YELLOW}⚠️  Alguns serviços podem não estar funcionando${NC}"
fi

echo ""
echo "💡 Próximos passos:"
echo "1. Configure o WhatsApp Business API"
echo "2. Configure o webhook no Meta for Developers"
echo "3. Teste enviando 'oi' para o WhatsApp"
echo ""
echo "📚 Documentação:"
echo "- Chatwoot: https://www.chatwoot.com/docs"
echo "- Workflows: workflows/README.md"
echo "- Configuração: workflows/setup-instructions.md" 