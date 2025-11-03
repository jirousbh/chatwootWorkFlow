#!/bin/bash

# Script para Upload de Backups para Nuvem
# Suporta AWS S3, Google Cloud Storage, Backblaze B2 e DigitalOcean Spaces
# Autor: Sistema de Backup Chatwoot
# Data: $(date +%Y-%m-%d)

set -e

# Configurações
BACKUP_DIR="./backup"
STORAGE_BACKUP_DIR="./backup/storage-weekly"
CLOUD_CONFIG_FILE="./cloud-backup.conf"
LOG_FILE="./cloud-upload.log"

# Função para log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Função para mostrar uso
show_usage() {
    echo "Uso: $0 [opções]"
    echo ""
    echo "Opções:"
    echo "  --upload <backup_name>    Upload de backup específico"
    echo "  --upload-latest           Upload do backup mais recente"
    echo "  --list-backups            Listar backups disponíveis"
    echo "  --setup                   Configurar provedor de nuvem"
    echo "  --test                    Testar conexão com nuvem"
    echo "  --help                    Mostrar esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 --setup                # Configurar provedor"
    echo "  $0 --upload-latest        # Upload do último backup"
    echo "  $0 --upload chatwoot_backup_20250902_104125"
}

# Função para configurar provedor de nuvem
setup_cloud_provider() {
    log "=== CONFIGURAÇÃO DO PROVEDOR DE NUVEM ==="
    
    echo ""
    echo "Escolha o provedor de nuvem:"
    echo "1) AWS S3"
    echo "2) Google Cloud Storage"
    echo "3) Google Drive"
    echo "4) OneDrive"
    echo "5) Backblaze B2"
    echo "6) DigitalOcean Spaces"
    echo "7) Sair"
    echo ""
    read -p "Digite sua escolha (1-7): " choice
    
    case $choice in
        1) setup_aws_s3 ;;
        2) setup_google_cloud ;;
        3) setup_google_drive ;;
        4) setup_onedrive ;;
        5) setup_backblaze_b2 ;;
        6) setup_digitalocean_spaces ;;
        7) log "Configuração cancelada"; exit 0 ;;
        *) log "Opção inválida"; exit 1 ;;
    esac
}

# Função para configurar AWS S3
setup_aws_s3() {
    log "Configurando AWS S3..."
    
    read -p "Digite o nome do bucket S3: " bucket_name
    read -p "Digite a região AWS (ex: us-east-1): " region
    read -p "Digite sua AWS Access Key ID: " access_key
    read -s -p "Digite sua AWS Secret Access Key: " secret_key
    echo ""
    
    # Criar arquivo de configuração
    cat > "$CLOUD_CONFIG_FILE" << EOF
PROVIDER=aws_s3
BUCKET_NAME=$bucket_name
REGION=$region
ACCESS_KEY=$access_key
SECRET_KEY=$secret_key
ENDPOINT_URL=https://s3.$region.amazonaws.com
EOF
    
    log "✓ Configuração AWS S3 salva em: $CLOUD_CONFIG_FILE"
    log "IMPORTANTE: Configure as variáveis de ambiente AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY"
}

# Função para configurar Google Cloud Storage
setup_google_cloud() {
    log "Configurando Google Cloud Storage..."
    
    read -p "Digite o nome do bucket GCS: " bucket_name
    read -p "Digite o projeto GCP: " project_id
    
    echo ""
    echo "Para Google Cloud Storage, você precisa:"
    echo "1. Instalar gcloud CLI: https://cloud.google.com/sdk/docs/install"
    echo "2. Fazer login: gcloud auth login"
    echo "3. Configurar projeto: gcloud config set project $project_id"
    echo ""
    
    # Criar arquivo de configuração
    cat > "$CLOUD_CONFIG_FILE" << EOF
PROVIDER=google_cloud
BUCKET_NAME=$bucket_name
PROJECT_ID=$project_id
EOF
    
    log "✓ Configuração Google Cloud salva em: $CLOUD_CONFIG_FILE"
}

