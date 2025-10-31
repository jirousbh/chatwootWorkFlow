#!/bin/bash

# Script de Backup Semanal da Pasta Storage do Chatwoot
# Backup semanal da pasta storage com arquivos de mídia e uploads
# Autor: Sistema de Backup Chatwoot
# Data: $(date +%Y-%m-%d)
# NOTA: Não usamos set -e para permitir que upload falhe sem abortar o backup

# Configurações
BACKUP_DIR="./backup/storage-weekly"
CLOUD_CONFIG_FILE="./cloud-backup.conf"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="storage_weekly_backup_$DATE"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# Pasta de storage para backup
STORAGE_DIR="data/storage"

# Função para log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Função para criar diretório de backup
create_backup_dir() {
    log "Criando diretório de backup: $BACKUP_PATH"
    mkdir -p "$BACKUP_PATH"
}

# Função para verificar espaço em disco
check_disk_space() {
    log "Verificando espaço em disco..."
    
    available_space=$(df . | awk 'NR==2 {print $4}')
    available_space_mb=$((available_space / 1024))
    
    log "Espaço disponível: ${available_space_mb}MB"
    
    if [ $available_space_mb -lt 5000 ]; then
        log "AVISO: Pouco espaço em disco disponível (menos de 5GB)"
    fi
}

# Função para backup da pasta storage
backup_storage() {
    log "Iniciando backup da pasta storage..."
    
    if [ ! -d "$STORAGE_DIR" ]; then
        log "ERRO: Pasta $STORAGE_DIR não encontrada"
        exit 1
    fi
    
    log "Fazendo backup da pasta: $STORAGE_DIR"
    
    # Nome do arquivo de backup
    backup_file="$BACKUP_PATH/storage_${DATE}.tar.gz"
    
    # Verificar tamanho antes de fazer backup
    storage_size=$(du -sh "$STORAGE_DIR" | cut -f1)
    log "Tamanho da pasta storage: $storage_size"
    
    # Backup da pasta com progresso
    if tar -czf "$backup_file" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" 2>/dev/null; then
        log "✓ Backup da pasta storage concluído: $backup_file"
        
        # Verificar integridade do arquivo
        if tar -tzf "$backup_file" > /dev/null 2>&1; then
            log "✓ Integridade do backup verificada"
        else
            log "ERRO: Falha na verificação de integridade do backup"
            rm -f "$backup_file"
            exit 1
        fi
    else
        log "ERRO: Falha no backup da pasta storage"
        exit 1
    fi
}

# Função para criar arquivo de informações do backup
create_backup_info() {
    log "Criando arquivo de informações do backup..."
    
    info_file="$BACKUP_PATH/backup_info.txt"
    
    cat > "$info_file" << EOF
INFORMAÇÕES DO BACKUP STORAGE CHATWOOT
======================================

Data/Hora do Backup: $(date '+%Y-%m-%d %H:%M:%S')
Nome do Backup: $BACKUP_NAME
Diretório: $BACKUP_PATH

PASTA BACKUP:
- $STORAGE_DIR

ARQUIVOS GERADOS:
$(find "$BACKUP_PATH" -type f | sort)

TAMANHO TOTAL:
$(du -sh "$BACKUP_PATH" | cut -f1)

INSTRUÇÕES DE RESTAURAÇÃO:
==========================

1. Restaurar pasta storage:
   # Parar o serviço do Chatwoot
   systemctl stop chatwoot
   
   # Fazer backup da pasta atual (opcional mas recomendado)
   mv data/storage data/storage_old_backup
   
   # Extrair o backup
   tar -xzf storage_*.tar.gz -C data/
   
   # Ajustar permissões
   chown -R chatwoot:chatwoot data/storage
   chmod -R 755 data/storage
   
   # Iniciar o serviço do Chatwoot
   systemctl start chatwoot

NOTA: Sempre pare os serviços antes de restaurar e inicie-os após a restauração.
Verifique o espaço em disco antes de restaurar.
EOF

    log "✓ Arquivo de informações criado: $info_file"
}

