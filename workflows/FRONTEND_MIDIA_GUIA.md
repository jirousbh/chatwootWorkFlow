# Guia do Frontend - Gerenciamento de Mídia

## 🎬 Interface de Gerenciamento de Mídia

O sistema agora possui uma **interface completa** para gerenciar arquivos de mídia diretamente pelo navegador! 

## 📱 Como Acessar

1. **Faça login** no sistema workflows
2. Clique no botão **"Gerenciar Mídia"** na sidebar
3. Uma janela modal será aberta com todas as funcionalidades

## 🚀 Funcionalidades Disponíveis

### 1. **Upload de Arquivos**
- **Arrastar e soltar** ou clicar para selecionar
- **Validação automática** de tipo e tamanho
- **Barra de progresso** visual
- **Feedback imediato** de sucesso/erro

### 2. **Lista de Arquivos**
- **Visualização em tabela** organizada
- **Ícones coloridos** por tipo de arquivo
- **Informações detalhadas** (nome, tipo, tamanho, data)
- **ID único** para cada arquivo

### 3. **Ações Disponíveis**
- **👁️ Ver Detalhes**: Informações completas + código de uso
- **📋 Copiar ID**: Copiar ID para área de transferência
- **💻 Copiar Código**: Copiar código JSON para workflow
- **🗑️ Excluir**: Remover arquivo com confirmação

## 🎯 Tipos de Arquivo Suportados

| Tipo | Formatos | Ícone | Cor |
|------|----------|-------|-----|
| **Vídeos** | MP4, AVI, MOV, WMV | 🎥 | Vermelho |
| **Imagens** | JPEG, PNG, GIF, WebP | 🖼️ | Verde |
| **Áudios** | MP3, WAV, OGG | 🎵 | Laranja |

**Limite:** 16MB por arquivo

## 📝 Como Usar nos Workflows

### **Passo 1: Fazer Upload**
1. Clique em **"Gerenciar Mídia"**
2. Selecione ou arraste seu arquivo
3. Clique **"Fazer Upload"**
4. Anote o **ID do arquivo** gerado

### **Passo 2: Usar no Workflow**
```json
{
  "id": "bloco_video",
  "name": "Demonstração",
  "message": "Veja este vídeo explicativo:",
  "media": {
    "attachment": {
      "file_id": "1703123456789"
    }
  },
  "buttons": [
    { "text": "Entendi!", "next_block": "proximo" }
  ]
}
```

### **Passo 3: Copiar Código Facilmente**
- Clique no ícone **💻** na lista de arquivos
- O código será copiado automaticamente
- Cole no seu JSON do workflow

## 🖥️ Interface Visual

### **Área de Upload**
```
┌─────────────────────────────────────────┐
│ 📁 Selecionar Arquivo                   │
│ [Arrastar arquivo aqui ou clicar]      │
│ MP4, JPEG, PNG, MP3... (máx 16MB)      │
│                              [Upload]   │
└─────────────────────────────────────────┘
```

### **Lista de Arquivos**
```
┌─────────────────────────────────────────────────────────────┐
│ Arquivo              │ Tipo   │ Tamanho │ Data │ ID │ Ações │
├─────────────────────────────────────────────────────────────┤
│ 🎥 video_demo.mp4    │ Vídeo  │ 2.1 MB  │ Hoje │ 123│ 👁️💻🗑️│
│ 🖼️ imagem.jpg        │ Imagem │ 800 KB  │ Ontem│ 124│ 👁️💻🗑️│
└─────────────────────────────────────────────────────────────┘
```

## 🎨 Recursos da Interface

### **Visual Moderno**
- ✅ Design responsivo para mobile
- ✅ Ícones coloridos por tipo
- ✅ Animações suaves
- ✅ Feedback visual imediato

### **Usabilidade**
- ✅ Arrastar e soltar arquivos
- ✅ Copiar com um clique
- ✅ Confirmação antes de excluir
- ✅ Tooltips informativos

### **Acessibilidade**
- ✅ Navegação por teclado
- ✅ Leitores de tela compatíveis
- ✅ Contraste adequado
- ✅ Textos alternativos

## 🔧 Estados e Feedback

### **Upload em Progresso**
```
📤 Enviando...  [████████░░] 80%
```

### **Upload Concluído**
```
✅ Arquivo carregado com sucesso: video_demo.mp4
```

### **Erro no Upload**
```
❌ Erro: Arquivo muito grande (máximo 16MB)
```

### **Lista Vazia**
```
📂 Nenhum arquivo encontrado
   Faça upload para começar a usar mídia nos workflows
```

## 📋 Detalhes do Arquivo

Ao clicar em **"Ver Detalhes"**, você verá:

```
┌─── Informações do Arquivo ───┐ ┌─── Como Usar no Workflow ───┐
│ Nome Original: video.mp4     │ │ "media": {                   │
│ Nome Sistema:  abc123.mp4    │ │   "attachment": {            │
│ Tipo MIME:     video/mp4     │ │     "file_id": "123456"      │
│ Tamanho:       2.1 MB        │ │   }                          │
│ Upload:        10/12 14:30   │ │ }                            │
│ ID:            1703123456    │ │           [📋 Copiar Código]  │
└─────────────────────────────┘ └─────────────────────────────┘
```

## 🚨 Confirmação de Exclusão

```
⚠️ Confirmar Exclusão

Tem certeza que deseja excluir este arquivo?

📁 video_demo.mp4
   video/mp4 • 2.1 MB

⚠️ Esta ação não pode ser desfeita.

          [Cancelar]  [🗑️ Excluir]
```

## 💡 Dicas de Uso

### **Organização**
- Use nomes descritivos para os arquivos
- Mantenha apenas arquivos necessários
- Exclua arquivos antigos regularmente

### **Performance**
- Comprima vídeos grandes antes do upload
- Use formatos otimizados (MP4 para vídeo, JPEG para imagem)
- Evite arquivos desnecessariamente grandes

### **Integração**
- Copie o código gerado automaticamente
- Use o botão "💻" para facilitar
- Teste sempre após adicionar mídia

## 📱 Responsividade

A interface se adapta a diferentes tamanhos de tela:

### **Desktop (>992px)**
- Modal em tela cheia (1200px)
- Tabela completa com todas as colunas
- Botões lado a lado

### **Tablet (768-992px)**
- Modal reduzido (95% da tela)
- Fonte menor na tabela
- Botões menores

### **Mobile (<768px)**
- Margens reduzidas
- Botões empilhados verticalmente
- Tabela com scroll horizontal

## 🎉 Pronto para Usar!

Agora você tem uma **interface completa e profissional** para gerenciar toda sua mídia! 

- 📁 **Upload** intuitivo
- 📋 **Listagem** organizada  
- 💻 **Integração** facilitada
- 🗑️ **Gerenciamento** completo

**Acesse pelo botão "Gerenciar Mídia" na sidebar e comece a usar! 🚀** 