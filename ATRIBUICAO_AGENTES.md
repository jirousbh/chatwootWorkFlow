# Atribuição Inteligente de Agentes

## Visão Geral

O sistema agora suporta atribuição automática de conversas para agentes específicos dentro de um time, excluindo administradores e usando estratégias organizadas de distribuição.

## Diferença entre as Funções

### `assignConversationToTeam(conversationId, teamId)`
- Atribui a conversa ao **time** (não a um agente específico)
- A conversa fica disponível para qualquer membro do time
- Não exclui administradores

### `assignConversationToTeamMember(conversationId, teamId, options)`
- Atribui a conversa a um **agente específico** do time
- Filtra apenas agentes não-administradores e ativos
- Usa estratégias organizadas de distribuição
- Fallback para atribuição ao time se não houver agentes disponíveis

## Estratégias de Atribuição

### 1. Round Robin (`round_robin`) - Padrão
- Distribui as conversas de forma rotativa entre os agentes
- Mantém controle no banco de dados para garantir distribuição equilibrada
- Ideal para times com carga de trabalho similar

### 2. Menos Ocupado (`least_busy`)
- Atribui ao agente com menos conversas ativas
- Verifica a carga de trabalho real de cada agente
- Ideal para balanceamento dinâmico de carga

### 3. Aleatório (`random`)
- Seleção aleatória entre agentes disponíveis
- Útil para distribuição imprevisível

## Como Usar nos Workflows

### Em Botões

```javascript
{
  text: "Suporte Técnico",
  next_block: "technical_support",
  assign_team: 1, // ID do time
  assign_team_member: true, // Ativar atribuição para agente específico
  assignment_strategy: "round_robin" // Estratégia (opcional)
}
```

### Em Blocos

```javascript
{
  id: "technical_support",
  name: "Suporte Técnico",
  message: "Você será direcionado para um especialista...",
  assign_team: 1,
  assign_team_member: true,
  assignment_strategy: "least_busy",
  pause_bot: true // Pausar bot após atribuição
}
```

## API Endpoints

### Atribuir Conversa a Membro do Time

```bash
POST /apiworkflow/conversations/{conversationId}/assign-team-member
```

**Body:**
```json
{
  "teamId": 1,
  "strategy": "round_robin"
}
```

### Obter Agentes de um Time

```bash
GET /apiworkflow/teams/{teamId}/agents
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "name": "João Silva",
      "email": "joao@empresa.com",
      "role": "agent",
      "status": "online"
    }
  ]
}
```

## Exemplo de Workflow Completo

```javascript
{
  name: "Atendimento com Atribuição Inteligente",
  blocks: [
    {
      id: "welcome",
      name: "Boas-vindas",
      message: "Como posso ajudá-lo hoje?",
      buttons: [
        {
          text: "Suporte Técnico",
          next_block: "technical_support",
          assign_team: 1,
          assign_team_member: true,
          assignment_strategy: "round_robin"
        },
        {
          text: "Vendas",
          next_block: "sales",
          assign_team: 2,
          assign_team_member: true,
          assignment_strategy: "least_busy"
        }
      ]
    },
    {
      id: "technical_support",
      name: "Suporte Técnico",
      message: "Direcionando para especialista...",
      assign_team: 1,
      assign_team_member: true,
      assignment_strategy: "round_robin",
      pause_bot: true
    }
  ]
}
```

## Filtros Aplicados

A função `assignConversationToTeamMember` aplica os seguintes filtros:

1. **Pertence ao time**: Agente deve estar no time especificado
2. **Não é administrador**: `role !== 'administrator'`
3. **Está ativo**: `status !== 'offline'` e `available_name !== 'offline'`

## Fallback

Se nenhum agente estiver disponível após os filtros:
1. A conversa é atribuída ao time (fallback)
2. Log de aviso é registrado
3. Sistema continua funcionando normalmente

## Tabela de Controle

O sistema cria automaticamente a tabela `team_round_robin` para controlar a distribuição round-robin:

```sql
CREATE TABLE team_round_robin (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL,
  last_assigned_agent INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id)
);
```

## Vantagens

1. **Distribuição Equilibrada**: Evita sobrecarga de alguns agentes
2. **Exclusão de Administradores**: Foca nos agentes operacionais
3. **Flexibilidade**: Múltiplas estratégias de distribuição
4. **Fallback Seguro**: Sistema continua funcionando mesmo sem agentes disponíveis
5. **Organização**: Atribuição automática e organizada
6. **Monitoramento**: Logs detalhados para acompanhamento

## Considerações

- A estratégia `least_busy` faz consultas adicionais à API do Chatwoot
- O round-robin mantém estado no banco de dados
- Administradores são sempre excluídos da atribuição automática
- O sistema verifica disponibilidade em tempo real 