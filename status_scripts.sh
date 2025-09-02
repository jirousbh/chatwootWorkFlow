#!/bin/bash

# Script para mostrar status dos scripts automatizados
# Autor: Sistema de Automação
# Data: $(date +%Y-%m-%d)

echo "📊 Status dos Scripts Automatizados"
echo "=================================="
echo "📅 Data/Hora: $(date)"
echo ""

# Função para mostrar status de um script
show_script_status() {
    local script_name="$1"
    local log_file="$2"
    local description="$3"
    local schedule="$4"
    
    echo "🔧 $script_name"
    echo "   📝 Descrição: $description"
    echo "   ⏰ Agendamento: $schedule"
    
    if [ -f "$log_file" ]; then
        local last_run=$(stat -c %y "$log_file" 2>/dev/null | cut -d' ' -f1,2)
        local size=$(du -h "$log_file" 2>/dev/null | cut -f1)
        echo "   📄 Log: $log_file"
        echo "   📅 Última execução: $last_run"
        echo "   📏 Tamanho do log: $size"
        
        # Mostrar últimas linhas do log
        echo "   📋 Últimas linhas do log:"
        tail -3 "$log_file" 2>/dev/null | sed 's/^/      /'
    else
        echo "   ❌ Log não encontrado"
    fi
    echo ""
}

# Status do script de cópia de logos
show_script_status \
    "copy_logos_to_container.sh" \
    "/root/chatwoot/cron.log" \
    "Copia logos e configurações para o container Chatwoot" \
    "Diariamente às 9h"

# Status do script de limpeza
show_script_status \
    "cleanup_logs.sh" \
    "/root/chatwoot/cleanup.log" \
    "Limpa logs e arquivos temporários antigos" \
    "Domingos às 2h"

# Status do script de monitoramento
show_script_status \
    "disk_monitor.sh" \
    "/root/chatwoot/disk_monitor.log" \
    "Monitora uso de disco e alerta sobre problemas" \
    "Diariamente às 6h"

# Verificar se os scripts existem
echo "📁 Verificação dos Scripts:"
for script in copy_logos_to_container.sh cleanup_logs.sh disk_monitor.sh; do
    if [ -f "$script" ] && [ -x "$script" ]; then
        echo "   ✅ $script - Existe e é executável"
    else
        echo "   ❌ $script - Não encontrado ou não executável"
    fi
done
echo ""

# Mostrar crontab atual
echo "⏰ Crontab Atual:"
crontab -l 2>/dev/null | while read line; do
    echo "   $line"
done
echo ""

# Verificar espaço em disco atual
echo "💿 Espaço em Disco Atual:"
df -h / | tail -1 | awk '{print "   • Total: " $2 " | Usado: " $3 " | Disponível: " $4 " | Uso: " $5}'
echo ""

# Verificar status do serviço cron
echo "🔄 Status do Serviço Cron:"
if systemctl is-active --quiet cron; then
    echo "   ✅ Cron está ativo"
else
    echo "   ❌ Cron não está ativo"
fi
echo ""

echo "✅ Verificação concluída!"