# Função para configurar Google Drive
setup_google_drive() {
    log "Configurando Google Drive..."
    
    echo ""
    echo "Para Google Drive, você precisa:"
    echo "1. Criar um projeto no Google Cloud Console"
    echo "2. Habilitar Google Drive API"
    echo "3. Criar credenciais de conta de serviço"
    echo "4. Baixar o arquivo JSON de credenciais"
    echo ""
    
    read -p "Digite o nome da pasta no Google Drive (ex: Chatwoot_Backups): " folder_name
    read -p "Digite o caminho para o arquivo de credenciais JSON: " credentials_file
    
    if [ ! -f "$credentials_file" ]; then
        log "ERRO: Arquivo de credenciais não encontrado: $credentials_file"
        return 1
    fi
    
    # Criar arquivo de configuração
    cat > "$CLOUD_CONFIG_FILE" << EOF
PROVIDER=google_drive
FOLDER_NAME=$folder_name
CREDENTIALS_FILE=$credentials_file
EOF
    
    log "✓ Configuração Google Drive salva em: $CLOUD_CONFIG_FILE"
    log "IMPORTANTE: Instale o gdown: pip install gdown"
}

# Função para configurar OneDrive
setup_onedrive() {
    log "Configurando OneDrive..."
    
    echo ""
    echo "Para OneDrive, você tem duas opções:"
    echo "1) Login direto com email/senha (mais simples)"
    echo "2) Token de acesso (mais seguro)"
    echo ""
    read -p "Escolha a opção (1 ou 2): " auth_choice
    
    case $auth_choice in
        1)
            read -p "Digite seu email do OneDrive: " email
            read -s -p "Digite sua senha: " password
            echo ""
            read -p "Digite o nome da pasta no OneDrive (ex: Chatwoot_Backups): " folder_name
            
            # Criar arquivo de configuração
            cat > "$CLOUD_CONFIG_FILE" << EOF
PROVIDER=onedrive
FOLDER_NAME=$folder_name
AUTH_METHOD=password
EMAIL=$email
PASSWORD=$password
EOF
            ;;
        2)
            read -p "Digite o nome da pasta no OneDrive (ex: Chatwoot Drive): " folder_name
            echo ""
            echo "Para obter o token de acesso:"
            echo "1. Acesse: https://rclone.org/onedrive/"
            echo "2. Siga as instruções para obter o token"
            echo "3. Cole o token abaixo"
            echo ""
            read -p "Digite o token de acesso: " access_token
            
            # Criar arquivo de configuração
            cat > "$CLOUD_CONFIG_FILE" << EOF
PROVIDER=onedrive
FOLDER_NAME=$folder_name
AUTH_METHOD=token
ACCESS_TOKEN=$access_token
EOF
            ;;
        *)
            log "Opção inválida"
            return 1
            ;;
    esac
    
    log "✓ Configuração OneDrive salva em: $CLOUD_CONFIG_FILE"
    log "IMPORTANTE: O rclone será configurado automaticamente na primeira execução"
}

# Função para configurar Backblaze B2
setup_backblaze_b2() {
    log "Configurando Backblaze B2..."
    
    read -p "Digite o nome do bucket B2: " bucket_name
    read -p "Digite sua Application Key ID: " key_id
    read -s -p "Digite sua Application Key: " application_key
    echo ""
    
    # Criar arquivo de configuração
    cat > "$CLOUD_CONFIG_FILE" << EOF
PROVIDER=backblaze_b2
BUCKET_NAME=$bucket_name
KEY_ID=$key_id
APPLICATION_KEY=$application_key
ENDPOINT_URL=https://s3.us-west-002.backblazeb2.com
EOF
    
    log "✓ Configuração Backblaze B2 salva em: $CLOUD_CONFIG_FILE"
}

# Função para configurar DigitalOcean Spaces
setup_digitalocean_spaces() {
    log "Configurando DigitalOcean Spaces..."
    
    read -p "Digite o nome do Space: " space_name
    read -p "Digite a região (ex: nyc3): " region
    read -p "Digite sua Access Key: " access_key
    read -s -p "Digite sua Secret Key: " secret_key
    echo ""
    
    # Criar arquivo de configuração
    cat > "$CLOUD_CONFIG_FILE" << EOF
PROVIDER=digitalocean_spaces
SPACE_NAME=$space_name
REGION=$region
ACCESS_KEY=$access_key
SECRET_KEY=$secret_key
ENDPOINT_URL=https://$region.digitaloceanspaces.com
EOF
    
    log "✓ Configuração DigitalOcean Spaces salva em: $CLOUD_CONFIG_FILE"
}

# Função para carregar configuração
load_config() {
    if [ ! -f "$CLOUD_CONFIG_FILE" ]; then
        log "ERRO: Arquivo de configuração não encontrado: $CLOUD_CONFIG_FILE"
        log "Execute: $0 --setup"
        exit 1
    fi
    
    source "$CLOUD_CONFIG_FILE"
}

