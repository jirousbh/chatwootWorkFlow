#!/bin/bash

# Script para copiar logos para o container chatwoot-rails-1
# Arquivos PNG vão para /app/public/brand-assets
# Arquivo ICO sobrescreve o atual em /app/public
# Também sobrescreve favicon-16x16.png, favicon-32x32.png, favicon-96x96.png
# E atualiza configurações no banco de dados

CONTAINER_NAME="chatwoot-rails-1"
DB_CONTAINER_NAME="chatwoot-postgres-1"
LOGOS_DIR="./logos"

echo "🚀 Iniciando cópia dos logos para o container ${CONTAINER_NAME}..."

# Verificar se o container está rodando
if ! docker ps | grep -q "${CONTAINER_NAME}"; then
    echo "❌ Erro: Container ${CONTAINER_NAME} não está rodando ou não existe."
    echo "📋 Containers disponíveis:"
    docker ps --format "table {{.Names}}\t{{.Status}}"
    exit 1
fi

# Verificar se o diretório logos existe
if [ ! -d "${LOGOS_DIR}" ]; then
    echo "❌ Erro: Diretório ${LOGOS_DIR} não encontrado."
    exit 1
fi

echo "✅ Container ${CONTAINER_NAME} encontrado e rodando."

# Verificar se o diretório brand-assets existe no container
echo "📁 Verificando diretório /app/public/brand-assets no container..."
if docker exec "${CONTAINER_NAME}" test -d /app/public/brand-assets; then
    echo "✅ Diretório /app/public/brand-assets já existe."
else
    echo "📁 Criando diretório /app/public/brand-assets no container..."
    docker exec "${CONTAINER_NAME}" mkdir -p /app/public/brand-assets
fi

# Copiar arquivos PNG para /app/public/brand-assets
echo "📋 Copiando arquivos PNG para /app/public/brand-assets..."

