# Sistema de Backup do Chatwoot

Este sistema fornece uma solução completa de backup para o Chatwoot, incluindo backup das bases PostgreSQL, pastas de dados e Redis, com automação via cron.

## 📁 Arquivos do Sistema

- **`backup-chatwoot.sh`** - Script principal de backup
- **`restore-chatwoot.sh`** - Script de restauração
- **`setup-backup-cron.sh`** - Configuração de backup automático
- **`upload-backup-cloud.sh`** - Upload de backups para nuvem
- **`cloud-backup.conf.example`** - Exemplo de configuração de nuvem
- **`README-BACKUP.md`** - Esta documentação

## 🚀 Instalação e Configuração

### 1. Tornar os scripts executáveis

```bash
chmod +x backup-chatwoot.sh
chmod +x restore-chatwoot.sh
chmod +x setup-backup-cron.sh
```

### 2. Verificar dependências

Certifique-se de que os seguintes comandos estão disponíveis:
- `psql` (cliente PostgreSQL)
- `redis-cli` (cliente Redis)
- `tar`, `gzip` (compressão)
- `docker-compose` (para parar/iniciar serviços)

### 3. Configurar backup automático

```bash
# Instalar backup automático (diário às 02:00)
./setup-backup-cron.sh --install

# Verificar status
./setup-backup-cron.sh --status

# Testar script de backup
./setup-backup-cron.sh --test
```

### 4. Configurar backup na nuvem

```bash
# Configurar provedor de nuvem
./upload-backup-cloud.sh --setup

# Testar conexão
./upload-backup-cloud.sh --test

# Upload automático após backup (opcional)
# Adicione ao script de backup: ./upload-backup-cloud.sh --upload-latest
```

## 🔧 Uso dos Scripts

### Backup Manual

```bash
# Executar backup completo
./backup-chatwoot.sh

# O backup será salvo em: ./backup/chatwoot_backup_YYYYMMDD_HHMMSS/
```

### Backup na Nuvem

```bash
# Configurar provedor de nuvem (primeira vez)
./upload-backup-cloud.sh --setup

# Testar conexão com nuvem
./upload-backup-cloud.sh --test

# Upload do backup mais recente
./upload-backup-cloud.sh --upload-latest

# Upload de backup específico
./upload-backup-cloud.sh --upload chatwoot_backup_20250902_104125

# Listar backups disponíveis
./upload-backup-cloud.sh --list-backups
```

### Restauração

```bash
# Restaurar backup completo
./restore-chatwoot.sh chatwoot_backup_20250902_104125

# Restaurar apenas bases de dados
./restore-chatwoot.sh chatwoot_backup_20250902_104125 --databases-only

# Restaurar apenas pastas de dados
./restore-chatwoot.sh chatwoot_backup_20250902_104125 --data-only

# Restaurar apenas Redis
./restore-chatwoot.sh chatwoot_backup_20250902_104125 --redis-only

# Forçar restauração sem confirmação
./restore-chatwoot.sh chatwoot_backup_20250902_104125 --force
```

### Gerenciamento do Cron

```bash
# Ver status do backup automático
./setup-backup-cron.sh --status

# Remover backup automático
./setup-backup-cron.sh --uninstall

# Reinstalar backup automático
./setup-backup-cron.sh --install
```

## 📊 O que é feito no Backup

### 1. Bases PostgreSQL
- **chatwoot_production** - Base principal do Chatwoot
- **chatwoot_workflows** - Base dos workflows do sistema
- **evolution** - Base da Evolution API (WhatsApp)
- Arquivos comprimidos com gzip
- Inclui estrutura completa das bases

## ☁️ Backup na Nuvem

### Provedores Suportados

1. **AWS S3** - Alta disponibilidade, ideal para produção
2. **Google Cloud Storage** - Integração com ecossistema Google
3. **Google Drive** - Familiar e fácil de usar
4. **OneDrive** - Mais simples de configurar
5. **Backblaze B2** - Mais econômico, ideal para backups de longo prazo
6. **DigitalOcean Spaces** - Simples e previsível

### Vantagens do Backup na Nuvem

- **Segurança**: Dados protegidos em múltiplas localizações
- **Disponibilidade**: Acesso aos backups de qualquer lugar
- **Escalabilidade**: Sem limitações de espaço local
- **Recuperação**: Restauração rápida em caso de desastre
- **Compliance**: Atende requisitos de backup externo

