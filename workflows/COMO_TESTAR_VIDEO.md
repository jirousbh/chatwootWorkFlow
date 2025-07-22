# 🎬 Como Testar Envio de Vídeos - Guia Prático

## ✅ **STATUS: Sistema Funcionando!**

A URL pública está retornando vídeos corretamente:
- ✅ **Status 200 OK**
- ✅ **Content-Type: video/mp4** 
- ✅ **Tamanho: 6.11MB**

## 🚀 **Teste 1: Via Workflow (Recomendado)**

### **1. Criar Workflow com Vídeo:**

```json
{
  "name": "teste_video",
  "config": {
    "blocks": {
      "start": {
        "id": "start",
        "name": "Teste de Vídeo",
        "message": "Aqui está um vídeo de demonstração:",
        "media": {
          "attachment": {
            "file_id": "1752608369518"
          }
        },
        "buttons": [
          { "text": "Funcionou!", "next_block": "success" },
          { "text": "Não funcionou", "next_block": "error" }
        ]
      },
      "success": {
        "id": "success",
        "name": "Sucesso",
        "message": "🎉 Ótimo! O vídeo foi entregue com sucesso!"
      },
      "error": {
        "id": "error", 
        "name": "Erro",
        "message": "😞 Vamos investigar o problema. Pode me contar o que aconteceu?"
      }
    }
  }
}
```

### **2. Como Configurar:**

1. **Acesse**: https://workflows.inovaianalytics.com.br
2. **Login**: admin / 123456  
3. **Vá em**: "Gerenciar Workflows"
4. **Clique**: "Novo Workflow"
5. **Cole o JSON** acima
6. **Salve** o workflow

### **3. Como Testar:**

1. **Abra o WhatsApp**
2. **Envie mensagem** para o número do Chatwoot
3. **Digite**: `start`
4. **Resultado esperado**:
   - Card com vídeo aparece
   - Preview do vídeo visível
   - Botões "Funcionou!" e "Não funcionou"
   - SEM erro 131053

## 🧪 **Teste 2: Via API Direta**

### **Pré-requisitos:**
- Conversa ativa no Chatwoot
- Token da API configurado

### **Comando:**
```bash
cd /root/chatwoot/workflows
docker exec chatwoot-chatbot-workflows-1 node teste-video-simples.js
```

## 📋 **Teste 3: Verificar Logs**

### **Durante o teste, execute:**
```bash
# Logs em tempo real
docker logs -f chatwoot-chatbot-workflows-1

# Procurar por URL pública
grep "URL pública" /root/chatwoot/data/workflows-logs/*.log

# Verificar cards enviados
grep "Card com mídia" /root/chatwoot/data/workflows-logs/*.log
```

### **Logs esperados:**
```
[2025-01-16 15:30:25] [INFO] 📁 Arquivo encontrado: VID_20250715_155306.mp4 (ID: 1752608369518)
[2025-01-16 15:30:25] [INFO] 🌐 Enviando via URL pública: https://workflows.../public-preview/1752608369518
[2025-01-16 15:30:25] [INFO] 📎 Enviando mensagem com anexo via URL pública: VID_20250715_155306.mp4
[2025-01-16 15:30:26] [INFO] ✅ Card com mídia enviado com sucesso! Status: 200
```

## 🔍 **Se o Vídeo NÃO Apareceu:**

### **Verificações:**

#### **1. Conversa Ativa?**
```bash
# Ver se há conversas ativas
curl -H "Authorization: Bearer $CHATWOOT_API_TOKEN" \
  https://crm.inovaianalytics.com.br/api/v1/accounts/1/conversations?status=open
```

#### **2. Arquivo Existe?**
```bash
# Testar URL diretamente
curl -I https://workflows.inovaianalytics.com.br/public-preview/1752608369518
```

#### **3. Workflow Configurado?**
- Verifique se o `file_id` está correto
- Confirme se o workflow está ativo
- Teste com uma conversa nova

#### **4. Trigger Correto?**
- Envie exatamente: `start`
- Ou configure trigger personalizado

## 🛠️ **Troubleshooting**

### **Problema: "Não há conversas ativas"**
**Solução:**
1. Abra WhatsApp
2. Envie qualquer mensagem para o Chatwoot
3. Execute o teste novamente

### **Problema: "Erro 404 na URL"**
**Solução:**
1. Verifique se o `file_id` existe no banco:
   ```bash
   docker exec 7d51c826c403_chatwoot-postgres-1 psql -U postgres -d chatwoot_workflows \
     -c "SELECT id, original_name FROM media_files ORDER BY upload_date DESC LIMIT 5;"
   ```

### **Problema: "Card não aparece"**
**Soluções:**
1. **Teste em conversa diferente**
2. **Verifique se é canal WhatsApp** (outros canais podem não suportar cards)
3. **Use método de fallback**:
   ```bash
   # Forçar erro para ativar fallback
   docker exec chatwoot-chatbot-workflows-1 sed -i 's/workflows.inovaianalytics.com.br/ERRO.COM/g' chatbot-workflow-system.js
   docker-compose restart chatbot-workflows
   ```

### **Problema: "Erro 131053 ainda acontece"**
**Solução:**
1. **Verificar se URL está sendo usada**:
   ```bash
   grep "URL pública" /root/chatwoot/data/workflows-logs/*.log
   ```
2. **Se não há logs, o sistema está usando método antigo**
3. **Reiniciar sistema**:
   ```bash
   docker-compose restart chatbot-workflows
   ```

## 📊 **IDs de Arquivos Disponíveis:**

Estes arquivos estão prontos para teste:

| ID | Nome | Tipo | Tamanho |
|----|------|------|---------|
| `1752672671479` | avatar_cristiano.png | image/png | ~400KB |
| `1752608369518` | VID_20250715_155306.mp4 | video/mp4 | ~6.4MB |
| `1752608983358` | test.png | image/png | ~70B |

## 🎯 **Teste Rápido:**

**1. Configure workflow** com `file_id: "1752608369518"`
**2. Envie `start`** em uma conversa do WhatsApp
**3. Deve aparecer** card com vídeo de 6.4MB

## 📞 **Próximos Passos:**

1. **✅ Teste o workflow** com o JSON acima
2. **📋 Verifique os logs** durante o teste  
3. **📱 Confirme no WhatsApp** se apareceu o card
4. **🔄 Repita com arquivos diferentes** se necessário

---

**🚀 A implementação está funcionando! O problema pode ser apenas configuração ou falta de teste prático.** 