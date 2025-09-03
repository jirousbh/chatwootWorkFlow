#!/bin/bash

# Script para gerenciar ambiente de desenvolvimento Chatwoot
# Este script garante que o ambiente de dev rode separadamente da produção

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para imprimir mensagens coloridas
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar se o Docker está rodando
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker não está rodando. Inicie o Docker primeiro."
        exit 1
    fi
}

# Verificar se o ambiente de produção está rodando
check_production_running() {
    if docker ps --format "table {{.Names}}" | grep -q "postgres\|redis\|chatwoot"; then
        print_warning "Ambiente de produção detectado. Certifique-se de que não há conflitos de portas."
        echo "Portas de produção:"
        echo "  - PostgreSQL: 5490"
        echo "  - Redis: 6390"
        echo "  - Rails: 4500"
        echo "  - Workflows: 3001"
        echo ""
        echo "Portas de desenvolvimento:"
        echo "  - PostgreSQL: 5495"
        echo "  - Redis: 6395"
        echo "  - Rails: 4501"
        echo "  - Workflows: 3005"
        echo ""
    fi
}

# Criar diretórios de dados separados para desenvolvimento
create_dev_directories() {
    print_status "Criando diretórios de dados para desenvolvimento..."
    
    mkdir -p ./data/postgres-dev
    mkdir -p ./data/redis-dev
    mkdir -p ./data/workflows-logs-dev
    mkdir -p ./data/workflows-uploads-dev
    mkdir -p ./data/storage
    
    print_success "Diretórios criados com sucesso!"
}

# Parar ambiente de desenvolvimento
stop_dev() {
    print_status "Parando ambiente de desenvolvimento..."
    docker-compose -f docker-compose-dev.yaml down
    print_success "Ambiente de desenvolvimento parado!"
}

# Iniciar ambiente de desenvolvimento
start_dev() {
    print_status "Iniciando ambiente de desenvolvimento..."
    
    # Verificar se as portas estão disponíveis
    local ports=("4501" "5495" "6395" "3005")
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":$port "; then
            print_error "Porta $port já está em uso!"
            exit 1
        fi
    done
    
    docker-compose -f docker-compose-dev.yaml up -d
    print_success "Ambiente de desenvolvimento iniciado!"
    
    echo ""
    echo "Serviços disponíveis:"
    echo "  - Chatwoot Rails: http://localhost:4501"
    echo "  - PostgreSQL: localhost:5495"
    echo "  - Redis: localhost:6395"
    echo "  - Workflows: http://localhost:3005"
    echo ""
    echo "Para ver logs: docker-compose -f docker-compose-dev.yaml logs -f"
}

# Mostrar status dos serviços
status_dev() {
    print_status "Status dos serviços de desenvolvimento:"
    docker-compose -f docker-compose-dev.yaml ps
}

# Mostrar logs
logs_dev() {
    local service=${1:-""}
    if [ -z "$service" ]; then
        docker-compose -f docker-compose-dev.yaml logs -f
    else
        docker-compose -f docker-compose-dev.yaml logs -f "$service"
    fi
}

# Limpar ambiente de desenvolvimento (CUIDADO!)
clean_dev() {
    print_warning "ATENÇÃO: Esta operação irá REMOVER TODOS os dados de desenvolvimento!"
    read -p "Tem certeza? Digite 'SIM' para confirmar: " confirm
    
    if [ "$confirm" = "SIM" ]; then
        print_status "Parando e removendo ambiente de desenvolvimento..."
        docker-compose -f docker-compose-dev.yaml down -v
        
        print_status "Removendo volumes de dados..."
        sudo rm -rf ./data/postgres-dev
        sudo rm -rf ./data/redis-dev
        sudo rm -rf ./data/workflows-logs-dev
        sudo rm -rf ./data/workflows-uploads-dev
        
        print_status "Removendo rede Docker..."
        docker network rm chatwoot-dev-network 2>/dev/null || true
        
        print_success "Ambiente de desenvolvimento limpo completamente!"
    else
        print_status "Operação cancelada."
    fi
}

# Mostrar ajuda
show_help() {
    echo "Uso: $0 [COMANDO]"
    echo ""
    echo "Comandos disponíveis:"
    echo "  start     - Iniciar ambiente de desenvolvimento"
    echo "  stop      - Parar ambiente de desenvolvimento"
    echo "  restart   - Reiniciar ambiente de desenvolvimento"
    echo "  status    - Mostrar status dos serviços"
    echo "  logs      - Mostrar logs (opcional: nome do serviço)"
    echo "  clean     - Limpar completamente o ambiente (CUIDADO!)"
    echo "  help      - Mostrar esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 start"
    echo "  $0 logs rails"
    echo "  $0 status"
}

# Função principal
main() {
    check_docker
    check_production_running
    
    case "${1:-help}" in
        start)
            create_dev_directories
            start_dev
            ;;
        stop)
            stop_dev
            ;;
        restart)
            stop_dev
            sleep 2
            start_dev
            ;;
        status)
            status_dev
            ;;
        logs)
            logs_dev "$2"
            ;;
        clean)
            clean_dev
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Comando inválido: $1"
            show_help
            exit 1
            ;;
    esac
}

# Executar função principal
main "$@"