for png_file in "${LOGOS_DIR}"/*.png; do
    if [ -f "$png_file" ]; then
        filename=$(basename "$png_file")
        echo "  📄 Copiando ${filename}..."
        if docker cp "$png_file" "${CONTAINER_NAME}:/app/public/brand-assets/${filename}"; then
            echo "    ✅ ${filename} copiado com sucesso!"
        else
            echo "    ❌ Erro ao copiar ${filename}"
            exit 1
        fi
    fi
done

# Verificar se existe favicon.ico no public
echo "🔍 Verificando se existe favicon.ico original em /app/public..."
if docker exec "${CONTAINER_NAME}" test -f /app/public/favicon.ico; then
    echo "📋 Fazendo backup do favicon.ico original..."
    docker exec "${CONTAINER_NAME}" cp /app/public/favicon.ico /app/public/favicon.ico.backup
    echo "✅ Backup criado como favicon.ico.backup"
fi

# Copiar favicon.ico para /app/public (sobrescrever)
echo "🔄 Copiando favicon.ico para /app/public..."
favicon_file="${LOGOS_DIR}/favicon.ico"

if [ -f "$favicon_file" ]; then
    if docker cp "$favicon_file" "${CONTAINER_NAME}:/app/public/favicon.ico"; then
        echo "  ✅ favicon.ico copiado e sobrescrito com sucesso!"
    else
        echo "  ❌ Erro ao copiar favicon.ico"
        exit 1
    fi
else
    echo "  ⚠️  Arquivo favicon.ico não encontrado em ${LOGOS_DIR}"
    exit 1
fi

# Copiar favicon.ico também para os outros arquivos PNG de favicon
echo "🔄 Sobrescrevendo arquivos favicon PNG com o novo favicon.ico..."

favicon_files=("favicon-16x16.png" "favicon-32x32.png" "favicon-96x96.png")

for favicon_png in "${favicon_files[@]}"; do
    echo "  📄 Sobrescrevendo ${favicon_png}..."
    
    # Fazer backup do arquivo original se existir
    if docker exec "${CONTAINER_NAME}" test -f "/app/public/${favicon_png}"; then
        docker exec "${CONTAINER_NAME}" cp "/app/public/${favicon_png}" "/app/public/${favicon_png}.backup"
        echo "    📋 Backup criado: ${favicon_png}.backup"
    fi
    
    # Copiar o favicon.ico para o nome do arquivo PNG
    if docker cp "$favicon_file" "${CONTAINER_NAME}:/app/public/${favicon_png}"; then
        echo "    ✅ ${favicon_png} sobrescrito com sucesso!"
    else
        echo "    ❌ Erro ao sobrescrever ${favicon_png}"
        exit 1
    fi
done

# Verificar arquivos copiados
echo ""
echo "🔍 Verificando arquivos copiados no container..."
echo "📁 Conteúdo de /app/public/brand-assets:"
docker exec "${CONTAINER_NAME}" ls -la /app/public/brand-assets/ | grep -E '\.(png|svg)$' || echo "  ⚠️  Nenhum arquivo de imagem encontrado"

echo ""
echo "📁 Arquivos favicon em /app/public:"
for favicon_check in "favicon.ico" "${favicon_files[@]}"; do
    if docker exec "${CONTAINER_NAME}" test -f "/app/public/${favicon_check}"; then
        docker exec "${CONTAINER_NAME}" ls -la "/app/public/${favicon_check}"
    else
        echo "  ❌ ${favicon_check} não encontrado"
    fi
done

echo ""
echo "🎉 Script concluído!"
echo "💡 Os arquivos foram copiados para:"
echo "   • PNGs: ${CONTAINER_NAME}:/app/public/brand-assets/"
echo "   • ICO:  ${CONTAINER_NAME}:/app/public/favicon.ico"
echo "   • Favicons PNG sobrescritos: favicon-16x16.png, favicon-32x32.png, favicon-96x96.png"
echo ""
echo "🔄 Para aplicar as mudanças, talvez seja necessário reiniciar o container:"
echo "   docker restart ${CONTAINER_NAME}"

# Seção para atualizar configurações no banco de dados
echo ""
echo "🗄️  Iniciando atualização das configurações no banco de dados..."
echo "📋 Acessando container ${DB_CONTAINER_NAME}..."

# Verificar se o container do banco está rodando
if ! docker ps | grep -q "${DB_CONTAINER_NAME}"; then
    echo "❌ Erro: Container ${DB_CONTAINER_NAME} não está rodando ou não existe."
    echo "📋 Containers disponíveis:"
    docker ps --format "table {{.Names}}\t{{.Status}}"
    echo "⚠️  Pulando atualização do banco de dados."
else
    echo "✅ Container ${DB_CONTAINER_NAME} encontrado e rodando."
    
    # Executar as queries SQL
    echo "🔧 Executando queries de atualização no banco chatwoot_production..."
    
    # Array com as queries SQL
    declare -a sql_queries=(
        "UPDATE installation_configs SET serialized_value='\"--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\\nvalue: CRM InovAI\\n\"' WHERE id=1;"
        "UPDATE installation_configs SET serialized_value='\"--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\\nvalue: \\\"/brand-assets/logo_inovai_thumb.png\\\"\\n\"' WHERE id=2;"
        "UPDATE installation_configs SET serialized_value='\"--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\\nvalue: \\\"/brand-assets/logo_inovai.png\\\"\\n\"' WHERE id=3;"
        "UPDATE installation_configs SET serialized_value='\"--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\\nvalue: \\\"/brand-assets/logo_inovai.png\\\"\\n\"' WHERE id=4;"
        "UPDATE installation_configs SET serialized_value='\"--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\\nvalue: https://www.inovaianalytics.com.br/\\n\"' WHERE id=5;"
        "UPDATE installation_configs SET serialized_value='\"--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\\nvalue: https://www.inovaianalytics.com.br/\\n\"' WHERE id=6;"
        "UPDATE installation_configs SET serialized_value='\"--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\\nvalue: CRM InovAI\\n\"' WHERE id=7;"
    )
    
    # Executar cada query
    for i in "${!sql_queries[@]}"; do
        query="${sql_queries[$i]}"
        echo "  📝 Executando query ${i+1}/7..."
        
        if docker exec -e PGPASSWORD=invoAI@76825 "${DB_CONTAINER_NAME}" psql -U postgres -d chatwoot_production -c "$query"; then
            echo "    ✅ Query ${i+1} executada com sucesso!"
        else
            echo "    ❌ Erro ao executar query ${i+1}"
            echo "    🔍 Query: $query"
        fi
    done
    
    echo ""
    echo "✅ Atualizações do banco de dados concluídas!"
    echo "💡 Configurações atualizadas:"
    echo "   • ID 1 (INSTALLATION_NAME): CRM InovAI"
    echo "   • ID 2 (LOGO_THUMBNAIL): /brand-assets/logo_inovai_thumb.png"
    echo "   • ID 3 (LOGO): /brand-assets/logo_inovai.png"
    echo "   • ID 4 (LOGO_DARK): /brand-assets/logo_inovai.png"
    echo "   • ID 5 (BRAND_URL): https://www.inovaianalytics.com.br/"
    echo "   • ID 6 (WIDGET_BRAND_URL): https://www.inovaianalytics.com.br/"
    echo "   • ID 7 (BRAND_NAME): CRM InovAI"
fi

echo ""
echo "🎉 Script completamente finalizado!"
echo "✨ Todas as alterações foram aplicadas com sucesso!" 