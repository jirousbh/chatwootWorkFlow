# 📋 Comandos Especiais para Agentes (Atendentes)

## 🎯 Visão Geral

Os agentes (atendentes) do Chatwoot agora podem usar comandos especiais diretamente nas conversas para controlar o comportamento do bot e gerenciar workflows. Esta funcionalidade permite que os atendentes tenham controle total sobre o sistema de chatbot sem precisar acessar interfaces administrativas.

## 🚀 Como Funciona

### Identificação Automática
- O sistema identifica automaticamente mensagens de agentes (tipo `outgoing`)
- Apenas mensagens que começam com `!` são processadas como comandos
- O ID do agente é registrado nos logs para auditoria

### Processamento
- Comandos são processados em tempo real
- Feedback visual é enviado na conversa
- Logs detalhados são gerados para monitoramento

## 📝 Comandos Disponíveis

### 🔄 `!reset`
**Reiniciar fluxo completo**

**O que faz:**
- Remove a conversa atual do workflow
- Remove todos os labels do contato
- Remove todos os labels da conversa
- Reativa o bot automaticamente
- Prepara para uma nova conversa

**Quando usar:**
- Cliente quer recomeçar do zero
- Fluxo está em estado inconsistente
- Necessidade de limpeza completa

**Exemplo de resposta:**
```
🔄 **Comando de Agente Executado**

Fluxo reiniciado com sucesso e todos os labels removidos (contato e conversa). O bot foi reativado e está pronto para uma nova conversa.
```

### ▶️ `!activebot`
**Reativar bot manualmente**

**O que faz:**
- Remove a pausa do bot
- Permite que o bot responda normalmente
- Mantém o estado atual da conversa

**Quando usar:**
- Cliente quer voltar a interagir com o bot
- Atendimento humano foi concluído
- Bot foi pausado por engano

**Exemplo de resposta:**
```
🔄 **Comando de Agente Executado**

▶️ Bot reativado com sucesso! O bot voltará a responder normalmente nesta conversa.
```

### ⏸️ `!pausebot`
**Pausar bot manualmente**

**O que faz:**
- Pausa o bot para a conversa atual
- Impede que o bot responda automaticamente
- Permite atendimento humano exclusivo

**Quando usar:**
- Atendimento humano necessário
- Cliente precisa de ajuda específica
- Bot está respondendo inadequadamente

**Exemplo de resposta:**
```
🔄 **Comando de Agente Executado**

⏸️ Bot pausado com sucesso! O bot não responderá mais nesta conversa até ser reativado.
```

### 🤖 `!botstatus`
**Verificar status do bot**

**O que faz:**
- Mostra o status atual do bot (ativo/pausado)
- Exibe o motivo da pausa (se aplicável)
- Lista todos os comandos disponíveis

**Quando usar:**
- Verificar estado atual do bot
- Diagnosticar problemas
- Ver comandos disponíveis

**Exemplo de resposta:**
```
🔄 **Comando de Agente Executado**

🤖 **Status do Bot**
✅ Ativo
🤖 Sem agente humano

**Comandos disponíveis para agentes:**
• !pausebot - Pausar bot
• !activebot - Reativar bot
• !reset - Reiniciar fluxo
• !workflows - Listar workflows
• !reload - Recarregar workflows
```

### 🔄 `!reload`
**Recarregar workflows do banco**

**O que faz:**
- Atualiza o cache de workflows
- Carrega configurações mais recentes
- Sincroniza com o banco de dados

**Quando usar:**
- Workflows foram atualizados
- Problemas de sincronização
- Manutenção do sistema

**Exemplo de resposta:**
```
🔄 **Comando de Agente Executado**

✅ Workflows recarregados com sucesso! Total de workflows no cache: 5
```

### 📋 `!workflows`
**Listar workflows disponíveis**

**O que faz:**
- Mostra todos os workflows ativos
- Exibe o total de workflows no cache
- Útil para referência

**Quando usar:**
- Verificar workflows disponíveis
- Diagnóstico de problemas
- Planejamento de atendimento

**Exemplo de resposta:**
```
🔄 **Comando de Agente Executado**

📋 Workflows disponíveis (5):
• wizard_bh_buritis
• atendimento_padrao
• vendas_automáticas
• suporte_tecnico
• marketing_campanha
```

## 🛠️ Como Usar

### Passo a Passo

1. **Acesse a conversa** no Chatwoot
2. **Digite o comando** na caixa de mensagem
   - Exemplo: `!reset`
   - Exemplo: `!activebot`
   - Exemplo: `!botstatus`
3. **Envie a mensagem** normalmente (Enter)
4. **Aguarde a confirmação** do sistema
5. **Verifique o resultado** na conversa

### Exemplos Práticos

#### Cenário 1: Cliente quer recomeçar
```
Agente: !reset
Sistema: 🔄 **Comando de Agente Executado**
        Fluxo reiniciado com sucesso...
```

#### Cenário 2: Verificar status do bot
```
Agente: !botstatus
Sistema: 🔄 **Comando de Agente Executado**
        🤖 **Status do Bot**
        ❌ Pausado (manual_pause)
        👤 Agente: 123
```

#### Cenário 3: Reativar bot após atendimento
```
Agente: !activebot
Sistema: 🔄 **Comando de Agente Executado**
        ▶️ Bot reativado com sucesso!
```

## 🔒 Segurança e Logs

### Identificação
- Todos os comandos são registrados com o ID do agente
- Timestamp de execução é salvo
- Conversa e contato são identificados

### Logs de Exemplo
```
[2024-01-15 14:30:25] [INFO] 👤 Processando comando de agente 123 (Inbox: 2): !reset
[2024-01-15 14:30:26] [INFO] 🔄 Reset solicitado por agente 123
[2024-01-15 14:30:27] [INFO] ✅ Bot reativado com sucesso para conversa 456
```

### Auditoria
- Comandos podem ser rastreados nos logs
- Histórico de ações por agente
- Monitoramento de uso dos comandos

## ⚠️ Considerações Importantes

### Limitações
- Comandos só funcionam em conversas ativas
- Apenas mensagens que começam com `!` são processadas
- Agente deve ter acesso à conversa

### Boas Práticas
- Use comandos apenas quando necessário
- Verifique o status antes de executar ações
- Documente o uso para auditoria
- Teste comandos em ambiente de desenvolvimento

### Troubleshooting

#### Comando não funciona
- Verificar se a mensagem começa com `!`
- Confirmar se o agente tem acesso à conversa
- Verificar logs do sistema

#### Bot não reativa
- Verificar se há erros nos logs
- Confirmar se o comando foi executado corretamente
- Verificar status da conversa

#### Workflows não carregam
- Verificar conexão com banco de dados
- Confirmar se workflows existem
- Verificar permissões do sistema

## 📞 Suporte

Para dúvidas sobre os comandos de agentes:

1. **Verifique os logs** do sistema
2. **Use `!botstatus`** para diagnóstico
3. **Consulte a documentação** completa
4. **Entre em contato** com o suporte técnico

---

**Versão:** 1.0  
**Data:** Janeiro 2024  
**Compatibilidade:** Chatwoot + Sistema de Workflows
