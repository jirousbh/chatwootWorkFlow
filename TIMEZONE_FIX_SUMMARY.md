# Correções de Timezone - Sistema de Agendamento

## Problemas Identificados

1. **Backend**: Conversão manual incorreta de timezone usando `- INTERVAL '3 hours'`
2. **Frontend**: Funções de formatação de data inconsistentes
3. **Docker**: Falta de configuração explícita de timezone
4. **PostgreSQL**: Sem configuração de timezone para Brasil

## Correções Implementadas

### 1. Backend (`chatbot-workflow-system.js`)

#### Função `checkAndExecuteScheduledCampaigns()`
- ✅ Removida conversão manual incorreta com `- INTERVAL '3 hours'`
- ✅ Implementada consulta SQL usando `AT TIME ZONE 'America/Sao_Paulo'`
- ✅ Comparação correta de horários no timezone do Brasil

#### Processamento de `scheduled_at`
- ✅ Corrigida lógica de conversão de timezone
- ✅ Adicionado timezone `-03:00` para datas sem timezone
- ✅ Removida conversão incorreta para UTC

### 2. Frontend (`public/app.js`)

#### Funções de Formatação
- ✅ `formatDateBrazil()`: Mantida para exibição em timezone do Brasil
- ✅ `formatDateScheduled()`: Corrigida para usar timezone do Brasil
- ✅ `parseDateFromBackend()`: Simplificada e otimizada

### 3. Docker (`Dockerfile`)

#### Container chatbot-workflows
- ✅ Adicionada configuração de timezone `TZ=America/Sao_Paulo`
- ✅ Instalação do pacote `tzdata`
- ✅ Configuração do `/etc/localtime` e `/etc/timezone`

### 4. Docker Compose (`docker-compose.yaml`)

#### Serviços
- ✅ PostgreSQL: Adicionada variável `TZ=America/Sao_Paulo`
- ✅ chatbot-workflows: Adicionada variável `TZ=America/Sao_Paulo`

## Como Testar

### 1. Reiniciar com as correções
```bash
./restart-with-timezone-fix.sh
```

### 2. Executar teste de agendamento
```bash
docker-compose exec chatbot-workflows node test-scheduling.js
```

### 3. Verificar timezone dos containers
```bash
# PostgreSQL
docker-compose exec postgres psql -U postgres -d chatwoot -c "SHOW timezone;"

# chatbot-workflows
docker-compose exec chatbot-workflows date
```

## Funcionamento Esperado

1. **Criação de campanha**: Data/hora inserida pelo usuário é interpretada como horário do Brasil
2. **Armazenamento**: Data é salva com timezone `-03:00` no banco
3. **Execução**: Scheduler compara horários no timezone do Brasil
4. **Exibição**: Frontend mostra horários no timezone do Brasil

## Exemplo de Funcionamento

- Usuário agenda campanha para "15:30" (horário do Brasil)
- Sistema salva como "2024-01-15 15:30:00-03:00"
- Scheduler executa quando horário atual (Brasil) = 15:30
- Frontend exibe "15:30" (horário do Brasil)

## Logs de Debug

O sistema agora inclui logs detalhados para debug:
- Horário atual em diferentes timezones
- Conversão de datas
- Execução de campanhas agendadas

## Próximos Passos

1. Monitorar logs para verificar funcionamento
2. Testar criação de campanhas agendadas
3. Verificar execução automática no horário correto 