# Documentação - Como Enviar Vídeos nos Workflows

## 🎬 Funcionalidade Implementada

O sistema de workflows agora suporta o envio de vídeos e outras mídias através de **cards do Chatwoot**. Esta funcionalidade permite uma experiência mais rica e visual para os usuários.

## 📁 Estrutura do Bloco com Mídia

Para adicionar vídeos a um bloco do workflow, use a seguinte estrutura:

```json
{
  "id": "bloco_exemplo",
  "name": "Exemplo com Vídeo",
  "message": "Aqui está um vídeo explicativo para você!",
  "media": {
    "type": "video",
    "url": "https://youtu.be/exemplo",
    "title": "Título do Vídeo",
    "description": "Descrição adicional que aparecerá no card"
  },
  "buttons": [
    { "text": "Entendi!", "next_block": "proximo_bloco" },
    { "text": "Tenho dúvidas", "next_block": "atendimento" }
  ]
}
```

## 🔧 Parâmetros do Campo `media`

### Campos Obrigatórios:
- **`type`**: Tipo de mídia (`"video"`, `"image"`, `"audio"`)
- **`url`**: URL do arquivo de mídia

### Campos Opcionais:
- **`title`**: Título que aparecerá no card (padrão: "Mídia")
- **`description`**: Descrição adicional exibida no card

## 📱 Como Funciona

1. **Card com Mídia**: Quando um bloco contém o campo `media`, o sistema cria um card visual no Chatwoot
2. **Botões Interativos**: Os botões aparecem como ações no próprio card
3. **Compatibilidade**: Funciona com todos os canais suportados pelo Chatwoot (WhatsApp, Facebook, etc.)

## 🎯 Exemplos Práticos

### 1. Vídeo de Apresentação

```json
{
  "id": "apresentacao",
  "name": "Vídeo de Apresentação",
  "message": "Conheça nossa empresa neste vídeo!",
  "media": {
    "type": "video",
    "url": "https://youtu.be/abc123",
    "title": "Apresentação da Empresa",
    "description": "Vídeo institucional de 2 minutos"
  },
  "buttons": [
    { "text": "Quero saber mais", "next_block": "informacoes" },
    { "text": "Falar com atendente", "next_block": "atendimento" }
  ]
}
```

### 2. Tutorial com Imagem

```json
{
  "id": "tutorial",
  "name": "Tutorial Visual",
  "message": "Siga este passo a passo:",
  "media": {
    "type": "image",
    "url": "https://exemplo.com/tutorial.png",
    "title": "Como Usar",
    "description": "Tutorial passo a passo ilustrado"
  },
  "next_block": "proximo_passo"
}
```

### 3. Áudio Informativo

```json
{
  "id": "audio_info",
  "name": "Áudio Explicativo",
  "message": "Ouça esta mensagem importante:",
  "media": {
    "type": "audio",
    "url": "https://exemplo.com/audio.mp3",
    "title": "Informações Importantes",
    "description": "Áudio de 1 minuto com detalhes"
  },
  "buttons": [
    { "text": "Entendi", "next_block": "confirmacao" }
  ]
}
```

## 🌐 Tipos de URL Suportados

### Vídeos:
- ✅ YouTube: `https://youtu.be/VIDEO_ID`
- ✅ YouTube (completo): `https://www.youtube.com/watch?v=VIDEO_ID`
- ✅ Vimeo: `https://vimeo.com/VIDEO_ID`
- ✅ URL direta: `https://exemplo.com/video.mp4`

### Imagens:
- ✅ PNG: `https://exemplo.com/imagem.png`
- ✅ JPG: `https://exemplo.com/imagem.jpg`
- ✅ GIF: `https://exemplo.com/animacao.gif`
- ✅ WebP: `https://exemplo.com/imagem.webp`

### Áudios:
- ✅ MP3: `https://exemplo.com/audio.mp3`
- ✅ WAV: `https://exemplo.com/audio.wav`
- ✅ OGG: `https://exemplo.com/audio.ogg`

## ⚠️ Importantes Considerações

### 1. **Hospedagem de Mídia**
- Use URLs públicas e acessíveis
- Certifique-se que o arquivo esteja sempre disponível
- Para uso profissional, recomenda-se CDN (CloudFlare, AWS S3, etc.)

### 2. **Tamanho dos Arquivos**
- Vídeos: Máximo 16MB (limitação do WhatsApp)
- Imagens: Máximo 5MB
- Áudios: Máximo 16MB

### 3. **Compatibilidade por Canal**
- **WhatsApp**: Suporta todos os tipos
- **Facebook Messenger**: Suporta todos os tipos
- **Telegram**: Suporta todos os tipos
- **SMS**: Apenas links (não exibe mídia inline)

## 🔄 Migração de Workflows Existentes

Para atualizar workflows que já usam links de vídeo no texto:

### Antes:
```json
{
  "message": "Veja este vídeo: https://youtu.be/abc123",
  "buttons": [...]
}
```

### Depois:
```json
{
  "message": "Veja este vídeo explicativo:",
  "media": {
    "type": "video",
    "url": "https://youtu.be/abc123",
    "title": "Vídeo Explicativo"
  },
  "buttons": [...]
}
```

## 🚀 Exemplo Completo - Workflow com Vídeos

```json
{
  "name": "exemplo_videos",
  "config": {
    "blocks": {
      "inicio": {
        "id": "inicio",
        "message": "Bem-vindo! Vamos começar com uma apresentação:",
        "media": {
          "type": "video",
          "url": "https://youtu.be/apresentacao123",
          "title": "Apresentação da Empresa",
          "description": "Conheça nossa missão e valores em 2 minutos"
        },
        "buttons": [
          { "text": "Quero conhecer produtos", "next_block": "produtos" },
          { "text": "Preciso de ajuda", "next_block": "atendimento" }
        ]
      },
      "produtos": {
        "id": "produtos",
        "message": "Aqui estão nossos principais produtos:",
        "media": {
          "type": "image",
          "url": "https://exemplo.com/catalogo.jpg",
          "title": "Catálogo de Produtos",
          "description": "Todos os nossos produtos em um só lugar"
        },
        "buttons": [
          { "text": "Quero orçamento", "next_block": "orcamento" },
          { "text": "Ver demonstração", "next_block": "demo" }
        ]
      }
    }
  }
}
```

## 📊 Monitoramento e Analytics

O sistema registra automaticamente:
- ✅ Quantos usuários visualizaram cada mídia
- ✅ Qual tipo de mídia tem maior engajamento
- ✅ Taxa de clique nos botões após exibir mídia

## 🛠️ Troubleshooting

### Problema: Mídia não aparece
**Soluções:**
1. Verifique se a URL está acessível
2. Confirme o formato do campo `media`
3. Teste a URL em um navegador

### Problema: Botões não funcionam
**Soluções:**
1. Verifique a sintaxe JSON
2. Confirme se `next_block` existe
3. Teste com um bloco simples primeiro

### Problema: Vídeo não reproduz
**Soluções:**
1. Use URLs diretas quando possível
2. Para YouTube, use o formato `youtu.be`
3. Verifique se o vídeo não é privado

## 📞 Suporte

Para dúvidas ou problemas:
- 📧 Email: suporte@inovaianalytics.com.br
- 📚 Documentação completa: [Link]
- 🐛 Reportar bugs: [GitHub Issues] 