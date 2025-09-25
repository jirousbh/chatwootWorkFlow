# 📅 Configuração do Google Calendar

## 🎯 **Visão Geral**

O agente IA agora pode detectar intenções de agendamento e interagir com o Google Calendar para criar, verificar e gerenciar eventos automaticamente.

## 🔧 **Configuração Necessária**

### **1. Criar Service Account no Google Cloud Console**

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Ative a **Google Calendar API**:
   - Vá em "APIs & Services" > "Library"
   - Busque por "Google Calendar API"
   - Clique em "Enable"

4. Crie uma Service Account:
   - Vá em "APIs & Services" > "Credentials"
   - Clique em "Create Credentials" > "Service Account"
   - Preencha os dados (nome, descrição)
   - Clique em "Create and Continue"

5. Baixe o arquivo JSON:
   - Clique na Service Account criada
   - Vá na aba "Keys"
   - Clique em "Add Key" > "Create new key"
   - Selecione "JSON" e clique em "Create"
   - **IMPORTANTE:** Salve o arquivo JSON em local seguro

### **2. Compartilhar Calendário com Service Account**

1. Abra o [Google Calendar](https://calendar.google.com/)
2. Vá em "Settings" > "Settings for my calendars"
3. Selecione o calendário que será usado
4. Clique em "Share with specific people"
5. Adicione o email da Service Account (formato: `service-account@project.iam.gserviceaccount.com`)
6. Defina permissão como **"Make changes to events"**
7. Clique em "Send"

### **3. Configurar Variáveis de Ambiente**

Crie um arquivo `.env` no diretório do ia-agent:

```bash
# Google Calendar Configuration
GOOGLE_CALENDAR_CREDENTIALS_PATH=/data/ia-agent-dev/credentials.json
GOOGLE_CALENDAR_ID=seu-email@gmail.com  # ou 'primary' para calendário principal
```

### **4. Colocar Arquivo de Credenciais**

Copie o arquivo JSON baixado para o container:

```bash
# Copiar arquivo de credenciais para o container
docker cp credentials.json ia-agent-dev:/data/ia-agent-dev/credentials.json
```

## 🚀 **Funcionalidades Implementadas**

### **Detecção Automática de Agendamento**

O agente IA detecta automaticamente quando o usuário quer agendar algo:

#### **Palavras-chave detectadas:**
- ✅ **Solicitações diretas:** "agendar", "marcar", "reunião", "consulta"
- ✅ **Tempo específico:** "amanhã", "hoje", "segunda", "manhã", "tarde"
- ✅ **Ações:** "quero agendar", "preciso marcar", "tem horário"
- ✅ **Disponibilidade:** "você tem horário", "tem vaga", "está disponível"

#### **Extração de Data/Hora:**
- ✅ **Datas relativas:** "amanhã", "próxima semana"
- ✅ **Dias da semana:** "segunda", "terça", "sexta"
- ✅ **Períodos:** "manhã", "tarde", "noite"

### **Endpoints da API**

#### **1. Detecção de Agendamento**
```http
POST /agents/{agent_id}/chat
```
Retorna informações sobre intenção de agendamento:
```json
{
  "has_scheduling_intent": true,
  "scheduling_info": {
    "datetime": "2025-09-24T09:00:00",
    "date": "24/09/2025",
    "time": "09:00",
    "confidence": 0.7
  },
  "scheduling_confidence": 0.8
}
```

#### **2. Verificar Disponibilidade**
```http
POST /calendar/availability
```
```json
{
  "date": "2025-09-24T00:00:00",
  "start_hour": 9,
  "end_hour": 18,
  "duration_minutes": 60
}
```

#### **3. Criar Evento**
```http
POST /calendar/create-event
```
```json
{
  "summary": "Reunião com Cliente",
  "start_datetime": "2025-09-24T09:00:00",
  "end_datetime": "2025-09-24T10:00:00",
  "description": "Reunião para discutir projeto",
  "attendees": ["cliente@email.com"],
  "location": "Escritório"
}
```

#### **4. Verificar Horário Específico**
```http
POST /calendar/check-availability
```
```json
{
  "start_datetime": "2025-09-24T09:00:00",
  "end_datetime": "2025-09-24T10:00:00"
}
```

#### **5. Deletar Evento**
```http
DELETE /calendar/delete-event/{event_id}
```

## 🧪 **Testes**

### **Teste de Detecção:**
```bash
curl -X POST http://localhost:3006/agents/24dbd1e1-e50c-49ec-bc4e-3dbcbc1aef11/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "quero agendar uma reunião para amanhã de manhã",
    "chat_history": [],
    "is_first_interaction": false
  }'
```

### **Teste de Disponibilidade:**
```bash
curl -X POST http://localhost:3006/calendar/availability \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-09-24T00:00:00",
    "start_hour": 9,
    "end_hour": 18,
    "duration_minutes": 60
  }'
```

## 🔄 **Próximos Passos**

1. **Configurar credenciais** do Google Calendar
2. **Testar detecção** de intenção de agendamento
3. **Integrar com workflow** para agendamento automático
4. **Adicionar confirmação** do usuário antes de criar eventos

## ⚠️ **Importante**

- O Service Account precisa ter permissões no calendário
- Use calendários compartilhados ou Google Workspace para melhor controle
- Teste sempre em ambiente de desenvolvimento primeiro
- Mantenha as credenciais seguras e nunca as commite no código

## 🎉 **Resultado**

Com essa implementação, o agente IA pode:

- ✅ **Detectar automaticamente** quando o usuário quer agendar
- ✅ **Extrair informações** de data/hora da mensagem
- ✅ **Verificar disponibilidade** no calendário
- ✅ **Criar eventos** automaticamente
- ✅ **Gerenciar agendamentos** de forma inteligente

**O sistema está pronto para agendamento inteligente!** 🚀
