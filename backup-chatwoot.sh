#!/bin/bash

# Script de Backup do Chatwoot
# Backup das bases PostgreSQL e pastas de dados importantes
# Autor: Sistema de Backup Chatwoot
# Data: $(date +%Y-%m-%d)

set -e  # Para o script se houver erro

# Configurações
BACKUP_DIR="./backup"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="chatwoot_backup_$DATE"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# Configurações do PostgreSQL
PG_HOST="127.0.0.1"
PG_PORT="5490"
PG_USER="postgres"
PG_PASSWORD="invoAI@76825"
PG_DATABASES=("chatwoot_production" "chatwoot_workflows" "evolution")

# Configurações do Redis
REDIS_HOST="127.0.0.1"
REDIS_PORT="6390"
REDIS_PASSWORD="invoAI@76825"

# Pastas para backup
DATA_DIRS=(
    "data/evolution_instances"
    "data/redis"
    "data/storage"
)

# Função para log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Função para verificar se o PostgreSQL está rodando
check_postgres() {
    log "Verificando conexão com PostgreSQL..."
    if ! PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
        log "ERRO: Não foi possível conectar ao PostgreSQL"
        log "Verifique se o serviço está rodando e as credenciais estão corretas"
        exit 1
    fi
    log "PostgreSQL conectado com sucesso"
}

# Função para verificar se o Redis está rodando
check_redis() {
    log "Verificando conexão com Redis..."
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
        log "ERRO: Não foi possível conectar ao Redis"
        log "Verifique se o serviço está rodando e as credenciais estão corretas"
        exit 1
    fi
    log "Redis conectado com sucesso"
}

# Função para criar diretório de backup
create_backup_dir() {
    log "Criando diretório de backup: $BACKUP_PATH"
    mkdir -p "$BACKUP_PATH"
    mkdir -p "$BACKUP_PATH/databases"
    mkdir -p "$BACKUP_PATH/data_dirs"
    mkdir -p "$BACKUP_PATH/redis"
}

# Função para backup das bases PostgreSQL
backup_postgres_databases() {
    log "Iniciando backup das bases PostgreSQL..."
    
    for db in "${PG_DATABASES[@]}"; do
        log "Fazendo backup da base: $db"
        
        # Nome do arquivo de backup
        backup_file="$BACKUP_PATH/databases/${db}_${DATE}.sql"
        
        # Backup da base
        if PGPASSWORD="$PG_PASSWORD" pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
            -d "$db" --verbose --clean --create --if-exists > "$backup_file" 2>/dev/null; then
            log "✓ Backup da base $db concluído: $backup_file"
            
            # Comprimir o arquivo
            gzip "$backup_file"
            log "✓ Arquivo comprimido: ${backup_file}.gz"
        else
            log "ERRO: Falha no backup da base $db"
            return 1
        fi
    done
    
    log "✓ Backup de todas as bases PostgreSQL concluído"
}

# Função para backup das pastas de dados
backup_data_directories() {
    log "Iniciando backup das pastas de dados..."
    
    for dir in "${DATA_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            log "Fazendo backup da pasta: $dir"
            
            # Nome do arquivo de backup
            dir_name=$(basename "$dir")
            backup_file="$BACKUP_PATH/data_dirs/${dir_name}_${DATE}.tar.gz"
            
            # Backup da pasta
            if tar -czf "$backup_file" -C "$(dirname "$dir")" "$(basename "$dir")" 2>/dev/null; then
                log "✓ Backup da pasta $dir concluído: $backup_file"
            else
                log "ERRO: Falha no backup da pasta $dir"
                return 1
            fi
        else
            log "AVISO: Pasta $dir não encontrada, pulando..."
        fi
    done
    
    log "✓ Backup de todas as pastas de dados concluído"
}