# Função para limpeza de backups antigos
cleanup_old_backups() {
    log "Limpando backups antigos (mantendo últimos 4 backups semanais)..."
    
    # Manter apenas os últimos 4 backups (4 semanas)
    ls -t "$BACKUP_DIR" | grep "storage_weekly_backup_" | tail -n +5 | while read old_backup; do
        log "Removendo backup antigo: $old_backup"
        rm -rf "$BACKUP_DIR/$old_backup"
    done
    
    log "✓ Limpeza de backups antigos concluída"
}

# Função para carregar configuração do cloud
load_cloud_config() {
    if [ ! -f "$CLOUD_CONFIG_FILE" ]; then
        log "AVISO: Arquivo de configuração cloud não encontrado, pulando upload"
        return 1
    fi
    
    source "$CLOUD_CONFIG_FILE"
    
    # Verificar se o provedor é onedrive
    if [ "$PROVIDER" != "onedrive" ]; then
        log "AVISO: Provedor cloud não configurado como onedrive, pulando upload"
        return 1
    fi
    
    return 0
}

# Função para verificar/instalar rclone
check_rclone() {
    if ! command -v rclone >/dev/null 2>&1; then
        log "Instalando rclone..."
        curl https://rclone.org/install.sh | bash
    fi
    
    log "✓ rclone disponível"
}

# Função para testar conexão OneDrive
test_onedrive_connection() {
    if rclone lsd "onedrive:$FOLDER_NAME" >/dev/null 2>&1; then
        log "✓ Conexão OneDrive OK"
        return 0
    else
        log "ERRO: Falha na conexão OneDrive"
        log "Execute: rclone config"
        return 1
    fi
}

# Função para upload para OneDrive
upload_to_onedrive() {
    local backup_path="$1"
    local backup_name="$2"
    
    log "Fazendo upload para OneDrive..."
    
    # Criar pasta no OneDrive se não existir
    rclone mkdir "onedrive:$FOLDER_NAME/storage-weekly" 2>/dev/null || true
    rclone mkdir "onedrive:$FOLDER_NAME/storage-weekly/$backup_name" 2>/dev/null || true
    
    # Upload do diretório completo
    if rclone copy "$backup_path" "onedrive:$FOLDER_NAME/storage-weekly/$backup_name" --progress --transfers=2 --checkers=2; then
        log "✓ Upload para OneDrive concluído"
        log "Pasta: $FOLDER_NAME/storage-weekly/$backup_name"
        log "Acesse: https://onedrive.live.com/"
    else
        log "ERRO: Falha no upload para OneDrive"
        return 1
    fi
}

# Função para fazer upload do backup
upload_backup_to_cloud() {
    # Carregar configuração
    if ! load_cloud_config; then
        return 0
    fi
    
    # Verificar/instalar rclone
    check_rclone
    
    # Testar conexão
    if ! test_onedrive_connection; then
        log "AVISO: Pulando upload por falha na conexão"
        return 0
    fi
    
    # Fazer upload
    upload_to_onedrive "$BACKUP_PATH" "$BACKUP_NAME"
}

# Função para calcular estatísticas
show_statistics() {
    log "Calculando estatísticas do backup..."
    
    total_files=$(tar -tzf "$BACKUP_PATH/storage_${DATE}.tar.gz" | wc -l)
    log "Total de arquivos no backup: $total_files"
    
    backup_size=$(du -sh "$BACKUP_PATH" | cut -f1)
    log "Tamanho total do backup: $backup_size"
}

# Função principal
main() {
    log "=== INICIANDO BACKUP SEMANAL DO STORAGE ==="
    
    # Verificações iniciais
    check_disk_space
    
    # Criar estrutura de backup
    create_backup_dir
    
    # Executar backup
    backup_storage
    
    # Criar arquivo de informações
    create_backup_info
    
    # Mostrar estatísticas
    show_statistics
    
    # Limpeza de backups antigos
    cleanup_old_backups
    
    # Upload para OneDrive
    upload_backup_to_cloud
    
    # Resumo final
    log "=== BACKUP SEMANAL DO STORAGE CONCLUÍDO COM SUCESSO ==="
    log "Diretório do backup: $BACKUP_PATH"
    log "Tamanho total: $(du -sh "$BACKUP_PATH" | cut -f1)"
    log "Backup salvo em: $BACKUP_PATH"
}

# Executar função principal
main "$@"

