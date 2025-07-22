# Documentação - Sistema de Pausa Automática e Reativação de Bot

## Funcionalidades Implementadas

### 1. Pausa Automática do Bot em Transferências de Setor

#### Descrição
O sistema agora pausa automaticamente o bot quando o fluxo transfere a conversa para setores específicos (Pedagógico, Financeiro, Comercial ou Atendimento Humano).

#### Como Funciona
- **Propriedade no Workflow**: `"pause_bot": true`
- **Aplicação**: Pode ser usado em blocos ou botões
- **Ação**: Quando executado, pausa o bot automaticamente para aquela conversa

#### Exemplo de Uso no Workflow:
```json
{
  "id": "transferir_pedagogico",
  "name": "Transferir para Pedagógico",
  "message": "Transferindo para nossa equipe pedagógica...",
  "assign_team": 2,
  "assign_labels": ["transferido_pedagogico"],
  "pause_bot": true,
  "next_block": "finalizar"
}
```

#### Blocos Modificados no Workflow Atual:
- `bloco_3`: Transferir para Pedagógico
- `bloco_4`: Transferir para Financeiro  
- `bloco_5`: Transferir para Comercial
- `atendimento_humano`: Encaminhar para Atendimento Humano

### 2. Reativação Automática após 24 Horas

#### Descrição
O sistema verifica automaticamente conversas pausadas e reativa o bot após 24 horas de inatividade no atendimento humano.

#### Como Funciona
- **Verificação**: A cada 30 minutos
- **Condição**: Bot pausado há mais de 24 horas
- **Tipos de Pausa**: `human_handoff`, `sector_transfer`, `human_agent_active`
- **Validação**: Verifica se ainda há agente humano ativo antes de reativar
- **Notificação**: Envia mensagem informando sobre a reativação

#### Funcionamento Técnico

##### Função Principal: `checkAndReactivateBotsAfter24Hours()`
- Executa a cada 30 minutos
- Busca conversas pausadas há mais de 24 horas
- Verifica se há agente humano ativo
- Reativa o bot se não houver atividade humana
- Envia mensagem de notificação

##### Integração no Sistema:
- Inicia automaticamente com o sistema (`initializeSystem()`)
- Funciona independentemente do polling de mensagens
- Usa `setInterval` para execução periódica

### 3. Comandos de Controle Manual

O sistema mantém os comandos existentes para controle manual:

- `!pausebot` - Pausar bot manualmente
- `!activebot` - Reativar bot manualmente  
- `!botstatus` - Verificar status do bot
- `!reset` - Reiniciar fluxo e reativar bot

### 4. Logs e Monitoramento

#### Logs de Pausa Automática:
```
⏸️ Bloco "Transferir para Pedagógico" solicita pausa do bot - pausando automaticamente
```

#### Logs de Reativação Automática:
```
🕐 Verificando bots pausados há mais de 24 horas para reativação automática...
🔄 Encontradas 2 conversas para reativação automática após 24h
🔄 Reativando bot para conversa 12345 após 24h de inatividade
```

#### Logs de Inicialização:
```
🕐 Iniciando verificador de reativação automática de bots (24h)...
✅ Verificador de reativação automática configurado (verificação a cada 30 minutos)
```

## Configuração e Manutenção

### Parâmetros Configuráveis
- **Intervalo de Verificação**: 30 minutos (1800000ms)
- **Tempo de Reativação**: 24 horas
- **Primeira Verificação**: 1 minuto após inicialização

### Banco de Dados
Utiliza a tabela `bot_conversation_status` para controlar:
- Status do bot (ativo/pausado)
- Motivo da pausa
- Timestamp da pausa
- Informações do agente humano

### Tipos de Motivos de Pausa
- `sector_transfer`: Transferência para setor
- `human_handoff`: Transferência para atendimento humano
- `human_agent_active`: Agente humano ativo detectado
- `manual_pause`: Pausa manual pelo usuário
- `button_action`: Pausa acionada por botão

## Instalação e Ativação

As funcionalidades são ativadas automaticamente ao reiniciar o sistema:

```bash
# Reiniciar o sistema de workflows
pm2 restart chatbot-workflow-system

# Verificar logs
pm2 logs chatbot-workflow-system
```

## Considerações Importantes

1. **Verificação de Agente Ativo**: Antes de reativar, sempre verifica se há agente humano ativo
2. **Mensagem de Notificação**: Opcionalmente envia mensagem informando sobre reativação
3. **Failsafe**: Em caso de erro, permite que o bot funcione normalmente
4. **Performance**: Verificação otimizada para não sobrecarregar o sistema

## Troubleshooting

### Bot não pausou automaticamente
- Verificar se `"pause_bot": true` está no bloco/botão
- Verificar logs do sistema para erros
- Confirmar se `conversationId` e `contactId` estão corretos

### Bot não reativou após 24h
- Verificar se ainda há agente humano ativo
- Verificar logs da função de reativação
- Confirmar se a verificação periódica está funcionando

### Comandos manuais não funcionam
- Verificar se os comandos estão sendo enviados como mensagem de texto
- Confirmar formatação exata: `!activebot`, `!pausebot`, etc.
- Verificar logs de processamento de mensagens 