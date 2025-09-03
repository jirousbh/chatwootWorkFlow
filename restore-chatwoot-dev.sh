#!/bin/bash

# Script de Restauração do Chatwoot - AMBIENTE DE DESENVOLVIMENTO
# Restaura backups das bases PostgreSQL e pastas de dados para o ambiente de dev
# Autor: Sistema de Restauração Chatwoot Dev
# Data: $(date +%Y-%m-%d)

set -e  # Para o script se houver erro

# Configurações para AMBIENTE DE DESENVOLVIMENTO
BACKUP_DIR="./backup"
PG_HOST="127.0.0.1"
PG_PORT="5495"  # Porta do PostgreSQL de desenvolvimento
PG_USER="postgres"
PG_PASSWORD="invoAI@76925"  # Senha do ambiente de desenvolvimento

# Função para log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEV] $1"
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
    echo ""
    echo "⚠️  ATENÇÃO: Este script é para o AMBIENTE DE DESENVOLVIMENTO!"
    echo "   Porta PostgreSQL: $PG_PORT"
    echo "   Diretórios de dados: postgres-dev, redis-dev, etc."
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

# Função para verificar se o PostgreSQL de desenvolvimento está rodando
check_postgres() {
    log "Verificando conexão com PostgreSQL de DESENVOLVIMENTO (porta $PG_PORT)..."
    if ! PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
        log "ERRO: Não foi possível conectar ao PostgreSQL de desenvolvimento"
        log "Verifique se o ambiente de desenvolvimento está rodando:"
        log "  ./manage-dev-env.sh start"
        log "  ou"
        log "  docker compose -f docker-compose-dev.yaml up -d"
        exit 1
    fi
    log "PostgreSQL de desenvolvimento conectado com sucesso"
}

# Função para confirmar restauração
confirm_restore() {
    if [ "$FORCE" = "true" ]; then
        return 0
    fi
    
    echo ""
    echo "⚠️  ATENÇÃO: Esta operação irá SOBRESCREVER dados do AMBIENTE DE DESENVOLVIMENTO!"
    echo "Diretório de backup: $BACKUP_PATH"
    echo "Porta PostgreSQL: $PG_PORT (DESENVOLVIMENTO)"
    echo ""
    echo "Você tem certeza que deseja continuar? (s/N): "
    read -r response
    
    if [[ ! "$response" =~ ^[Ss]$ ]]; then
        log "Restauração cancelada pelo usuário"
        exit 0
    fi
}

# Função para parar serviços de desenvolvimento
stop_services() {
    log "Parando serviços do Chatwoot de DESENVOLVIMENTO..."
    
    # Parar containers Docker de desenvolvimento
    if command -v docker-compose >/dev/null 2>&1; then
        log "Parando containers Docker de desenvolvimento..."
        docker compose -f docker-compose-dev.yaml down || true
    fi
    
    log "✓ Serviços de desenvolvimento parados"
}

# Função para iniciar serviços de desenvolvimento
start_services() {
    log "Iniciando serviços do Chatwoot de DESENVOLVIMENTO..."
    
    # Iniciar containers Docker de desenvolvimento
    if command -v docker-compose >/dev/null 2>&1; then
        log "Iniciando containers Docker de desenvolvimento..."
        docker compose -f docker-compose-dev.yaml up -d || true
    fi
    
    log "✓ Serviços de desenvolvimento iniciados"
}

