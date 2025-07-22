# Sistema de Logs Duplo - Chatwoot Workflows

## 🎯 Funcionalidade Implementada

O sistema agora possui **logs duplos** que aparecem simultaneamente em:
1. **Console do Docker** (visível via `docker logs`)
2. **Arquivos persistentes** (salvos em `./data/workflows-logs`)

## 📋 Vantagens do Sistema

### ✅ **Console (Docker Logs)**
- ✨ Logs em tempo real
- 🔄 Ideal para debug e monitoramento
- 🚀 Acesso imediato via `docker logs`

### ✅ **Arquivos Persistentes**
- 📁 Histórico completo de logs
- 🔍 Busca e análise detalhada
- 📊 Auditoria e troubleshooting
- 💾 Backup automático com o volume Docker

## 🚀 Como Visualizar os Logs

### **1. Logs em Tempo Real (Console)**
```bash
# Ver logs em tempo real
docker logs -f chatwoot-chatbot-workflows-1

# Ver últimas 100 linhas
docker logs --tail 100 chatwoot-chatbot-workflows-1

# Filtrar por erro
docker logs chatwoot-chatbot-workflows-1 2>&1 | grep -i error

# Filtrar por anexos
docker logs chatwoot-chatbot-workflows-1 2>&1 | grep -i "anexo\|attachment"
```

### **2. Logs em Arquivos (Persistentes)**
```bash
# Acessar diretório de logs
cd ./data/workflows-logs

# Ver logs de hoje
cat chatwoot-$(date +%Y-%m-%d).log

# Ver logs de uma data específica
cat chatwoot-2024-01-15.log

# Buscar por erros em todos os logs
grep -i "error\|erro" *.log

# Buscar por problemas de anexo
grep -i "anexo\|attachment\|131053" *.log

# Últimas 50 linhas dos logs de hoje
tail -50 chatwoot-$(date +%Y-%m-%d).log
```

## 📊 Formato dos Logs

### **Estrutura Padrão**
```
[YYYY-MM-DD HH:MM:SS] [LEVEL] Mensagem
```

### **Exemplos**
```
[2024-01-15 14:30:25] [INFO] 📎 Enviando mensagem com anexo: video.mp4
[2024-01-15 14:30:26] [ERROR] ❌ Erro ao enviar mensagem com anexo: Arquivo não encontrado
[2024-01-15 14:30:27] [WARN] ⚠️ AVISO: Vídeo com 12.5MB pode ser rejeitado pelo WhatsApp
```

## 🔧 Gerenciamento Automático

### **Limpeza Automática**
- 🗑️ **Logs antigos** (>30 dias) são removidos automaticamente
- ⏰ **Limpeza diária** às 00:00
- 💾 **Economia de espaço** em disco

### **Criação Automática**
- 📁 **Diretório de logs** criado automaticamente no primeiro uso
- 📅 **Arquivos diários** criados no formato `chatwoot-YYYY-MM-DD.log`
- 🔄 **Rotação automática** por data

## 📈 Monitoramento de Anexos

### **Logs Específicos de Anexos**
```bash
# Buscar problemas com anexos
grep -E "(anexo|attachment|131053)" ./data/workflows-logs/*.log

# Ver validações de mídia
grep "Validando arquivo" ./data/workflows-logs/*.log

# Verificar envios bem-sucedidos
grep "Anexo enviado com sucesso" ./data/workflows-logs/*.log
```

### **Logs de Erro WhatsApp API**
```bash
# Erro 131053 (arquivo rejeitado)
grep "131053" ./data/workflows-logs/*.log

# Problemas de tamanho
grep "muito grande" ./data/workflows-logs/*.log

# Problemas de formato
grep "não suportado" ./data/workflows-logs/*.log
```

## 🛠️ Comandos Úteis

### **Análise de Performance**
```bash
# Contar tipos de log por nível
grep -c "\[ERROR\]" ./data/workflows-logs/*.log
grep -c "\[WARN\]" ./data/workflows-logs/*.log
grep -c "\[INFO\]" ./data/workflows-logs/*.log

# Estatísticas de anexos
grep -c "anexo enviado com sucesso" ./data/workflows-logs/*.log
grep -c "Erro ao enviar mensagem com anexo" ./data/workflows-logs/*.log
```

### **Backup de Logs**
```bash
# Compactar logs antigos
tar -czf logs-backup-$(date +%Y%m%d).tar.gz ./data/workflows-logs/*.log

# Mover logs antigos
mkdir -p ./data/workflows-logs/backup
mv ./data/workflows-logs/chatwoot-2024-01-*.log ./data/workflows-logs/backup/
```

## 🔍 Troubleshooting com Logs

### **Problema: Anexos não enviando**
```bash
# 1. Verificar erros recentes
docker logs --tail 50 chatwoot-chatbot-workflows-1 | grep -i error

# 2. Buscar problemas específicos de anexo
grep -A 5 -B 5 "Erro ao enviar mensagem com anexo" ./data/workflows-logs/*.log

# 3. Verificar validações de arquivo
grep "Validando arquivo" ./data/workflows-logs/chatwoot-$(date +%Y-%m-%d).log
```

### **Problema: Erro 131053 (WhatsApp)**
```bash
# Buscar detalhes do erro
grep -A 10 "131053" ./data/workflows-logs/*.log

# Verificar arquivos rejeitados
grep -B 5 -A 5 "rejeitado pela API oficial do WhatsApp" ./data/workflows-logs/*.log
```

## 🎉 Benefícios Práticos

### **Para Desenvolvedores**
- 🔧 **Debug em tempo real** via `docker logs`
- 📊 **Análise histórica** via arquivos
- 🚨 **Alertas automáticos** com grep/awk

### **Para Administradores**
- 📈 **Monitoramento** de sistema
- 🔍 **Auditoria** de operações
- 💾 **Backup** automático de logs

### **Para Suporte**
- 🎯 **Diagnóstico rápido** de problemas
- 📋 **Relatórios** detalhados
- 🔄 **Rastreamento** de incidentes

## 📞 Como Usar

O sistema de logs duplo funciona **automaticamente**! Todos os `console.log`, `console.error` e `console.warn` do sistema agora:

1. ✅ Aparecem em `docker logs chatwoot-chatbot-workflows-1`
2. ✅ São salvos em `./data/workflows-logs/chatwoot-YYYY-MM-DD.log`
3. ✅ Incluem timestamp detalhado
4. ✅ São organizados por data
5. ✅ Têm limpeza automática

**Nenhuma configuração adicional necessária!** 🎉 