#!/bin/bash

# Script de Restauração do Chatwoot
# Restaura backups das bases PostgreSQL e pastas de dados
# Autor: Sistema de Restauração Chatwoot
# Data: $(date +%Y-%m-%d)

set -e  # Para o script se houver erro

# Configurações
BACKUP_DIR="./backup"
PG_HOST="127.0.0.1"
PG_PORT="5490"
PG_USER="postgres"
PG_PASSWORD="invoAI@76825"

# Função para log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Função para mostrar uso
show_usage() {
    echo "Uso: $0 <diretório_backup> [opções]"
    echo ""
    echo "Argumentos:"
    echo "  diretório_backup    Nome do diretório de backup (ex: chatwoot_backup_20250902_104125)"
    echo ""
    echo "Opções:"
    echo "  --databases-only    Restaurar apenas as bases de dados"
    echo "  --data-only         Restaurar apenas as pastas de dados"
    echo "  --redis-only        Restaurar apenas o Redis"
    echo "  --force             Forçar restauração sem confirmação"
    echo "  --help              Mostrar esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 chatwoot_backup_20250902_104125"
    echo "  $0 chatwoot_backup_20250902_104125 --databases-only"
    echo "  $0 chatwoot_backup_20250902_104125 --force"
}

# Função para verificar se o diretório de backup existe
check_backup_dir() {
    local backup_path="$BACKUP_DIR/$1"
    
    if [ ! -d "$backup_path" ]; then
        log "ERRO: Diretório de backup não encontrado: $backup_path"
        log "Backups disponíveis:"
        ls -la "$BACKUP_DIR" | grep "chatwoot_backup_" || echo "Nenhum backup encontrado"
        exit 1
    fi
    
    echo "$backup_path"
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

# Função para confirmar restauração
confirm_restore() {
    if [ "$FORCE" = "true" ]; then
        return 0
    fi
    
    echo ""
    echo "⚠️  ATENÇÃO: Esta operação irá SOBRESCREVER dados existentes!"
    echo "Diretório de backup: $BACKUP_PATH"
    echo ""
    echo "Você tem certeza que deseja continuar? (s/N): "
    read -r response
    
    if [[ ! "$response" =~ ^[Ss]$ ]]; then
        log "Restauração cancelada pelo usuário"
        exit 0
    fi
}

# Função para parar serviços
stop_services() {
    log "Parando serviços do Chatwoot..."
    
    # Parar containers Docker
    if command -v docker-compose >/dev/null 2>&1; then
        log "Parando containers Docker..."
        docker-compose down || true
    fi
    
    log "✓ Serviços parados"
}

# Função para iniciar serviços
start_services() {
    log "Iniciando serviços do Chatwoot..."
    
    # Iniciar containers Docker
    if command -v docker-compose >/dev/null 2>&1; then
        log "Iniciando containers Docker..."
        docker-compose up -d || true
    fi
    
    log "✓ Serviços iniciados"
}

# Função para restaurar bases PostgreSQL
restore_postgres_databases() {
    log "Restaurando bases PostgreSQL..."
    
    local databases_dir="$BACKUP_PATH/databases"
    
    if [ ! -d "$databases_dir" ]; then
        log "AVISO: Diretório de bases não encontrado, pulando..."
        return 0
    fi
    
    # Encontrar arquivos de backup
    local chatwoot_production_backup=$(find "$databases_dir" -name "chatwoot_production_*.sql.gz" | head -1)
    local chatwoot_workflows_backup=$(find "$databases_dir" -name "chatwoot_workflows_*.sql.gz" | head -1)
    local evolution_backup=$(find "$databases_dir" -name "evolution_*.sql.gz" | head -1)
    
    if [ -n "$chatwoot_production_backup" ]; then
        log "Restaurando base chatwoot_production..."
        if PGPASSWORD="$PG_PASSWORD" gunzip -c "$chatwoot_production_backup" | \
           PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres; then
            log "✓ Base chatwoot_production restaurada com sucesso"
        else
            log "ERRO: Falha ao restaurar base chatwoot_production"
            return 1
        fi
    else
        log "AVISO: Backup da base chatwoot_production não encontrado"
    fi
    
    if [ -n "$chatwoot_workflows_backup" ]; then
        log "Restaurando base chatwoot_workflows..."
        if PGPASSWORD="$PG_PASSWORD" gunzip -c "$chatwoot_workflows_backup" | \
           PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres; then
            log "✓ Base chatwoot_workflows restaurada com sucesso"
        else
            log "ERRO: Falha ao restaurar base chatwoot_workflows"
            return 1
        fi
    else
        log "AVISO: Backup da base chatwoot_workflows não encontrado"
    fi
    
    if [ -n "$evolution_backup" ]; then
        log "Restaurando base evolution..."
        if PGPASSWORD="$PG_PASSWORD" gunzip -c "$evolution_backup" | \
           PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres; then
            log "✓ Base evolution restaurada com sucesso"
        else
            log "ERRO: Falha ao restaurar base evolution"
            return 1
        fi
    else
        log "AVISO: Backup da base evolution não encontrado"
    fi
    
    log "✓ Restauração das bases PostgreSQL concluída"
}

# Função para restaurar pastas de dados
restore_data_directories() {
    log "Restaurando pastas de dados..."
    
    local data_dirs_backup="$BACKUP_PATH/data_dirs"
    
    if [ ! -d "$data_dirs_backup" ]; then
        log "AVISO: Diretório de pastas de dados não encontrado, pulando..."
        return 0
    fi
    
    # Encontrar e restaurar cada pasta
    local evolution_backup=$(find "$data_dirs_backup" -name "evolution_instances_*.tar.gz" | head -1)
    local redis_backup=$(find "$data_dirs_backup" -name "redis_*.tar.gz" | head -1)
    local storage_backup=$(find "$data_dirs_backup" -name "storage_*.tar.gz" | head -1)
    
    if [ -n "$evolution_backup" ]; then
        log "Restaurando pasta evolution_instances..."
        if tar -xzf "$evolution_backup" -C ./; then
            log "✓ Pasta evolution_instances restaurada"
        else
            log "ERRO: Falha ao restaurar pasta evolution_instances"
            return 1
        fi
    fi
    
    if [ -n "$redis_backup" ]; then
        log "Restaurando pasta redis..."
        if tar -xzf "$redis_backup" -C ./; then
            log "✓ Pasta redis restaurada"
        else
            log "ERRO: Falha ao restaurar pasta redis"
            return 1
        fi
    fi
    
    if [ -n "$storage_backup" ]; then
        log "Restaurando pasta storage..."
        if tar -xzf "$storage_backup" -C ./; then
            log "✓ Pasta storage restaurada"
        else
            log "ERRO: Falha ao restaurar pasta storage"
            return 1
        fi
    fi
    
    log "✓ Restauração das pastas de dados concluída"
}

# Função para restaurar Redis
restore_redis() {
    log "Restaurando Redis..."
    
    local redis_backup_dir="$BACKUP_PATH/redis"
    
    if [ ! -d "$redis_backup_dir" ]; then
        log "AVISO: Diretório de backup Redis não encontrado, pulando..."
        return 0
    fi
    
    # Encontrar arquivo de backup Redis
    local redis_backup=$(find "$redis_backup_dir" -name "redis_dump_*.rdb.gz" | head -1)
    
    if [ -n "$redis_backup" ]; then
        log "Restaurando dump do Redis..."
        
        # Criar diretório se não existir
        mkdir -p data/redis
        
        # Restaurar arquivo
        if gunzip -c "$redis_backup" > data/redis/dump.rdb; then
            log "✓ Redis restaurado com sucesso"
        else
            log "ERRO: Falha ao restaurar Redis"
            return 1
        fi
    else
        log "AVISO: Backup do Redis não encontrado"
    fi
    
    log "✓ Restauração do Redis concluída"
}

# Função para verificar integridade da restauração
verify_restoration() {
    log "Verificando integridade da restauração..."
    
    # Verificar se as bases existem
    if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "\l" | grep -q "chatwoot_production"; then
        log "✓ Base chatwoot_production verificada"
    else
        log "AVISO: Base chatwoot_production não encontrada"
    fi
    
    if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "\l" | grep -q "chatwoot_workflows"; then
        log "✓ Base chatwoot_workflows verificada"
    else
        log "AVISO: Base chatwoot_workflows não encontrada"
    fi
    
    if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "\l" | grep -q "evolution"; then
        log "✓ Base evolution verificada"
    else
        log "AVISO: Base evolution não encontrada"
    fi
    
    # Verificar se as pastas existem
    for dir in "data/evolution_instances" "data/redis" "data/storage"; do
        if [ -d "$dir" ]; then
            log "✓ Pasta $dir verificada"
        else
            log "AVISO: Pasta $dir não encontrada"
        fi
    done
    
    log "✓ Verificação de integridade concluída"
}

# Função principal
main() {
    # Variáveis globais
    local backup_name=""
    local BACKUP_PATH=""
    local FORCE="false"
    local RESTORE_DATABASES="true"
    local RESTORE_DATA="true"
    local RESTORE_REDIS="true"
    
    # Processar argumentos
    while [[ $# -gt 0 ]]; do
        case $1 in
            --databases-only)
                RESTORE_DATA="false"
                RESTORE_REDIS="false"
                shift
                ;;
            --data-only)
                RESTORE_DATABASES="false"
                RESTORE_REDIS="false"
                shift
                ;;
            --redis-only)
                RESTORE_DATABASES="false"
                RESTORE_DATA="false"
                shift
                ;;
            --force)
                FORCE="true"
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
                backup_name="$1"
                shift
                ;;
        esac
    done
    
    # Verificar se o nome do backup foi fornecido
    if [ -z "$backup_name" ]; then
        log "ERRO: Nome do diretório de backup é obrigatório"
        show_usage
        exit 1
    fi
    
    log "=== INICIANDO RESTAURAÇÃO DO CHATWOOT ==="
    log "Backup: $backup_name"
    
    # Verificar diretório de backup
    BACKUP_PATH=$(check_backup_dir "$backup_name")
    
    # Verificar conexão com PostgreSQL
    check_postgres
    
    # Confirmar restauração
    confirm_restore
    
    # Parar serviços
    stop_services
    
    # Executar restaurações
    if [ "$RESTORE_DATABASES" = "true" ]; then
        restore_postgres_databases
    fi
    
    if [ "$RESTORE_DATA" = "true" ]; then
        restore_data_directories
    fi
    
    if [ "$RESTORE_REDIS" = "true" ]; then
        restore_redis
    fi
    
    # Verificar integridade
    verify_restoration
    
    # Iniciar serviços
    start_services
    
    log "=== RESTAURAÇÃO CONCLUÍDA COM SUCESSO ==="
    log "Backup restaurado: $backup_name"
    log "Reinicie os serviços se necessário"
}

# Executar função principal
main "$@"
