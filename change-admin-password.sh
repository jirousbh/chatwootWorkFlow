#!/bin/bash

# Script para alterar senha do admin do sistema de workflows
# Uso: ./change-admin-password.sh [nova_senha]

if [ $# -eq 0 ]; then
    echo "❌ Erro: É necessário fornecer a nova senha"
    echo "📖 Uso: ./change-admin-password.sh [nova_senha]"
    echo "📝 Exemplo: ./change-admin-password.sh 'minha_nova_senha_123'"
    exit 1
fi

NEW_PASSWORD="$1"

echo "🔒 Alterando senha do admin do sistema de workflows..."
echo "🔐 Nova senha: $NEW_PASSWORD"

# Verificar se o container está rodando
if ! docker-compose ps | grep -q "chatbot-workflows.*Up"; then
    echo "❌ O container chatbot-workflows não está rodando!"
    echo "📌 Execute primeiro: docker-compose up -d"
    exit 1
fi

# Executar o script dentro do container
echo "🚀 Executando comando no container..."
docker compose exec chatbot-workflows node reset-admin-password.js "$NEW_PASSWORD"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Senha alterada com sucesso!"
    echo "👤 Usuário: admin"
    echo "🔑 Nova senha: $NEW_PASSWORD"
    echo ""
    echo "📌 Agora você pode fazer login no sistema de workflows com as novas credenciais."
else
    echo ""
    echo "❌ Erro ao alterar a senha. Verifique os logs acima."
fi 