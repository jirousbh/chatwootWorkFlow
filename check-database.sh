#!/bin/bash

# Script para verificar se as tabelas do sistema de workflows foram criadas
# Autor: InovaAI Analytics

echo "🔍 Verificando tabelas do sistema de workflows..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se o PostgreSQL está rodando
echo -n "🔍 Verificando PostgreSQL... "
if docker-compose ps postgres | grep -q "Up"; then
    echo -e "${GREEN}✅ RODANDO${NC}"
else
    echo -e "${RED}❌ PARADO${NC}"
    echo "💡 Execute: docker-compose up -d postgres"
    exit 1
fi

# Verificar se o sistema de workflows está rodando
echo -n "🔍 Verificando sistema de workflows... "
if docker-compose ps chatbot-workflows | grep -q "Up"; then
    echo -e "${GREEN}✅ RODANDO${NC}"
else
    echo -e "${YELLOW}⚠️  PARADO${NC}"
    echo "💡 Execute: ./start-workflows.sh"
fi

# Verificar tabelas no banco de dados
echo ""
echo "📊 Verificando tabelas no banco de dados:"
echo "========================================"

# Função para verificar tabela
check_table() {
    local table_name=$1
    local description=$2
    
    echo -n "🔍 Verificando $description... "
    
    # Executar query para verificar se a tabela existe
    result=$(docker-compose exec -T postgres psql -U postgres -d chatwoot -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table_name');" 2>/dev/null | tr -d ' ')
    
    if [ "$result" = "t" ]; then
        echo -e "${GREEN}✅ EXISTE${NC}"
        
        # Contar registros
        count=$(docker-compose exec -T postgres psql -U postgres -d chatwoot -t -c "SELECT COUNT(*) FROM $table_name;" 2>/dev/null | tr -d ' ')
        echo "   📈 Registros: $count"
    else
        echo -e "${RED}❌ NÃO EXISTE${NC}"
    fi
}

# Verificar tabelas principais
check_table "workflow_conversations" "Tabela de conversas"
check_table "workflow_interactions" "Tabela de interações"
check_table "workflow_configs" "Tabela de configurações"

echo ""
echo "🎯 Verificando dados de exemplo:"
echo "================================"

# Verificar se há workflows configurados
echo -n "🔍 Verificando workflows configurados... "
workflow_count=$(docker-compose exec -T postgres psql -U postgres -d chatwoot -t -c "SELECT COUNT(*) FROM workflow_configs;" 2>/dev/null | tr -d ' ')

if [ "$workflow_count" -gt 0 ]; then
    echo -e "${GREEN}✅ $workflow_count workflows encontrados${NC}"
    
    # Listar workflows
    echo "   📋 Workflows disponíveis:"
    docker-compose exec -T postgres psql -U postgres -d chatwoot -c "SELECT workflow_name, is_active FROM workflow_configs;" 2>/dev/null
else
    echo -e "${YELLOW}⚠️  Nenhum workflow configurado${NC}"
fi

# Verificar conversas ativas
echo -n "🔍 Verificando conversas ativas... "
active_conversations=$(docker-compose exec -T postgres psql -U postgres -d chatwoot -t -c "SELECT COUNT(*) FROM workflow_conversations WHERE status = 'active';" 2>/dev/null | tr -d ' ')
echo -e "${GREEN}✅ $active_conversations conversas ativas${NC}"

# Verificar conversas finalizadas
echo -n "🔍 Verificando conversas finalizadas... "
completed_conversations=$(docker-compose exec -T postgres psql -U postgres -d chatwoot -t -c "SELECT COUNT(*) FROM workflow_conversations WHERE status = 'completed';" 2>/dev/null | tr -d ' ')
echo -e "${GREEN}✅ $completed_conversations conversas finalizadas${NC}"

echo ""
echo "🔧 Verificando índices:"
echo "======================="

# Verificar índices
check_index() {
    local index_name=$1
    local description=$2
    
    echo -n "🔍 Verificando $description... "
    
    result=$(docker-compose exec -T postgres psql -U postgres -d chatwoot -t -c "SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = '$index_name');" 2>/dev/null | tr -d ' ')
    
    if [ "$result" = "t" ]; then
        echo -e "${GREEN}✅ EXISTE${NC}"
    else
        echo -e "${RED}❌ NÃO EXISTE${NC}"
    fi
}

check_index "idx_workflow_conversations_contact_id" "Índice de contact_id"
check_index "idx_workflow_conversations_status" "Índice de status"

echo ""
echo "📝 Resumo:"
echo "=========="

# Verificar se tudo está funcionando
if [ "$workflow_count" -gt 0 ]; then
    echo -e "${GREEN}🎉 Sistema de workflows configurado corretamente!${NC}"
    echo ""
    echo "💡 Próximos passos:"
    echo "1. Configure o WhatsApp Business API"
    echo "2. Configure o webhook no Meta for Developers"
    echo "3. Teste enviando 'oi' para o WhatsApp"
    echo ""
    echo "📊 Para ver estatísticas: curl http://localhost:3001/api/stats"
    echo "🏥 Para health check: curl http://localhost:3001/health"
else
    echo -e "${YELLOW}⚠️  Sistema precisa ser inicializado${NC}"
    echo ""
    echo "💡 Execute: ./start-workflows.sh"
fi 