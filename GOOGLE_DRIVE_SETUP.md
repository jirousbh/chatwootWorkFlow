# 🚀 Configuração do Google Drive para Backup

Este guia explica como configurar o backup do Chatwoot no Google Drive.

## 📋 Pré-requisitos

1. **Conta Google** com Google Drive ativo
2. **Projeto no Google Cloud Console**
3. **Google Drive API habilitada**
4. **Credenciais de conta de serviço**

## 🔧 Passo a Passo

### 1. Criar Projeto no Google Cloud Console

1. Acesse: [Google Cloud Console](https://console.cloud.google.com/)
2. Clique em "Selecionar projeto" → "Novo projeto"
3. Digite um nome (ex: "Chatwoot-Backup")
4. Clique em "Criar"

### 2. Habilitar Google Drive API

1. No menu lateral, vá em "APIs e serviços" → "Biblioteca"
2. Pesquise por "Google Drive API"
3. Clique na API e depois em "Habilitar"

### 3. Criar Credenciais

1. Vá em "APIs e serviços" → "Credenciais"
2. Clique em "Criar credenciais" → "Conta de serviço"
3. Preencha:
   - **Nome**: `chatwoot-backup-service`
   - **Descrição**: `Serviço para backup do Chatwoot`
4. Clique em "Criar e continuar"
5. Em "Conceder acesso", selecione "Editor"
6. Clique em "Concluído"

### 4. Baixar Credenciais

1. Na lista de contas de serviço, clique na criada
2. Vá na aba "Chaves"
3. Clique em "Adicionar chave" → "Criar nova chave"
4. Escolha "JSON"
5. Clique em "Criar"
6. O arquivo será baixado automaticamente

### 5. Compartilhar Pasta no Google Drive

1. Acesse [Google Drive](https://drive.google.com/)
2. Crie uma pasta chamada "Chatwoot_Backups"
3. Clique com botão direito na pasta → "Compartilhar"
4. Adicione o email da conta de serviço (encontrado no arquivo JSON)
5. Dê permissão de "Editor"

### 6. Configurar no Sistema

```bash
# Executar configuração
./upload-backup-cloud.sh --setup

# Escolher opção 3 (Google Drive)
# Digite o nome da pasta: Chatwoot_Backups
# Digite o caminho do arquivo JSON: /caminho/para/credenciais.json
```

### 7. Configurar rclone

Na primeira execução, o script irá abrir o rclone config:

```bash
# Escolha "n" para nova configuração
# Nome: gdrive
# Escolha "Google Drive"
# Escolha "Use service account"
# Digite o caminho do arquivo JSON
# Escolha "n" para não usar proxy
# Escolha "y" para confirmar
```

## 🧪 Testar Configuração

```bash
# Testar conexão
./upload-backup-cloud.sh --test

# Fazer upload de teste
./upload-backup-cloud.sh --upload-latest
```

## 📁 Estrutura no Google Drive

Após o upload, você verá:

```
Chatwoot_Backups/
├── chatwoot_backup_20250902_104125/
│   ├── databases/
│   ├── data_dirs/
│   ├── redis/
│   └── backup_info.txt
└── chatwoot_backup_20250902_113620/
    ├── databases/
    ├── data_dirs/
    ├── redis/
    └── backup_info.txt
```

## 🔒 Segurança

- **NUNCA** compartilhe o arquivo de credenciais
- Use permissões mínimas necessárias
- Considere rotacionar as credenciais periodicamente
- Monitore o uso da API

## 🛠️ Solução de Problemas

### Erro: "Failed to create drive service"

- Verifique se o arquivo JSON está correto
- Confirme se a API está habilitada
- Verifique as permissões da conta de serviço

### Erro: "Access denied"

- Confirme se a pasta foi compartilhada com a conta de serviço
- Verifique se as credenciais têm permissão de "Editor"

### Erro: "Quota exceeded"

- Google Drive tem limite de 15GB para contas gratuitas
- Considere upgrade para Google Workspace
- Ou use outro provedor para backups grandes

## 💡 Dicas

1. **Backup incremental**: O script só faz upload de arquivos novos
2. **Compressão**: Arquivos já estão comprimidos para economizar espaço
3. **Organização**: Cada backup fica em pasta separada com timestamp
4. **Monitoramento**: Use o log `cloud-upload.log` para acompanhar

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs: `tail -f cloud-upload.log`
2. Teste a conexão: `./upload-backup-cloud.sh --test`
3. Verifique as credenciais e permissões
4. Consulte a documentação do Google Drive API


