# 📧 Sistema de Email via Google Calendar

Este documento explica como funciona o envio automático de emails através do Google Calendar API.

## ✅ **Por que Google Calendar?**

O sistema utiliza o Google Calendar API para envio de emails porque:

- **📧 Email Automático**: O Google Calendar envia emails de confirmação automaticamente
- **🔔 Lembretes Nativos**: Sistema integrado de lembretes (email, popup, SMS)
- **🎨 Design Profissional**: Templates responsivos e profissionais do Google
- **🌍 Multilíngue**: Suporte automático a diferentes idiomas
- **📱 Integração Completa**: Sincronização com Google, Outlook, Apple Calendar
- **🔒 Segurança**: Autenticação e criptografia do Google
- **📊 Deliverability**: Emails não vão para spam (reputação do Google)

## 🚀 **Como Funciona**

### 1. **Agendamento Criado**
- Cliente solicita agendamento via chat
- Sistema cria evento no Google Calendar
- Google Calendar automaticamente envia email de confirmação

### 2. **Email do Cliente Fornecido**
- Cliente informa seu email após agendamento
- Sistema confirma que recebeu o email
- Google Calendar já enviou a confirmação automaticamente

### 3. **Lembretes Automáticos**
- **1 hora antes**: Email de lembrete
- **30 minutos antes**: Popup no calendário
- **Personalizáveis**: Via configurações do Google Calendar

## 📋 **Configurações Necessárias**

### **Google Calendar Service Account**
```bash
# Credenciais JSON da Service Account
GOOGLE_CALENDAR_CREDENTIALS={"type":"service_account",...}

# ID do calendário compartilhado
GOOGLE_CALENDAR_ID=seu_calendario@group.calendar.google.com
```

### **Configurações do Agente**
- ✅ **Calendar Enabled**: Habilitar funcionalidade de calendário
- ✅ **Calendar Credentials**: JSON da Service Account
- ✅ **Calendar ID**: ID do calendário compartilhado
- ✅ **Working Hours**: Horários de funcionamento
- ✅ **Reminders**: Configuração de lembretes

## 🎯 **Fluxo Completo**

### **Passo 1: Cliente Solicita Agendamento**
```
Cliente: "Quero agendar uma reunião"
Agente: "📅 Agendamento Detectado! Preciso de mais informações..."
```

### **Passo 2: Cliente Fornece Detalhes**
```
Cliente: "Reunião comercial\n30 minutos\nSomente eu\nDiscussão sobre produtos"
Agente: "✅ Agendamento Confirmado! Para receber no seu email, informe seu endereço."
```

### **Passo 3: Cliente Fornece Email**
```
Cliente: "Meu email é cliente@exemplo.com"
Agente: "📧 Email Confirmado! Google Calendar enviará automaticamente..."
```

### **Passo 4: Google Calendar Envia Email**
- ✅ Email de confirmação enviado automaticamente
- ✅ Detalhes completos do agendamento
- ✅ Link para adicionar ao calendário
- ✅ Lembretes configurados

## 📧 **Conteúdo do Email Enviado**

O Google Calendar envia emails profissionais com:

### **📅 Detalhes do Evento**
- Data e horário
- Duração
- Tipo de reunião
- Assunto
- Participantes

### **🔗 Ações Disponíveis**
- **Responder**: Aceitar/Recusar convite
- **Adicionar ao Calendário**: Google, Outlook, Apple
- **Ver Detalhes**: Link para o evento

### **⏰ Lembretes**
- **Email**: 1 hora antes
- **Popup**: 30 minutos antes
- **Personalizáveis**: Via Google Calendar

## 🔧 **Configuração de Lembretes**

Os lembretes são configurados automaticamente:

```python
reminders = [
    {"method": "email", "minutes": 60},   # Email 1 hora antes
    {"method": "popup", "minutes": 30}    # Popup 30 min antes
]
```

### **Personalização Disponível**
- **Email**: 15, 30, 60, 120 minutos antes
- **Popup**: 5, 10, 15, 30 minutos antes
- **SMS**: Via Google Calendar (requer configuração)

## 🌍 **Suporte Multilíngue**

O Google Calendar automaticamente:
- ✅ Detecta idioma do cliente
- ✅ Envia emails no idioma correto
- ✅ Formatação local (data/hora)
- ✅ Tradução de botões e ações

## 📱 **Integração com Calendários**

### **Google Calendar**
- ✅ Sincronização automática
- ✅ Lembretes nativos
- ✅ Edição online

### **Outlook**
- ✅ Importação via link
- ✅ Sincronização bidirecional
- ✅ Lembretes nativos

### **Apple Calendar**
- ✅ Importação via link
- ✅ Sincronização iCloud
- ✅ Lembretes nativos

## 🔒 **Segurança e Privacidade**

### **Autenticação**
- ✅ Service Account do Google
- ✅ OAuth 2.0 seguro
- ✅ Tokens de acesso limitados

### **Privacidade**
- ✅ Emails não armazenados localmente
- ✅ Dados criptografados em trânsito
- ✅ Conformidade com LGPD/GDPR

## 🧪 **Testando o Sistema**

### **1. Verificar Configuração**
```bash
# Testar conexão com Google Calendar
docker exec ia-agent-dev python test_calendar_connection.py
```

### **2. Fazer Agendamento**
```bash
# Testar fluxo completo via API
curl -X POST http://localhost:3006/agents/{agent_id}/chat \
  -d '{"message": "Quero agendar uma reunião"}'
```

### **3. Verificar Logs**
```bash
# Monitorar logs do sistema
docker logs ia-agent-dev --follow
```

## ⚠️ **Troubleshooting**

### **Email Não Chega**
- ✅ Verificar pasta de spam
- ✅ Confirmar email correto
- ✅ Verificar logs do Google Calendar
- ✅ Testar com email diferente

### **Lembretes Não Funcionam**
- ✅ Verificar configuração de lembretes
- ✅ Confirmar permissões da Service Account
- ✅ Testar com horário futuro

### **Evento Não Aparece**
- ✅ Verificar ID do calendário
- ✅ Confirmar compartilhamento com Service Account
- ✅ Verificar logs de criação

## 📊 **Vantagens vs SMTP Customizado**

| Recurso | Google Calendar | SMTP Customizado |
|---------|----------------|------------------|
| **Configuração** | ✅ Simples | ❌ Complexa |
| **Deliverability** | ✅ Excelente | ⚠️ Risco de spam |
| **Design** | ✅ Profissional | ❌ Precisa criar |
| **Lembretes** | ✅ Nativos | ❌ Implementar |
| **Integração** | ✅ Completa | ❌ Limitada |
| **Segurança** | ✅ Google | ⚠️ Manual |
| **Manutenção** | ✅ Zero | ❌ Alta |

## 🎉 **Conclusão**

O sistema utiliza o Google Calendar API porque oferece:

- **🚀 Simplicidade**: Zero configuração de email
- **📧 Confiabilidade**: Emails sempre chegam
- **🎨 Profissionalismo**: Design nativo do Google
- **🔔 Funcionalidade**: Lembretes integrados
- **🌍 Escalabilidade**: Suporta qualquer volume

**Resultado**: Sistema robusto, confiável e profissional sem complexidade adicional! 🎯