# Função para instalar dependências
install_dependencies() {
    log "Verificando dependências..."
    
    case "$PROVIDER" in
        aws_s3)
            if ! command -v aws >/dev/null 2>&1; then
                log "Instalando AWS CLI..."
                apt update && apt install -y awscli
            fi
            ;;
        google_cloud)
            if ! command -v gsutil >/dev/null 2>&1; then
                log "ERRO: Google Cloud SDK não instalado"
                log "Instale em: https://cloud.google.com/sdk/docs/install"
                exit 1
            fi
            ;;
        google_drive)
            if ! command -v python3 >/dev/null 2>&1; then
                log "Instalando Python 3..."
                apt update && apt install -y python3 python3-pip
            fi
            
            if ! python3 -c "import gdown" >/dev/null 2>&1; then
                log "Instalando gdown..."
                pip3 install gdown
            fi
            
            if ! command -v rclone >/dev/null 2>&1; then
                log "Instalando rclone..."
                curl https://rclone.org/install.sh | bash
            fi
            ;;
        onedrive)
            if ! command -v rclone >/dev/null 2>&1; then
                log "Instalando rclone..."
                curl https://rclone.org/install.sh | bash
            fi
            ;;
        backblaze_b2)
            if ! command -v aws >/dev/null 2>&1; then
                log "Instalando AWS CLI para B2..."
                apt update && apt install -y awscli
            fi
            ;;
        digitalocean_spaces)
            if ! command -v aws >/dev/null 2>&1; then
                log "Instalando AWS CLI para Spaces..."
                apt update && apt install -y awscli
            fi
            ;;
    esac
    
    log "✓ Dependências verificadas"
}

# Função para testar conexão
test_connection() {
    log "Testando conexão com nuvem..."
    load_config
    install_dependencies
    
    case "$PROVIDER" in
        aws_s3)
            if aws s3 ls "s3://$BUCKET_NAME" --region "$REGION" >/dev/null 2>&1; then
                log "✓ Conexão AWS S3 OK"
            else
                log "ERRO: Falha na conexão AWS S3"
                return 1
            fi
            ;;
        google_cloud)
            if gsutil ls "gs://$BUCKET_NAME" >/dev/null 2>&1; then
                log "✓ Conexão Google Cloud Storage OK"
            else
                log "ERRO: Falha na conexão Google Cloud Storage"
                return 1
            fi
            ;;
        google_drive)
            # Configurar rclone para Google Drive
            if [ ! -f ~/.config/rclone/rclone.conf ]; then
                log "Configurando rclone para Google Drive..."
                rclone config
            fi
            
            # Testar conexão
            if rclone lsd "gdrive:$FOLDER_NAME" >/dev/null 2>&1; then
                log "✓ Conexão Google Drive OK"
            else
                log "ERRO: Falha na conexão Google Drive"
                log "Execute: rclone config"
                return 1
            fi
            ;;
        onedrive)
            # Configurar rclone para OneDrive se necessário
            if [ ! -f ~/.config/rclone/rclone.conf ]; then
                log "Configurando rclone para OneDrive..."
                rclone config
            fi
            
            # Testar conexão
            if rclone lsd "onedrive:$FOLDER_NAME" >/dev/null 2>&1; then
                log "✓ Conexão OneDrive OK"
            else
                log "ERRO: Falha na conexão OneDrive"
                log "Execute: rclone config"
                return 1
            fi
            ;;
        backblaze_b2)
            export AWS_ACCESS_KEY_ID="$KEY_ID"
            export AWS_SECRET_ACCESS_KEY="$APPLICATION_KEY"
            if aws s3 ls "s3://$BUCKET_NAME" --endpoint-url "$ENDPOINT_URL" >/dev/null 2>&1; then
                log "✓ Conexão Backblaze B2 OK"
            else
                log "ERRO: Falha na conexão Backblaze B2"
                return 1
            fi
            ;;
        digitalocean_spaces)
            export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
            export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
            if aws s3 ls "s3://$SPACE_NAME" --endpoint-url "$ENDPOINT_URL" >/dev/null 2>&1; then
                log "✓ Conexão DigitalOcean Spaces OK"
            else
                log "ERRO: Falha na conexão DigitalOcean Spaces"
                return 1
            fi
            ;;
    esac
}

