# Documentação - Anexos Diretos nos Workflows

## 🎯 Funcionalidade Implementada

O sistema agora suporta **anexos diretos** de arquivos (vídeos, imagens, áudios) nos workflows, além dos cards com URLs externas. Você pode fazer upload de arquivos e anexá-los diretamente nas mensagens do Chatwoot.

## 📋 Tipos de Arquivo Suportados

### ✅ Vídeos
- `video/mp4`
- `video/avi` 
- `video/mov`
- `video/wmv`
- `video/quicktime`

### ✅ Imagens
- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/gif`
- `image/webp`

### ✅ Áudios
- `audio/mp3`
- `audio/wav`
- `audio/ogg`
- `audio/mpeg`

**Limite:** 16MB por arquivo

## 🚀 Como Usar

### 1. **Upload de Arquivo via API**

```bash
POST /api/upload-media
Content-Type: multipart/form-data
Authorization: Bearer <seu_token>

# Form data:
media: <arquivo>
```

**Resposta:**
```json
{
  "success": true,
  "file": {
    "id": "1703123456789",
    "originalname": "video_demo.mp4",
    "filename": "abc123.mp4",
    "path": "uploads/media/abc123.mp4",
    "mimetype": "video/mp4",
    "size": 2048576,
    "upload_date": "2024-01-01T10:00:00.000Z"
  },
  "message": "Arquivo carregado com sucesso!"
}
```

### 2. **Estrutura do Workflow com Anexo**

```json
{
  "id": "video_demo",
  "name": "Demonstração com Vídeo",
  "message": "Aqui está um vídeo explicativo para você!",
  "media": {
    "attachment": {
      "file_id": "1703123456789"
    },
    "delay": 3000
  },
  "buttons": [
    { "text": "Entendi!", "next_block": "proximo" },
    { "text": "Mais info", "next_block": "detalhes" }
  ]
}
```

### 3. **Envio Manual via API**

```bash
POST /api/test-attachment
Content-Type: application/json
Authorization: Bearer <seu_token>

{
  "conversationId": 123,
  "message": "Veja este arquivo:",
  "fileId": "1703123456789"
}
```

## ⏰ Sistema de Delay

### **Delay em Anexos de Mídia**

O sistema suporta **delay customizável** entre o envio da mensagem e a exibição dos botões:

```json
{
  "media": {
    "attachment": {
      "file_id": "1703123456789"
    },
    "delay": 3000
  }
}
```

**Configurações de Delay:**
- **Vídeos**: Delay padrão de 3 segundos (3000ms)
- **Imagens/Áudios**: Delay padrão de 1 segundo (1000ms)
- **Customizável**: Você pode definir qualquer valor em milissegundos

### **Auto Follow-up com Delay**

O sistema suporta **follow-ups automáticos** com delay configurável:

```json
{
  "auto_followup": {
    "bloco_7": {
      "delay": 1800000,
      "condition": "inactive"
    },
    "bloco_8": {
      "delay": 72000000,
      "condition": "inactive"
    }
  }
}
```

**Configurações:**
- **`delay`**: Tempo em milissegundos (ex: 1800000 = 30 minutos)
- **`condition`**: Condição para execução (`inactive` = quando usuário não responde)

**Exemplos de Delay:**
- `1800000` = 30 minutos
- `3600000` = 1 hora  
- `7200000` = 2 horas
- `72000000` = 24 horas

## 🔄 Duas Formas de Usar Mídia

### **Método 1: URLs Externas (já existente)**
```json
"media": {
  "type": "video",
  "url": "https://youtu.be/VIDEO_ID",
  "title": "Título do Vídeo",
  "description": "Descrição"
}
```

### **Método 2: Anexos Diretos (novo)**
```json
"media": {
  "attachment": {
    "file_id": "1703123456789"
  },
  "delay": 3000
}
```

## 📊 Gerenciamento de Arquivos

### **Listar Arquivos Carregados**
```bash
GET /api/media-files
Authorization: Bearer <seu_token>
```

### **Deletar Arquivo**
```bash
DELETE /api/media-files/:file_id
Authorization: Bearer <seu_token>
```

## 🛠️ APIs Disponíveis

### 1. Upload de Mídia
- **URL:** `POST /api/upload-media`
- **Auth:** Bearer token obrigatório
- **Body:** multipart/form-data com campo `media`
- **Retorna:** Informações do arquivo carregado

### 2. Listar Arquivos
- **URL:** `GET /api/media-files`
- **Auth:** Bearer token obrigatório
- **Retorna:** Lista dos últimos 50 arquivos

### 3. Deletar Arquivo
- **URL:** `DELETE /api/media-files/:id`
- **Auth:** Bearer token obrigatório
- **Retorna:** Confirmação da exclusão

### 4. Testar Anexo
- **URL:** `POST /api/test-attachment`
- **Auth:** Bearer token obrigatório
- **Body:** `{ conversationId, message, fileId }`
- **Retorna:** Confirmação do envio

## 📁 Estrutura de Arquivos

```
workflows/
├── uploads/
│   ├── media/           # Arquivos de mídia carregados
│   │   ├── abc123.mp4
│   │   ├── def456.jpg
│   │   └── ghi789.mp3
│   └── ...
├── sql/
│   └── create_media_files_table.sql
└── ...
```

## 💾 Banco de Dados

A tabela `media_files` armazena metadados:

```sql
CREATE TABLE media_files (
    id VARCHAR(255) PRIMARY KEY,
    original_name VARCHAR(500) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    mimetype VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true
);
```

## 📝 Exemplo Prático Completo

### 1. **Fazer Upload do Vídeo**
```bash
curl -X POST \
  -H "Authorization: Bearer SEU_TOKEN" \
  -F "media=@video_explicativo.mp4" \
  http://localhost:3008/api/upload-media
