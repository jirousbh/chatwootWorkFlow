# Evolution API + Chatwoot - Setup Consolidado

## Mudanças Realizadas

O Evolution API foi integrado ao docker-compose principal do Chatwoot, aproveitando os serviços existentes de PostgreSQL e Redis para evitar duplicação de recursos e conflitos de portas.

## Alterações nos Arquivos

### 1. `docker-compose.yaml`
- ✅ Adicionado serviço `evolution_api`
- ✅ Aproveitamento do PostgreSQL existente (porta 5490)
- ✅ Aproveitamento do Redis existente (porta 6390)
- ✅ Evitados conflitos de portas
- ✅ Volume para instâncias do Evolution API

### 2. `.env-evolution` (novo arquivo)
- ✅ Configurações ajustadas para usar PostgreSQL existente
- ✅ Configurações ajustadas para usar Redis existente
- ✅ URI do banco: `postgresql://postgres:invoAI@76825@postgres:5432/evolution`
- ✅ URI do Redis: `redis://:invoAI@76825@redis:6379/6`

### 3. `setup-evolution-db.sql` (novo arquivo)
- ✅ Script para criar o banco de dados `evolution`

## Como Executar o Setup

### 1. Criar o banco de dados Evolution
Execute o script SQL para criar o banco:

```bash
# Conectar ao PostgreSQL e criar o banco evolution
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE evolution;"
```

### 2. Subir os serviços
```bash
# Parar os serviços atuais (se estiverem rodando)
docker-compose down

# Subir todos os serviços incluindo o Evolution API
docker-compose up -d
```

### 3. Verificar se os serviços estão rodando
```bash
# Verificar status dos containers
docker-compose ps

# Verificar logs do Evolution API
docker-compose logs evolution_api
```

## Portas dos Serviços

| Serviço | Porta Externa | Porta Interna | Acesso |
|---------|---------------|---------------|---------|
| Chatwoot Rails | 4500 | 4500 | http://localhost:4500 |
| Evolution API | 8080 | 8080 | http://localhost:8080 |
| Chatbot Workflows | 3001 | 3001 | http://localhost:3001 |
| PostgreSQL | 5490 | 5432 | localhost:5490 |
| Redis | 6390 | 6379 | localhost:6390 |

## Benefícios da Consolidação

1. **Economia de Recursos**: Um único PostgreSQL e Redis para ambos os serviços
2. **Gerenciamento Simplificado**: Todos os serviços em um único docker-compose
3. **Sem Conflitos de Portas**: Portas organizadas e sem sobreposição
4. **Backup Unificado**: Dados centralizados no mesmo PostgreSQL
5. **Rede Compartilhada**: Comunicação eficiente entre serviços

## Estrutura de Dados

```
./data/
├── postgres/           # Dados do PostgreSQL (chatwoot + evolution)
├── redis/             # Dados do Redis (compartilhado)
├── storage/           # Storage do Chatwoot
├── evolution_instances/ # Instâncias do Evolution API
├── workflows-logs/    # Logs dos workflows
└── workflows-uploads/ # Uploads dos workflows
```

## Configurações Importantes

### Evolution API
- API Key: `B6D711FCDE4D4FD5936544120E713976`
- Banco: `evolution` (mesmo PostgreSQL do Chatwoot)
- Redis: Database 6 (isolado do Chatwoot)

### Chatwoot
- Banco: `chatwoot`
- Redis: Database padrão

## Troubleshooting

### Se o Evolution API não conectar no banco:
```bash
# Verificar se o banco evolution existe
docker-compose exec postgres psql -U postgres -c "\l"

# Criar o banco se não existir
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE evolution;"
```

### Se houver erro de conexão Redis:
```bash
# Verificar logs do Redis
docker-compose logs redis

# Reiniciar o Evolution API
docker-compose restart evolution_api
``` 