# Função para backup do Redis
backup_redis() {
    log "Iniciando backup do Redis..."
    
    # Criar dump do Redis
    redis_backup_file="$BACKUP_PATH/redis/redis_dump_${DATE}.rdb"
    
    # Salvar dados do Redis
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" SAVE > /dev/null 2>&1; then
        # Copiar o arquivo dump.rdb
        if cp data/redis/dump.rdb "$redis_backup_file" 2>/dev/null; then
            log "✓ Backup do Redis concluído: $redis_backup_file"
            
            # Comprimir o arquivo
            gzip "$redis_backup_file"
            log "✓ Arquivo Redis comprimido: ${redis_backup_file}.gz"
        else
            log "ERRO: Falha ao copiar dump do Redis"
            return 1
        fi
    else
        log "ERRO: Falha ao salvar dados do Redis"
        return 1
    fi
}

# Função para criar arquivo de informações do backup
create_backup_info() {
    log "Criando arquivo de informações do backup..."
    
    info_file="$BACKUP_PATH/backup_info.txt"
    
    cat > "$info_file" << EOF
INFORMAÇÕES DO BACKUP CHATWOOT
===============================

Data/Hora do Backup: $(date '+%Y-%m-%d %H:%M:%S')
Nome do Backup: $BACKUP_NAME
Diretório: $BACKUP_PATH

BASES POSTGRESQL:
$(for db in "${PG_DATABASES[@]}"; do echo "- $db"; done)

PASTAS DE DADOS:
$(for dir in "${DATA_DIRS[@]}"; do echo "- $dir"; done)

REDIS:
- Host: $REDIS_HOST
- Porta: $REDIS_PORT

ARQUIVOS GERADOS:
$(find "$BACKUP_PATH" -type f -name "*.gz" -o -name "*.tar.gz" | sort)

TAMANHO TOTAL:
$(du -sh "$BACKUP_PATH" | cut -f1)

INSTRUÇÕES DE RESTAURAÇÃO:
==========================

1. Restaurar bases PostgreSQL:
   gunzip -c databases/chatwoot_production_*.sql.gz | psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d postgres
   gunzip -c databases/chatwoot_workflows_*.sql.gz | psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d postgres
   gunzip -c databases/evolution_*.sql.gz | psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d postgres

2. Restaurar pastas de dados:
   tar -xzf data_dirs/evolution_instances_*.tar.gz -C ./
   tar -xzf data_dirs/redis_*.tar.gz -C ./
   tar -xzf data_dirs/storage_*.tar.gz -C ./

3. Restaurar Redis:
   gunzip -c redis/redis_dump_*.rdb.gz > data/redis/dump.rdb

NOTA: Sempre pare os serviços antes de restaurar e inicie-os após a restauração.
EOF

    log "✓ Arquivo de informações criado: $info_file"
}

# Função para limpeza de backups antigos
cleanup_old_backups() {
    log "Limpando backups antigos (mantendo últimos 7 dias)..."
    
    # Manter apenas backups dos últimos 7 dias
    find "$BACKUP_DIR" -maxdepth 1 -type d -name "chatwoot_backup_*" -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
    
    log "✓ Limpeza de backups antigos concluída"
}

# Função para verificar espaço em disco
check_disk_space() {
    log "Verificando espaço em disco..."
    
    available_space=$(df . | awk 'NR==2 {print $4}')
    available_space_mb=$((available_space / 1024))
    
    log "Espaço disponível: ${available_space_mb}MB"
    
    if [ $available_space_mb -lt 1000 ]; then
        log "AVISO: Pouco espaço em disco disponível (menos de 1GB)"
    fi
}

# Função principal
main() {
    log "=== INICIANDO BACKUP DO CHATWOOT ==="
    
    # Verificações iniciais
    check_disk_space
    check_postgres
    check_redis
    
    # Criar estrutura de backup
    create_backup_dir
    
    # Executar backups
    backup_postgres_databases
    backup_data_directories
    backup_redis
    
    # Criar arquivo de informações
    create_backup_info
    
    # Limpeza de backups antigos
    cleanup_old_backups
    
    # Resumo final
    log "=== BACKUP CONCLUÍDO COM SUCESSO ==="
    log "Diretório do backup: $BACKUP_PATH"
    log "Tamanho total: $(du -sh "$BACKUP_PATH" | cut -f1)"
    log "Arquivos criados:"
    find "$BACKUP_PATH" -type f | sort
    
    log "Backup salvo em: $BACKUP_PATH"
}

# Executar função principal
main "$@"
