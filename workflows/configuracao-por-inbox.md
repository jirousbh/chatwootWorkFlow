# 📬 Configuração de Workflows por Caixa de Entrada (Inbox)

## 🎯 **SOLUÇÃO SEM TRIGGERS**

Esta configuração permite que cada **caixa de entrada** (inbox) tenha seu próprio workflow automaticamente, sem depender de palavras-chave (triggers).

## 📋 **ARQUIVOS CRIADOS**

### 1. **`wizard-comercial-inbox.json`**
- **Para:** Caixa de entrada comercial
- **Público:** Prospects e leads interessados
- **Fluxo:** Apresentação → Metodologia → Planos → Conversão

### 2. **`wizard-atendimento-inbox.json`**
- **Para:** Caixa de entrada de atendimento/suporte
- **Público:** Alunos existentes
- **Fluxo:** Triagem → Setorização → Transferência

## ⚙️ **CONFIGURAÇÃO NO CHATWOOT**

### **Passo 1: Criar as Caixas de Entrada**

No painel do Chatwoot, vá em **Configurações → Inboxes** e crie:

1. **📈 Inbox Comercial**
   - Nome: `Wizard Comercial`
   - Descrição: `Leads e prospects interessados em cursos`
   - Webhook/WhatsApp: Configure conforme necessário

2. **🎧 Inbox Atendimento**
   - Nome: `Wizard Atendimento`
   - Descrição: `Suporte para alunos existentes`
   - Webhook/WhatsApp: Configure conforme necessário

### **Passo 2: Configurar Workflows por Inbox**

1. **Workflow Comercial:**
   - Vá em **Configurações → Automações → Workflows**
   - Clique em **"Novo Workflow"**
   - Nome: `Wizard Comercial Inbox`
   - **Condições:** `Inbox é igual a "Wizard Comercial"`
   - **Ações:** Executar workflow `wizard-comercial-inbox.json`

2. **Workflow Atendimento:**
   - Vá em **Configurações → Automações → Workflows**
   - Clique em **"Novo Workflow"**
   - Nome: `Wizard Atendimento Inbox`
   - **Condições:** `Inbox é igual a "Wizard Atendimento"`
   - **Ações:** Executar workflow `wizard-atendimento-inbox.json`

### **Passo 3: Configurar Teams**

Certifique-se de que os Teams estão configurados:

- **Team 1:** Comercial
- **Team 2:** Pedagógico 
- **Team 3:** Financeiro
- **Team 4:** Suporte Técnico

## 🔄 **FLUXO DE FUNCIONAMENTO**

### **📈 Caixa Comercial**
```
Cliente entra → Inbox Comercial → workflow-comercial-inbox.json
└── Boas-vindas → Objetivos → Metodologia → Planos → Conversão
```

### **🎧 Caixa Atendimento**
```
Cliente entra → Inbox Atendimento → workflow-atendimento-inbox.json
└── Triagem (Aluno/Prospect) → Escolha Setor → Transfer Team
```

## 💡 **VANTAGENS DESTA ABORDAGEM**

✅ **Sem conflito de triggers**
✅ **Controle total por inbox**
✅ **Fluxos específicos para cada público**
✅ **Fácil manutenção**
✅ **Métricas separadas por tipo de atendimento**

## 🚀 **IMPLEMENTAÇÃO ALTERNATIVA**

Se o Chatwoot não suportar workflows específicos por inbox, você pode usar:

### **Opção 1: Regras de Automação**
```json
{
  "conditions": [
    {"attribute": "inbox_id", "operator": "equal_to", "value": "INBOX_COMERCIAL_ID"}
  ],
  "actions": [
    {"action_name": "send_message", "action_params": {"message": "conteúdo do bloco inicial"}}
  ]
}
```

### **Opção 2: Webhook por Inbox**
- Configure um webhook diferente para cada inbox
- Cada webhook processa o workflow correspondente
- Sistema mais robusto e flexível

## 📊 **CONFIGURAÇÃO DE TEAMS**

### **Team IDs no Sistema:**
```json
{
  "team_1": {"name": "Comercial", "id": 1},
  "team_2": {"name": "Pedagógico", "id": 2}, 
  "team_3": {"name": "Financeiro", "id": 3},
  "team_4": {"name": "Suporte", "id": 4}
}
```

## 🔧 **TESTE DA CONFIGURAÇÃO**

1. **Teste Inbox Comercial:**
   - Envie mensagem para caixa comercial
   - Deve iniciar com: "Oi {{nome}}, aqui é o Rafa da Wizard BH Buritis! 🌟"

2. **Teste Inbox Atendimento:**
   - Envie mensagem para caixa atendimento
   - Deve iniciar com: "Olá {{nome}}! 👋 Eu sou o assistente virtual da Wizard BH Buritis."

## ⚡ **IMPLEMENTAÇÃO RÁPIDA**

Se precisar implementar rapidamente, você pode:

1. **Upload direto dos arquivos** no sistema de workflows
2. **Configurar manualmente** qual inbox usa qual workflow
3. **Testar** com mensagens de exemplo
4. **Ajustar** conforme necessário

## 🎯 **RESULTADO ESPERADO**

- **Comercial:** Leads qualificados e conversões automáticas
- **Atendimento:** Alunos direcionados corretamente para cada setor
- **Zero conflitos** entre workflows
- **Experiência personalizada** por tipo de cliente 