# Função para listar backups
list_backups() {
    log "Backups disponíveis:"
    
    local found_any=0
    
    # Listar backups normais do chatwoot
    if [ -d "$BACKUP_DIR" ]; then
        echo ""
        echo "Backups Chatwoot (principais):"
        while IFS= read -r line; do
            backup_name=$(echo "$line" | awk '{print $9}')
            if [ -n "$backup_name" ]; then
                size=$(du -sh "$BACKUP_DIR/$backup_name" 2>/dev/null | cut -f1)
                date=$(echo "$backup_name" | sed 's/chatwoot_backup_//' | sed 's/_/ /')
                echo "  $backup_name ($size) - $date"
                found_any=1
            fi
        done < <(ls -la "$BACKUP_DIR" 2>/dev/null | grep "chatwoot_backup_")
    fi
    
    # Listar backups semanais de storage
    if [ -d "$STORAGE_BACKUP_DIR" ]; then
        echo ""
        echo "Backups Storage (semanais):"
        while IFS= read -r line; do
            backup_name=$(echo "$line" | awk '{print $9}')
            if [ -n "$backup_name" ]; then
                size=$(du -sh "$STORAGE_BACKUP_DIR/$backup_name" 2>/dev/null | cut -f1)
                date=$(echo "$backup_name" | sed 's/storage_weekly_backup_//' | sed 's/_/ /')
                echo "  $backup_name ($size) - $date"
                found_any=1
            fi
        done < <(ls -la "$STORAGE_BACKUP_DIR" 2>/dev/null | grep "storage_weekly_backup_")
    fi
    
    if [ $found_any -eq 0 ]; then
        log "Nenhum backup encontrado"
    fi
    echo ""
}

# Função para upload para AWS S3
upload_to_aws_s3() {
    local backup_path="$1"
    local backup_name="$2"
    
    log "Fazendo upload para AWS S3..."
    
    export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
    
    # Upload do diretório completo
    if aws s3 sync "$backup_path" "s3://$BUCKET_NAME/chatwoot/$backup_name" --region "$REGION" --delete; then
        log "✓ Upload para AWS S3 concluído"
        log "URL: https://$BUCKET_NAME.s3.$REGION.amazonaws.com/chatwoot/$backup_name/"
    else
        log "ERRO: Falha no upload para AWS S3"
        return 1
    fi
}

# Função para upload para Google Cloud Storage
upload_to_google_cloud() {
    local backup_path="$1"
    local backup_name="$2"
    
    log "Fazendo upload para Google Cloud Storage..."
    
    # Upload do diretório completo
    if gsutil -m rsync -r "$backup_path" "gs://$BUCKET_NAME/chatwoot/$backup_name"; then
        log "✓ Upload para Google Cloud Storage concluído"
        log "URL: https://console.cloud.google.com/storage/browser/$BUCKET_NAME/chatwoot/$backup_name"
    else
        log "ERRO: Falha no upload para Google Cloud Storage"
        return 1
    fi
}

# Função para upload para Google Drive
upload_to_google_drive() {
    local backup_path="$1"
    local backup_name="$2"
    
    log "Fazendo upload para Google Drive..."
    
    # Criar pasta no Google Drive se não existir
    rclone mkdir "gdrive:$FOLDER_NAME/$backup_name" 2>/dev/null || true
    
    # Upload do diretório completo
    if rclone copy "$backup_path" "gdrive:$FOLDER_NAME/$backup_name" --progress; then
        log "✓ Upload para Google Drive concluído"
        log "Pasta: $FOLDER_NAME/$backup_name"
        log "Acesse: https://drive.google.com/drive/folders/"
    else
        log "ERRO: Falha no upload para Google Drive"
        return 1
    fi
}

# Função para upload para OneDrive
upload_to_onedrive() {
    local backup_path="$1"
    local backup_name="$2"
    
    log "Fazendo upload para OneDrive..."
    
    # Determinar o tipo de backup e criar a estrutura adequada
    local target_folder=$(get_cloud_target_folder "$backup_name")
    
    if [[ "$backup_name" == storage_weekly_backup_* ]]; then
        log "Fazendo upload para pasta storage-weekly..."
    fi
    
    # Criar pasta no OneDrive se não existir
    if [[ "$backup_name" == storage_weekly_backup_* ]]; then
        rclone mkdir "onedrive:$FOLDER_NAME/storage-weekly" 2>/dev/null || true
    fi
    rclone mkdir "onedrive:$target_folder" 2>/dev/null || true
    
    # Upload do diretório completo
    if rclone copy "$backup_path" "onedrive:$target_folder" --progress --transfers=2 --checkers=2; then
        log "✓ Upload para OneDrive concluído"
        log "Pasta: $target_folder"
        log "Acesse: https://onedrive.live.com/"
    else
        log "ERRO: Falha no upload para OneDrive"
        return 1
    fi
}

