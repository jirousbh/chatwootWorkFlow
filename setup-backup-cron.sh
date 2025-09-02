#!/bin/bash

# Script para configurar backup automático do Chatwoot via cron
# Autor: Sistema de Backup Chatwoot
# Data: $(date +%Y-%m-%d)

set -e

# Configurações
BACKUP_SCRIPT="./backup-chatwoot.sh"
CRON_LOG="./backup-cron.log"
CRON_USER=$(whoami)

# Função para log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Função para mostrar uso
show_usage() {
    echo "Uso: $0 [opções]"
    echo ""
    echo "Opções:"
    echo "  --install          Instalar backup automático via cron"
    echo "  --uninstall        Remover backup automático do cron"
    echo "  --status           Verificar status do backup automático"
    echo "  --test             Testar script de backup"
    echo "  --help             Mostrar esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 --install       # Instalar backup automático"
    echo "  $0 --status        # Verificar status"
    echo "  $0 --uninstall     # Remover backup automático"
}

# Função para verificar se o script de backup existe
check_backup_script() {
    if [ ! -f "$BACKUP_SCRIPT" ]; then
        log "ERRO: Script de backup não encontrado: $BACKUP_SCRIPT"
        exit 1
    fi
    
    if [ ! -x "$BACKUP_SCRIPT" ]; then
        log "Tornando script de backup executável..."
        chmod +x "$BACKUP_SCRIPT"
    fi
}

# Função para instalar backup automático
install_backup_cron() {
    log "Instalando backup automático via cron..."
    
    # Verificar se já existe
    if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
        log "AVISO: Backup automático já está configurado"
        return 0
    fi
    
    # Criar entrada no cron para backup diário às 02:00
    local cron_entry="0 2 * * * cd $(pwd) && $BACKUP_SCRIPT >> $CRON_LOG 2>&1"
    
    # Adicionar ao crontab
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    
    if [ $? -eq 0 ]; then
        log "✓ Backup automático instalado com sucesso"
        log "Horário: Diariamente às 02:00"
        log "Log: $CRON_LOG"
    else
        log "ERRO: Falha ao instalar backup automático"
        return 1
    fi
}

# Função para remover backup automático
uninstall_backup_cron() {
    log "Removendo backup automático do cron..."
    
    # Verificar se existe
    if ! crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
        log "AVISO: Backup automático não está configurado"
        return 0
    fi
    
    # Remover entrada do cron
    crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
    
    if [ $? -eq 0 ]; then
        log "✓ Backup automático removido com sucesso"
    else
        log "ERRO: Falha ao remover backup automático"
        return 1
    fi
}

# Função para verificar status
check_status() {
    log "Verificando status do backup automático..."
    
    echo ""
    echo "=== STATUS DO BACKUP AUTOMÁTICO ==="
    
    # Verificar se está no cron
    if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
        echo "✓ Backup automático: ATIVO"
        echo "Configuração atual:"
        crontab -l | grep "$BACKUP_SCRIPT"
    else
        echo "✗ Backup automático: INATIVO"
    fi
    
    # Verificar se o script existe e é executável
    if [ -f "$BACKUP_SCRIPT" ] && [ -x "$BACKUP_SCRIPT" ]; then
        echo "✓ Script de backup: OK"
    else
        echo "✗ Script de backup: PROBLEMA"
    fi
    
    # Verificar diretório de backup
    if [ -d "./backup" ]; then
        echo "✓ Diretório de backup: OK"
        echo "Backups disponíveis:"
        ls -la ./backup/ | grep "chatwoot_backup_" | wc -l | xargs echo "  - Quantidade:"
    else
        echo "✗ Diretório de backup: NÃO ENCONTRADO"
    fi
    
    # Verificar log do cron
    if [ -f "$CRON_LOG" ]; then
        echo "✓ Log do cron: OK"
        echo "Últimas execuções:"
        tail -5 "$CRON_LOG" 2>/dev/null | grep "INICIANDO\|CONCLUÍDO\|ERRO" || echo "  - Nenhuma execução encontrada"
    else
        echo "✗ Log do cron: NÃO ENCONTRADO"
    fi
    
    echo ""
}

# Função para testar script de backup
test_backup_script() {
    log "Testando script de backup..."
    
    if [ ! -f "$BACKUP_SCRIPT" ]; then
        log "ERRO: Script de backup não encontrado"
        return 1
    fi
    
    log "Executando teste do script de backup..."
    echo ""
    
    # Executar script com timeout de 5 minutos
    timeout 300 "$BACKUP_SCRIPT" 2>&1 | tee backup-test.log
    
    if [ $? -eq 0 ]; then
        log "✓ Teste do script de backup concluído com sucesso"
        log "Log do teste salvo em: backup-test.log"
    else
        log "ERRO: Teste do script de backup falhou"
        log "Verifique o log: backup-test.log"
        return 1
    fi
}

# Função para mostrar informações do sistema
show_system_info() {
    echo ""
    echo "=== INFORMAÇÕES DO SISTEMA ==="
    echo "Usuário atual: $CRON_USER"
    echo "Diretório atual: $(pwd)"
    echo "Script de backup: $BACKUP_SCRIPT"
    echo "Log do cron: $CRON_LOG"
    echo "Data/Hora: $(date)"
    echo ""
}

# Função principal
main() {
    local action=""
    
    # Processar argumentos
    while [[ $# -gt 0 ]]; do
        case $1 in
            --install)
                action="install"
                shift
                ;;
            --uninstall)
                action="uninstall"
                shift
                ;;
            --status)
                action="status"
                shift
                ;;
            --test)
                action="test"
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            -*)
                log "ERRO: Opção desconhecida: $1"
                show_usage
                exit 1
                ;;
            *)
                log "ERRO: Argumento inválido: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Se nenhuma ação foi especificada, mostrar uso
    if [ -z "$action" ]; then
        show_usage
        exit 1
    fi
    
    # Mostrar informações do sistema
    show_system_info
    
    # Executar ação solicitada
    case "$action" in
        install)
            check_backup_script
            install_backup_cron
            check_status
            ;;
        uninstall)
            uninstall_backup_cron
            check_status
            ;;
        status)
            check_status
            ;;
        test)
            check_backup_script
            test_backup_script
            ;;
        *)
            log "ERRO: Ação desconhecida: $action"
            exit 1
            ;;
    esac
}

# Executar função principal
main "$@"