# Função para restaurar bases PostgreSQL
restore_postgres_databases() {
    log "Restaurando bases PostgreSQL para AMBIENTE DE DESENVOLVIMENTO..."
    
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
        log "Restaurando base chatwoot_production para desenvolvimento..."
        if PGPASSWORD="$PG_PASSWORD" gunzip -c "$chatwoot_production_backup" | \
           PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres; then
            log "✓ Base chatwoot_production restaurada com sucesso no ambiente de desenvolvimento"
        else
            log "ERRO: Falha ao restaurar base chatwoot_production"
            return 1
        fi
    else
        log "AVISO: Backup da base chatwoot_production não encontrado"
    fi
    
    if [ -n "$chatwoot_workflows_backup" ]; then
        log "Restaurando base chatwoot_workflows para desenvolvimento..."
        if PGPASSWORD="$PG_PASSWORD" gunzip -c "$chatwoot_workflows_backup" | \
           PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres; then
            log "✓ Base chatwoot_workflows restaurada com sucesso no ambiente de desenvolvimento"
        else
            log "ERRO: Falha ao restaurar base chatwoot_workflows"
            return 1
        fi
    else
        log "AVISO: Backup da base chatwoot_workflows não encontrado"
    fi
    
    if [ -n "$evolution_backup" ]; then
        log "Restaurando base evolution para desenvolvimento..."
        if PGPASSWORD="$PG_PASSWORD" gunzip -c "$evolution_backup" | \
           PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres; then
            log "✓ Base evolution restaurada com sucesso no ambiente de desenvolvimento"
        else
            log "ERRO: Falha ao restaurar base evolution"
            return 1
        fi
    else
        log "AVISO: Backup da base evolution não encontrado"
    fi
    
    log "✓ Restauração das bases PostgreSQL para desenvolvimento concluída"
}

