#!/bin/bash

# Script de instalação do sistema de debounce de botões
# Este script cria a tabela necessária e executa os testes

echo "🚀 Instalando sistema de debounce de botões..."
echo "================================================"

# Verificar se as variáveis de ambiente estão configuradas
if [ -z "$DB_HOST" ]; then
    echo "⚠️  DB_HOST não configurado, usando localhost"
    export DB_HOST=localhost
fi

if [ -z "$DB_PORT" ]; then
    echo "⚠️  DB_PORT não configurado, usando 5432"
    export DB_PORT=5432
fi

if [ -z "$DB_NAME" ]; then
    echo "⚠️  DB_NAME não configurado, usando chatwoot_production"
    export DB_NAME=chatwoot_production
fi

if [ -z "$DB_USERNAME" ]; then
    echo "⚠️  DB_USERNAME não configurado, usando postgres"
    export DB_USERNAME=postgres
fi

if [ -z "$DB_PASSWORD" ]; then
    echo "⚠️  DB_PASSWORD não configurado, usando chatwoot"
    export DB_PASSWORD=chatwoot
fi

echo ""
echo "📊 Configuração do banco de dados:"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USERNAME"
echo ""

# 1. Criar a tabela button_debounce
echo "1️⃣ Criando tabela button_debounce..."
if psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USERNAME" -f create-button-debounce-table.sql; then
    echo "   ✅ Tabela button_debounce criada com sucesso"
else
    echo "   ❌ Erro ao criar tabela button_debounce"
    exit 1
fi

echo ""

# 2. Verificar se a tabela foi criada
echo "2️⃣ Verificando se a tabela foi criada..."
if psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USERNAME" -c "\d button_debounce" > /dev/null 2>&1; then
    echo "   ✅ Tabela button_debounce existe e está acessível"
else
    echo "   ❌ Tabela button_debounce não foi criada ou não está acessível"
    exit 1
fi

echo ""

# 3. Executar teste do sistema de debounce
echo "3️⃣ Executando teste do sistema de debounce..."
if node test-button-debounce.js; then
    echo "   ✅ Teste do sistema de debounce executado com sucesso"
else
    echo "   ❌ Erro ao executar teste do sistema de debounce"
    exit 1
fi

echo ""
echo "🎉 Instalação do sistema de debounce concluída com sucesso!"
echo ""
echo "📋 Resumo do que foi instalado:"
echo "   ✅ Tabela button_debounce criada"
echo "   ✅ Índices otimizados criados"
echo "   ✅ Sistema de debounce testado"
echo ""
echo "🔧 Para usar o sistema:"
echo "   1. Reinicie o serviço do chatbot workflow"
echo "   2. O sistema começará a funcionar automaticamente"
echo "   3. Monitore os logs para verificar o funcionamento"
echo ""
echo "📖 Documentação: SOLUCAO_DEBOUNCE_BOTOES.md"
echo "🧪 Teste: test-button-debounce.js"
echo "🗄️  Script SQL: create-button-debounce-table.sql"