```

### 2. **Usar no Workflow com Delay**
```json
{
  "bloco_video": {
    "id": "bloco_video",
    "name": "Demonstração",
    "message": "Veja como funciona na prática!",
    "media": {
      "attachment": {
        "file_id": "1703123456789"
      },
      "delay": 5000
    },
    "buttons": [
      { "text": "Quero saber mais", "next_block": "contato" },
      { "text": "Tenho dúvidas", "next_block": "suporte" }
    ]
  }
}
```

### 3. **Configurar Auto Follow-up**
```json
{
  "auto_followup": {
    "bloco_7": {
      "delay": 1800000,
      "condition": "inactive"
    },
    "bloco_8": {
      "delay": 72000000,
      "condition": "inactive"
    }
  }
}
```

### 4. **Resultado no Chatwoot**
- Mensagem de texto: "Veja como funciona na prática!"
- Arquivo de vídeo anexado
- **Delay de 5 segundos** antes de mostrar os botões
- Botões interativos funcionais
- **Follow-up automático** após 30 minutos se usuário não responder

## ⚠️ Importantes Considerações

1. **Limpeza Automática:** Arquivos são removidos após o envio para economizar espaço
2. **Autenticação:** Todas as APIs requerem token de autenticação
3. **Limite de Tamanho:** Máximo 16MB por arquivo
4. **Formatos:** Apenas tipos MIME permitidos são aceitos
5. **Armazenamento:** Arquivos ficam em `uploads/media/`
6. **Delay:** Configurável por anexo, com valores padrão inteligentes
7. **Auto Follow-up:** Execução automática baseada em inatividade

## 🔧 Troubleshooting

### **Erro: "Tipo de arquivo não suportado"**
- Verifique se o MIME type está na lista permitida
- Confirme a extensão do arquivo

### **Erro: "Arquivo muito grande"**
- Reduza o tamanho para menos de 16MB
- Use compressão de vídeo se necessário

### **Erro: "Token inválido"**
- Verifique se o token Bearer está correto
- Confirme se o usuário tem permissões

### **Erro: "Arquivo não encontrado"**
- Verifique se o `file_id` existe na base
- Confirme se o arquivo não foi deletado

### **Delay não funcionando**
- Verifique se o valor está em milissegundos
- Confirme se a propriedade `delay` está no nível correto do JSON

## 🎉 Pronto para Usar!

Agora você pode enviar **vídeos, imagens e áudios diretamente** nos seus workflows do Chatwoot, com **delay customizável** e **follow-ups automáticos**, proporcionando uma experiência muito mais rica e interativa para seus usuários! 📱✨ 