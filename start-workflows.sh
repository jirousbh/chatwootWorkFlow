#!/bin/bash

# Script para iniciar o sistema de workflows de chatbot
# Autor: InovaAI Analytics

echo "🚀 Iniciando Sistema de Workflows de Chatbot..."

# Verificar se o arquivo de ambiente existe
if [ ! -f "env-workflows" ]; then
    echo "❌ Arquivo env-workflows não encontrado!"
    echo "📝 Copie o arquivo workflows/env.example para env-workflows e configure as variáveis"
    exit 1
fi

# Verificar se o Chatwoot está rodando
echo "🔍 Verificando se o Chatwoot está rodando..."
if ! curl -s http://localhost:4500 > /dev/null; then
    echo "⚠️  Chatwoot não está rodando na porta 4500"
    echo "💡 Execute primeiro: docker-compose up -d"
    read -p "Deseja continuar mesmo assim? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Criar diretórios necessários
echo "📁 Criando diretórios necessários..."
mkdir -p data/workflows-logs

# Construir e iniciar os serviços de workflows
echo "🔨 Construindo e iniciando serviços de workflows..."
docker-compose up -d chatbot-workflows

# Verificar se o serviço iniciou corretamente
echo "⏳ Aguardando inicialização do sistema de workflows..."
sleep 10

if curl -s http://localhost:3001 > /dev/null; then
    echo "✅ Sistema de workflows iniciado com sucesso!"
    echo "🌐 Acesse: http://localhost:3001"
    echo "📱 Webhook WhatsApp: https://crm.inovaianalytics.com.br/webhook/whatsapp"
    echo "📊 Logs: docker-compose logs -f chatbot-workflows"
else
    echo "❌ Erro ao iniciar o sistema de workflows"
    echo "📋 Verifique os logs: docker-compose logs chatbot-workflows"
    exit 1
fi

echo ""
echo "🎯 Próximos passos:"
echo "1. Configure o WhatsApp Business API"
echo "2. Configure o webhook no Meta for Developers"
echo "3. Teste enviando 'oi' para o WhatsApp"
echo ""
echo "📚 Documentação: workflows/README.md"
echo "⚙️  Configuração: workflows/setup-instructions.md" 