# Reinicialização Automática de Bots após 24 Horas de Inatividade

## Funcionalidade Implementada

Foi adicionada uma nova funcionalidade ao sistema de chatbot que reinicializa automaticamente os bots após 24 horas de **inatividade** (sem interação do usuário), sem exibir mensagens para o usuário.

## Mudanças Realizadas

### 1. Estrutura do Banco de Dados

- **Nova coluna**: `last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` na tabela `bot_conversation_status`
- Esta coluna registra quando houve a última interação do usuário na conversa

### 2. Função Modificada

#### `checkAndReactivateBotsAfter24Hours()`

A função agora possui duas verificações:

1. **Reativação de bots pausados** (funcionalidade existente):
   - Verifica bots pausados há mais de 24 horas
   - Reativa automaticamente se não houver agente humano ativo

2. **Reinicialização de bots inativos** (nova funcionalidade):
   - Verifica bots ativos há mais de 24 horas **sem interação**
   - Reinicializa silenciosamente (sem mensagem para o usuário)
   - Atualiza `last_interaction_at` para o momento atual

### 3. Funções Atualizadas

- `getBotConversationStatus()`: Inclui `last_interaction_at` ao criar novos registros
- `pauseBotForConversation()`: Inclui `last_interaction_at` nos INSERTs
- `reactivateBotForConversation()`: Atualiza `last_interaction_at` ao reativar
- `processUserMessage()`: **Atualiza `last_interaction_at` a cada mensagem do usuário**

## Como Funciona

### Verificação Automática
- Executada a cada 30 minutos pelo scheduler
- Verifica duas condições:
  1. Bots pausados há mais de 24 horas → reativação
  2. Bots ativos há mais de 24 horas **sem interação** → reinicialização silenciosa

### Atualização de Interação
- **A cada mensagem do usuário**: `last_interaction_at` é atualizado automaticamente
- **Comandos especiais**: Também atualizam o timestamp (reset, pause, etc.)
- **Reativação**: Reseta o timestamp quando o bot é reativado

### Reinicialização Silenciosa
- Não envia mensagens para o usuário
- Apenas registra no console do sistema
- Atualiza `last_interaction_at` para o momento atual
- Mantém o bot ativo e funcionando normalmente

## Logs do Sistema

### Reinicialização de Bot Inativo
```
🕐 Verificando bots ativos há mais de 24 horas de inatividade para reinicialização automática...
🔄 Encontrados X bots inativos há mais de 24 horas para reinicialização automática
🔄 Reinicializando bot para conversa 12345 após 24h de inatividade (última interação em: 2024-01-01 10:00:00)
✅ Bot reinicializado silenciosamente para conversa 12345 após 24h de inatividade
```

## Script de Migração

Se a tabela `bot_conversation_status` já existir, execute o script:
```sql
-- Executar: workflows/add_bot_started_at_column.sql
```

## Benefícios

1. **Detecção real de inatividade**: Baseada na última interação do usuário, não no início do bot
2. **Prevenção de problemas**: Evita que bots fiquem "presos" em estados inconsistentes
3. **Performance**: Reinicialização limpa do estado do bot
4. **Transparência**: Logs detalhados no console para monitoramento
5. **Não intrusivo**: Não afeta a experiência do usuário

## Configuração

A verificação é executada automaticamente pelo scheduler existente:
- Frequência: A cada 30 minutos
- Primeira execução: 1 minuto após inicialização do sistema
- Não requer configuração adicional

## Monitoramento

Para monitorar a funcionalidade, observe os logs do sistema:
- Busque por mensagens contendo "reinicialização automática"
- Verifique logs de "Bot reinicializado silenciosamente"
- Monitore a coluna `last_interaction_at` no banco de dados

## Diferenças da Versão Anterior

| Aspecto | Versão Anterior | Nova Versão |
|---------|----------------|-------------|
| **Critério** | 24h desde início do bot | 24h desde última interação |
| **Campo** | `bot_started_at` | `last_interaction_at` |
| **Lógica** | Baseada em tempo de execução | Baseada em atividade do usuário |
| **Precisão** | Menos precisa | Mais precisa para detectar inatividade real |
