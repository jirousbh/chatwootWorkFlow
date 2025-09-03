# Ambiente de Desenvolvimento Chatwoot

Este documento explica como configurar e usar o ambiente de desenvolvimento separado da produção.

## 🚀 Configurações Implementadas

### ✅ **Portas Modificadas para Desenvolvimento:**

| Serviço | Produção | Desenvolvimento | Status |
|---------|----------|-----------------|---------|
| **Rails (Chatwoot)** | 4500 | 4501 | ✅ Modificado |
| **PostgreSQL** | 5490 | 5495 | ✅ Modificado |
| **Redis** | 6390 | 6395 | ✅ Modificado |
| **Workflows** | 3001 | 3005 | ✅ Modificado |
| **Evolution API** | 8080 | 8081 | ✅ Comentado |

### 🔒 **Segurança Implementada:**

1. **Rede Docker Separada**: `chatwoot-dev-network`
2. **Containers com Nomes Únicos**: Todos terminam com `-dev`
3. **Volumes de Dados Separados**: Diretórios `-dev` para evitar conflitos
4. **Portas Bindadas em 127.0.0.1**: Apenas acesso local
5. **Banco de Dados Separado**: `chatwoot_workflows_dev`

## 📁 Estrutura de Diretórios

```
data/
├── postgres-dev/          # Banco de dados de desenvolvimento
├── redis-dev/             # Cache Redis de desenvolvimento
├── workflows-logs-dev/     # Logs dos workflows de desenvolvimento
├── workflows-uploads-dev/  # Uploads dos workflows de desenvolvimento
└── storage/               # Storage compartilhado (se necessário)
```

## 🛠️ Como Usar

### 1. **Iniciar Ambiente de Desenvolvimento:**
```bash
./manage-dev-env.sh start
```

### 2. **Verificar Status:**
```bash
./manage-dev-env.sh status
```

### 3. **Ver Logs:**
```bash
# Todos os serviços
./manage-dev-env.sh logs

# Serviço específico
./manage-dev-env.sh logs rails
./manage-dev-env.sh logs postgres-dev
```

### 4. **Parar Ambiente:**
```bash
./manage-dev-env.sh stop
```

### 5. **Reiniciar:**
```bash
./manage-dev-env.sh restart
```

### 6. **Limpar Completamente (CUIDADO!):**
```bash
./manage-dev-env.sh clean
```

## 🔄 **Restauração de Backups para Desenvolvimento**

### **Script de Restauração:**
```bash
# Restaurar backup completo para ambiente de desenvolvimento
./restore-chatwoot-dev.sh chatwoot_backup_20250902_104125

# Restaurar apenas bases de dados
./restore-chatwoot-dev.sh chatwoot_backup_20250902_104125 --databases-only

# Restaurar apenas pastas de dados
./restore-chatwoot-dev.sh chatwoot_backup_20250902_104125 --data-only

# Restaurar apenas Redis
./restore-chatwoot-dev.sh chatwoot_backup_20250902_104125 --redis-only

# Forçar restauração sem confirmação
./restore-chatwoot-dev.sh chatwoot_backup_20250902_104125 --force
```

### **Características do Script de Restauração de Dev:**
- ✅ **Porta PostgreSQL**: 5495 (ambiente de desenvolvimento)
- ✅ **Senha**: invoAI@76925 (ambiente de desenvolvimento)
- ✅ **Diretórios**: postgres-dev, redis-dev, etc.
- ✅ **Serviços**: Para/inicia apenas o ambiente de desenvolvimento
- ✅ **Verificação**: Conecta ao PostgreSQL de desenvolvimento
- ✅ **Logs**: Identificados com [DEV] para diferenciação

### **Diferenças do Script de Produção:**
| Aspecto | Produção | Desenvolvimento |
|---------|----------|-----------------|
| **Script** | `restore-chatwoot.sh` | `restore-chatwoot-dev.sh` |
| **Porta PostgreSQL** | 5490 | 5495 |
| **Senha** | invoAI@76825 | invoAI@76925 |
| **Diretórios** | postgres, redis | postgres-dev, redis-dev |
| **Serviços** | docker-compose.yaml | docker-compose-dev.yaml |
| **Logs** | [INFO] | [DEV] |

## 🌐 URLs de Acesso

Após iniciar o ambiente:

- **Chatwoot**: http://localhost:4501
- **Workflows**: http://localhost:3005
- **PostgreSQL**: localhost:5495
- **Redis**: localhost:6395

## ⚠️ **IMPORTANTE - Verificações de Segurança**

### **Antes de Iniciar:**
1. ✅ Verificar se as portas estão livres
2. ✅ Confirmar que produção não está rodando nas mesmas portas
3. ✅ Verificar se os arquivos `.envinovai-dev` e `env-workflows-dev` estão configurados

### **Durante o Uso:**
1. ✅ Ambientes rodam em redes Docker separadas
2. ✅ Dados de produção e desenvolvimento são completamente isolados
3. ✅ Containers têm nomes únicos para evitar conflitos

## 🔧 Arquivos de Configuração

### **Docker Compose:**
- **Produção**: `docker-compose.yaml`
- **Desenvolvimento**: `docker-compose-dev.yaml`

### **Variáveis de Ambiente:**
- **Produção**: `.envinovai` e `env-workflows`
- **Desenvolvimento**: `.envinovai-dev` e `env-workflows-dev`

### **Scripts de Restauração:**
- **Produção**: `restore-chatwoot.sh`
- **Desenvolvimento**: `restore-chatwoot-dev.sh`

## 🚨 Solução de Problemas

### **Porta já em uso:**
```bash
# Verificar qual processo está usando a porta
sudo netstat -tulpn | grep :4501

# Parar o processo ou usar porta alternativa
```

### **Conflito de nomes de containers:**
```bash
# Verificar containers rodando
docker ps -a

# Parar ambiente conflitante
docker-compose -f docker-compose.yaml down
```

### **Problemas de rede Docker:**
```bash
# Verificar redes
docker network ls

# Remover rede conflitante
docker network rm chatwoot-dev-network
```

### **Problemas de Restauração:**
```bash
# Verificar se o ambiente de desenvolvimento está rodando
./manage-dev-env.sh status

# Verificar conexão com PostgreSQL de desenvolvimento
PGPASSWORD=invoAI@76925 psql -h 127.0.0.1 -p 5495 -U postgres -d postgres -c "SELECT 1;"
```

## 📋 Checklist de Configuração

- [ ] Arquivo `docker-compose-dev.yaml` configurado
- [ ] Arquivo `.envinovai-dev` configurado
- [ ] Arquivo `env-workflows-dev` configurado
- [ ] Script `manage-dev-env.sh` executável
- [ ] Script `restore-chatwoot-dev.sh` executável
- [ ] Diretórios de dados criados
- [ ] Portas verificadas e livres
- [ ] Ambiente de produção parado (se necessário)

## 🔄 Comandos Docker Compose Diretos

Se preferir usar comandos diretos:

```bash
# Iniciar
docker-compose -f docker-compose-dev.yaml up -d

# Parar
docker-compose -f docker-compose-dev.yaml down

# Logs
docker-compose -f docker-compose-dev.yaml logs -f

# Status
docker-compose -f docker-compose-dev.yaml ps
```

## 📞 Suporte

Em caso de problemas:
1. Verificar logs: `./manage-dev-env.sh logs`
2. Verificar status: `./manage-dev-env.sh status`
3. Verificar se Docker está rodando
4. Verificar se portas estão livres
5. Verificar se arquivos de configuração estão corretos
6. Para restauração: verificar se ambiente de desenvolvimento está rodando
