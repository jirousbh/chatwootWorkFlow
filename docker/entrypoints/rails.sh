#!/bin/bash

# Script de entrypoint para o container Rails
# Executa configurações automáticas e inicia o servidor

set -e

echo "🚀 Iniciando container Rails..."

# Função para executar o script de logos
run_logos_script() {
    echo "🎨 Executando configuração automática de logos..."
    
    # Aguardar um pouco para garantir que o banco esteja pronto
    sleep 10
    
    # Executar o script de logos
    if [ -f "/app/scripts/copy_logos_to_container.sh" ]; then
        chmod +x /app/scripts/copy_logos_to_container.sh
        /app/scripts/copy_logos_to_container.sh
        echo "✅ Script de logos executado com sucesso!"
    else
        echo "⚠️  Script de logos não encontrado em /app/scripts/"
    fi
}

# Executar o script de logos em background
run_logos_script &

# Executar o comando original
echo "🔄 Iniciando servidor Rails..."
exec "$@" 