# Função para upload para Backblaze B2
upload_to_backblaze_b2() {
    local backup_path="$1"
    local backup_name="$2"
    
    log "Fazendo upload para Backblaze B2..."
    
    export AWS_ACCESS_KEY_ID="$KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$APPLICATION_KEY"
    
    # Upload do diretório completo
    if aws s3 sync "$backup_path" "s3://$BUCKET_NAME/chatwoot/$backup_name" --endpoint-url "$ENDPOINT_URL" --delete; then
        log "✓ Upload para Backblaze B2 concluído"
        log "URL: https://f004.backblazeb2.com/file/$BUCKET_NAME/chatwoot/$backup_name/"
    else
        log "ERRO: Falha no upload para Backblaze B2"
        return 1
    fi
}

# Função para upload para DigitalOcean Spaces
upload_to_digitalocean_spaces() {
    local backup_path="$1"
    local backup_name="$2"
    
    log "Fazendo upload para DigitalOcean Spaces..."
    
    export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
    
    # Upload do diretório completo
    if aws s3 sync "$backup_path" "s3://$SPACE_NAME/chatwoot/$backup_name" --endpoint-url "$ENDPOINT_URL" --delete; then
        log "✓ Upload para DigitalOcean Spaces concluído"
        log "URL: https://$SPACE_NAME.$REGION.digitaloceanspaces.com/chatwoot/$backup_name/"
    else
        log "ERRO: Falha no upload para DigitalOcean Spaces"
        return 1
    fi
}

# Função para upload
upload_backup() {
    local backup_name="$1"
    local backup_path=""
    
    # Verificar se é backup de storage ou backup normal
    if [[ "$backup_name" == storage_weekly_backup_* ]]; then
        backup_path="$STORAGE_BACKUP_DIR/$backup_name"
    else
        backup_path="$BACKUP_DIR/$backup_name"
    fi
    
    if [ ! -d "$backup_path" ]; then
        log "ERRO: Backup não encontrado: $backup_path"
        return 1
    fi
    
    log "=== INICIANDO UPLOAD DO BACKUP ==="
    log "Backup: $backup_name"
    log "Caminho: $backup_path"
    
    # Carregar configuração e testar conexão
    load_config
    install_dependencies
    test_connection
    
    # Fazer upload baseado no provedor
    case "$PROVIDER" in
        aws_s3)
            upload_to_aws_s3 "$backup_path" "$backup_name"
            ;;
        google_cloud)
            upload_to_google_cloud "$backup_path" "$backup_name"
            ;;
        google_drive)
            upload_to_google_drive "$backup_path" "$backup_name"
            ;;
        onedrive)
            upload_to_onedrive "$backup_path" "$backup_name"
            ;;
        backblaze_b2)
            upload_to_backblaze_b2 "$backup_path" "$backup_name"
            ;;
        digitalocean_spaces)
            upload_to_digitalocean_spaces "$backup_path" "$backup_name"
            ;;
        *)
            log "ERRO: Provedor desconhecido: $PROVIDER"
            return 1
            ;;
    esac
    
    log "=== UPLOAD CONCLUÍDO COM SUCESSO ==="
}

# Função auxiliar para determinar pasta de destino no cloud
get_cloud_target_folder() {
    local backup_name="$1"
    
    if [[ "$backup_name" == storage_weekly_backup_* ]]; then
        echo "$FOLDER_NAME/storage-weekly/$backup_name"
    else
        echo "$FOLDER_NAME/$backup_name"
    fi
}

# Função para verificar se backup já foi enviado para o cloud
check_backup_uploaded() {
    local backup_name="$1"
    
    # Carregar configuração
    if ! load_config; then
        return 1
    fi
    
    # Verificar baseado no provedor
    case "$PROVIDER" in
        onedrive)
            local target_folder=$(get_cloud_target_folder "$backup_name")
            if rclone lsd "onedrive:$target_folder" >/dev/null 2>&1; then
                return 0  # Já enviado
            else
                return 1  # Não enviado
            fi
            ;;
        google_drive)
            local target_folder=$(get_cloud_target_folder "$backup_name")
            if rclone lsd "gdrive:$target_folder" >/dev/null 2>&1; then
                return 0  # Já enviado
            else
                return 1  # Não enviado
            fi
            ;;
        *)
            # Para outros provedores, assumir que não foi enviado
            return 1
            ;;
    esac
}