### 2. Pastas de Dados
- **`data/evolution_instances`** - Instâncias do WhatsApp
- **`data/redis`** - Dados do Redis
- **`data/storage`** - Arquivos de mídia e uploads
- Arquivos comprimidos com tar.gz

### 3. Redis
- Dump completo do Redis
- Arquivo comprimido com gzip

## 📁 Estrutura do Backup

```
./backup/
└── chatwoot_backup_YYYYMMDD_HHMMSS/
    ├── databases/
    │   ├── chatwoot_production_YYYYMMDD_HHMMSS.sql.gz
    │   ├── chatwoot_workflows_YYYYMMDD_HHMMSS.sql.gz
    │   └── evolution_YYYYMMDD_HHMMSS.sql.gz
    ├── data_dirs/
    │   ├── evolution_instances_YYYYMMDD_HHMMSS.tar.gz
    │   ├── redis_YYYYMMDD_HHMMSS.tar.gz
    │   └── storage_YYYYMMDD_HHMMSS.tar.gz
    ├── redis/
    │   └── redis_dump_YYYYMMDD_HHMMSS.rdb.gz
    └── backup_info.txt
```

## ⚠️ Importante: Antes da Restauração

1. **SEMPRE pare os serviços** antes de restaurar
2. **Faça backup** dos dados atuais
3. **Verifique espaço em disco** disponível
4. **Teste a restauração** em ambiente de desenvolvimento primeiro

## 🔍 Monitoramento e Logs

### Logs do Backup
- **`backup-cron.log`** - Log das execuções automáticas
- **`backup_info.txt`** - Informações detalhadas de cada backup

### Verificar Status
```bash
# Ver backups disponíveis
ls -la ./backup/

# Ver último log de backup
tail -f backup-cron.log

# Ver status do cron
./setup-backup-cron.sh --status
```

## 🛠️ Solução de Problemas

### Erro de Conexão PostgreSQL
```bash
# Verificar se o serviço está rodando
docker-compose ps postgres

# Verificar credenciais no docker-compose.yaml
# Verificar porta (5490)
```

### Erro de Conexão Redis
```bash
# Verificar se o serviço está rodando
docker-compose ps redis

# Verificar credenciais no docker-compose.yaml
# Verificar porta (6390)
```

### Backup Falhou
```bash
# Verificar logs
tail -f backup-cron.log

# Verificar espaço em disco
df -h

# Testar script manualmente
./backup-chatwoot.sh
```

### Restauração Falhou
```bash
# Verificar se os serviços estão parados
docker-compose ps

# Verificar permissões dos arquivos
ls -la ./backup/

# Verificar integridade dos arquivos de backup
file ./backup/*/*.gz
```

## 📅 Agendamento Personalizado

Para alterar o horário do backup automático:

```bash
# Editar cron manualmente
crontab -e

# Exemplo: backup às 03:30 todos os dias
30 3 * * * cd /caminho/para/chatwoot && ./backup-chatwoot.sh >> backup-cron.log 2>&1

# Exemplo: backup a cada 6 horas
0 */6 * * * cd /caminho/para/chatwoot && ./backup-chatwoot.sh >> backup-cron.log 2>&1
```

## 🔒 Segurança

- **Senhas** estão hardcoded nos scripts (considere usar variáveis de ambiente)
- **Permissões** dos arquivos de backup devem ser restritas
- **Backups** devem ser copiados para local externo
- **Logs** podem conter informações sensíveis

## 📈 Manutenção

### Limpeza Automática
- Backups antigos são automaticamente removidos após 7 dias
- Logs são mantidos indefinidamente

### Limpeza Manual
```bash
# Remover backups antigos manualmente
find ./backup -maxdepth 1 -type d -name "chatwoot_backup_*" -mtime +30 -exec rm -rf {} \;

# Limpar logs antigos
find . -name "*.log" -mtime +30 -delete
```

## 🆘 Suporte

Em caso de problemas:

1. Verifique os logs: `tail -f backup-cron.log`
2. Teste o script: `./setup-backup-cron.sh --test`
3. Verifique o status: `./setup-backup-cron.sh --status`
4. Consulte esta documentação
5. Verifique as dependências do sistema

## 📝 Changelog

- **v1.0** - Sistema inicial de backup
  - Backup das bases PostgreSQL (chatwoot, evolution)
  - Backup das pastas de dados
  - Backup do Redis
  - Automação via cron
  - Script de restauração
  - Sistema de logs e monitoramento