# Função para restaurar pastas de dados de desenvolvimento
restore_data_directories() {
    log "Restaurando pastas de dados para AMBIENTE DE DESENVOLVIMENTO..."
    
    local data_dirs_backup="$BACKUP_PATH/data_dirs"
    
    if [ ! -d "$data_dirs_backup" ]; then
        log "AVISO: Diretório de pastas de dados não encontrado, pulando..."
        return 0
    fi
    
    # Encontrar e restaurar cada pasta para o ambiente de desenvolvimento
    local evolution_backup=$(find "$data_dirs_backup" -name "evolution_instances_*.tar.gz" | head -1)
    local redis_backup=$(find "$data_dirs_backup" -name "redis_*.tar.gz" | head -1)
    local storage_backup=$(find "$data_dirs_backup" -name "storage_*.tar.gz" | head -1)
    
    if [ -n "$evolution_backup" ]; then
        log "Restaurando pasta evolution_instances para desenvolvimento..."
        if tar -xzf "$evolution_backup" -C ./; then
            # Mover para o diretório de desenvolvimento se necessário
            if [ -d "data/evolution_instances" ]; then
                mkdir -p data/evolution_instances_dev
                mv data/evolution_instances/* data/evolution_instances_dev/ 2>/dev/null || true
                log "✓ Pasta evolution_instances restaurada para desenvolvimento"
            fi
        else
            log "ERRO: Falha ao restaurar pasta evolution_instances"
            return 1
        fi
    fi
    
    if [ -n "$redis_backup" ]; then
        log "Restaurando pasta redis para desenvolvimento..."
        if tar -xzf "$redis_backup" -C ./; then
            # Mover para o diretório de desenvolvimento se necessário
            if [ -d "data/redis" ]; then
                mkdir -p data/redis-dev
                mv data/redis/* data/redis-dev/ 2>/dev/null || true
                log "✓ Pasta redis restaurada para desenvolvimento"
            fi
        else
            log "ERRO: Falha ao restaurar pasta redis"
            return 1
        fi
    fi
    
    if [ -n "$storage_backup" ]; then
        log "Restaurando pasta storage para desenvolvimento..."
        if tar -xzf "$storage_backup" -C ./; then
            log "✓ Pasta storage restaurada para desenvolvimento"
        else
            log "ERRO: Falha ao restaurar pasta storage"
            return 1
        fi
    fi
    
    log "✓ Restauração das pastas de dados para desenvolvimento concluída"
}

# Função para restaurar Redis de desenvolvimento
restore_redis() {
    log "Restaurando Redis para AMBIENTE DE DESENVOLVIMENTO..."
    
    local redis_backup_dir="$BACKUP_PATH/redis"
    
    if [ ! -d "$redis_backup_dir" ]; then
        log "AVISO: Diretório de backup Redis não encontrado, pulando..."
        return 0
    fi
    
    # Encontrar arquivo de backup Redis
    local redis_backup=$(find "$redis_backup_dir" -name "redis_dump_*.rdb.gz" | head -1)
    
    if [ -n "$redis_backup" ]; then
        log "Restaurando dump do Redis para desenvolvimento..."
        
        # Criar diretório de desenvolvimento se não existir
        mkdir -p data/redis-dev
        
        # Restaurar arquivo
        if gunzip -c "$redis_backup" > data/redis-dev/dump.rdb; then
            log "✓ Redis restaurado com sucesso para desenvolvimento"
        else
            log "ERRO: Falha ao restaurar Redis"
            return 1
        fi
    else
        log "AVISO: Backup do Redis não encontrado"
    fi
    
    log "✓ Restauração do Redis para desenvolvimento concluída"
}

# Função para verificar integridade da restauração de desenvolvimento
verify_restoration() {
    log "Verificando integridade da restauração para AMBIENTE DE DESENVOLVIMENTO..."
    
    # Verificar se as bases existem no ambiente de desenvolvimento
    if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "\l" | grep -q "chatwoot_production"; then
        log "✓ Base chatwoot_production verificada no ambiente de desenvolvimento"
    else
        log "AVISO: Base chatwoot_production não encontrada no ambiente de desenvolvimento"
    fi
    
    if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "\l" | grep -q "chatwoot_workflows"; then
        log "✓ Base chatwoot_workflows verificada no ambiente de desenvolvimento"
    else
        log "AVISO: Base chatwoot_workflows não encontrada no ambiente de desenvolvimento"
    fi
    
    if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "\l" | grep -q "evolution"; then
        log "✓ Base evolution verificada no ambiente de desenvolvimento"
    else
        log "AVISO: Base evolution não encontrada no ambiente de desenvolvimento"
    fi
    
    # Verificar se as pastas de desenvolvimento existem
    for dir in "data/evolution_instances_dev" "data/redis-dev" "data/storage"; do
        if [ -d "$dir" ]; then
            log "✓ Pasta de desenvolvimento $dir verificada"
        else
            log "AVISO: Pasta de desenvolvimento $dir não encontrada"
        fi
    done
    
    log "✓ Verificação de integridade para desenvolvimento concluída"
}

# Função para mostrar informações do ambiente de desenvolvimento
show_dev_info() {
    echo ""
    echo "🔧 INFORMAÇÕES DO AMBIENTE DE DESENVOLVIMENTO:"
    echo "   PostgreSQL: localhost:$PG_PORT"
    echo "   Redis: localhost:6395"
    echo "   Chatwoot: http://localhost:4501"
    echo "   Workflows: http://localhost:3005"
    echo ""
    echo "📁 Diretórios de dados:"
    echo "   - PostgreSQL: ./data/postgres-dev"
    echo "   - Redis: ./data/redis-dev"
    echo "   - Workflows Logs: ./data/workflows-logs-dev"
    echo "   - Workflows Uploads: ./data/workflows-uploads-dev"
    echo "   - Storage: ./data/storage"
    echo ""
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
    
    log "=== INICIANDO RESTAURAÇÃO DO CHATWOOT - AMBIENTE DE DESENVOLVIMENTO ==="
    log "Backup: $backup_name"
    log "Porta PostgreSQL: $PG_PORT (DESENVOLVIMENTO)"
    
    # Mostrar informações do ambiente
    show_dev_info
    
    # Verificar diretório de backup
    BACKUP_PATH=$(check_backup_dir "$backup_name")
    
    # Verificar conexão com PostgreSQL de desenvolvimento
    check_postgres
    
    # Confirmar restauração
    confirm_restore
    
    # Parar serviços de desenvolvimento
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
    
    # Iniciar serviços de desenvolvimento
    start_services
    
    log "=== RESTAURAÇÃO PARA DESENVOLVIMENTO CONCLUÍDA COM SUCESSO ==="
    log "Backup restaurado: $backup_name"
    log "Ambiente de desenvolvimento: localhost:$PG_PORT"
    log ""
    log "Para acessar o ambiente de desenvolvimento:"
    log "  - Chatwoot: http://localhost:4501"
    log "  - Workflows: http://localhost:3005"
    log "  - PostgreSQL: localhost:$PG_PORT"
    log "  - Redis: localhost:6395"
}

# Executar função principal
main "$@"