# Função para upload do backup mais recente
upload_latest() {
    local latest_chatwoot=""
    local latest_storage=""
    
    # Pegar o backup mais recente do chatwoot
    if [ -d "$BACKUP_DIR" ]; then
        latest_chatwoot=$(ls -t "$BACKUP_DIR" 2>/dev/null | grep "chatwoot_backup_" | head -1)
    fi
    
    # Pegar o backup mais recente de storage
    if [ -d "$STORAGE_BACKUP_DIR" ]; then
        latest_storage=$(ls -t "$STORAGE_BACKUP_DIR" 2>/dev/null | grep "storage_weekly_backup_" | head -1)
    fi
    
    # Verificar se há backups
    if [ -z "$latest_chatwoot" ] && [ -z "$latest_storage" ]; then
        log "ERRO: Nenhum backup encontrado"
        return 1
    fi
    
    # Verificar quais foram enviados
    local chatwoot_uploaded=1
    local storage_uploaded=1
    
    if [ -n "$latest_chatwoot" ]; then
        if check_backup_uploaded "$latest_chatwoot" 2>/dev/null; then
            chatwoot_uploaded=0
            log "Backup principal $latest_chatwoot já foi enviado"
        else
            log "Backup principal $latest_chatwoot ainda não foi enviado"
        fi
    fi
    
    if [ -n "$latest_storage" ]; then
        if check_backup_uploaded "$latest_storage" 2>/dev/null; then
            storage_uploaded=0
            log "Backup de storage $latest_storage já foi enviado"
        else
            log "Backup de storage $latest_storage ainda não foi enviado"
        fi
    fi
    
    # Decidir o que fazer upload
    if [ $chatwoot_uploaded -eq 1 ] && [ $storage_uploaded -eq 1 ]; then
        # Ambos não foram enviados, enviar o mais recente
        if [ -n "$latest_chatwoot" ] && [ -n "$latest_storage" ]; then
            # Comparar datas
            if [ "$BACKUP_DIR/$latest_chatwoot" -ot "$STORAGE_BACKUP_DIR/$latest_storage" ]; then
                log "Fazendo upload do backup mais recente (storage): $latest_storage"
                upload_backup "$latest_storage"
            else
                log "Fazendo upload do backup mais recente (principal): $latest_chatwoot"
                upload_backup "$latest_chatwoot"
            fi
        elif [ -n "$latest_storage" ]; then
            log "Fazendo upload do backup de storage: $latest_storage"
            upload_backup "$latest_storage"
        elif [ -n "$latest_chatwoot" ]; then
            log "Fazendo upload do backup principal: $latest_chatwoot"
            upload_backup "$latest_chatwoot"
        fi
    elif [ $storage_uploaded -eq 1 ]; then
        # Apenas storage não foi enviado
        log "Fazendo upload do backup de storage: $latest_storage"
        upload_backup "$latest_storage"
    elif [ $chatwoot_uploaded -eq 1 ]; then
        # Apenas principal não foi enviado
        log "Fazendo upload do backup principal: $latest_chatwoot"
        upload_backup "$latest_chatwoot"
    else
        log "Todos os backups já foram enviados"
    fi
}

# Função principal
main() {
    local action=""
    local backup_name=""
    
    # Processar argumentos
    while [[ $# -gt 0 ]]; do
        case $1 in
            --upload)
                backup_name="$2"
                action="upload"
                shift 2
                ;;
            --upload-latest)
                action="upload_latest"
                shift
                ;;
            --list-backups)
                action="list_backups"
                shift
                ;;
            --setup)
                action="setup"
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
    
    # Executar ação solicitada
    case "$action" in
        setup)
            setup_cloud_provider
            ;;
        test)
            test_connection
            ;;
        list_backups)
            list_backups
            ;;
        upload)
            upload_backup "$backup_name"
            ;;
        upload_latest)
            upload_latest
            ;;
        *)
            log "ERRO: Ação desconhecida: $action"
            exit 1
            ;;
    esac
}

# Executar função principal
main "$@"
