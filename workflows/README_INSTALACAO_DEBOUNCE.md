# Instalação do Sistema de Debounce de Botões

## 📋 Pré-requisitos

- PostgreSQL configurado e acessível
- Node.js instalado
- Acesso ao banco de dados do Chatwoot
- Permissões de administrador no banco de dados

## 🚀 Instalação Automática

### Opção 1: Script Automático (Recomendado)

```bash
# Navegar para o diretório workflows
cd workflows

# Executar script de instalação
./install-button-debounce.sh
```

O script irá:
- ✅ Verificar configurações do banco de dados
- ✅ Criar a tabela `button_debounce`
- ✅ Criar índices otimizados
- ✅ Executar testes de validação
- ✅ Mostrar relatório de instalação

### Opção 2: Instalação Manual

#### 1. Criar a Tabela

```bash
# Conectar ao PostgreSQL e executar o script SQL
psql -h [DB_HOST] -p [DB_PORT] -d [DB_NAME] -U [DB_USERNAME] -f create-button-debounce-table.sql
```

#### 2. Executar Teste

```bash
# Testar se a instalação foi bem-sucedida
node test-button-debounce.js
```

## 🔧 Configuração das Variáveis de Ambiente

O script usa as seguintes variáveis de ambiente:

```bash
export DB_HOST=localhost          # Host do PostgreSQL
export DB_PORT=5432               # Porta do PostgreSQL
export DB_NAME=chatwoot_production # Nome do banco de dados
export DB_USERNAME=postgres       # Usuário do banco
export DB_PASSWORD=chatwoot       # Senha do banco
```

**Nota**: Se as variáveis não estiverem configuradas, o script usará valores padrão.

## 📊 Verificação da Instalação

### 1. Verificar Tabela Criada

```sql
-- Conectar ao PostgreSQL
psql -h [DB_HOST] -p [DB_PORT] -d [DB_NAME] -U [DB_USERNAME]

-- Verificar se a tabela existe
\d button_debounce

-- Verificar estrutura da tabela
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'button_debounce';
```

### 2. Verificar Índices

```sql
-- Verificar índices criados
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'button_debounce';
```

### 3. Executar Teste Completo

```bash
node test-button-debounce.js
```

**Resultado esperado**:
```
🧪 Testando sistema de debounce de botões...

1️⃣ Verificando se a tabela button_debounce existe:
   ✅ Tabela button_debounce existe

2️⃣ Limpando registros de teste anteriores:
   ✅ Registros de teste anteriores removidos

3️⃣ Testando primeira verificação de debounce:
   Resultado: ✅ Não processado (correto)

[... mais testes ...]

✅ Teste do sistema de debounce concluído com sucesso!
```

## 🔄 Ativação do Sistema

Após a instalação, o sistema de debounce será ativado automaticamente quando:

1. **Reiniciar o serviço** do chatbot workflow
2. **O sistema principal** (`chatbot-workflow-system.js`) for carregado
3. **A tabela** `button_debounce` estiver disponível

## 📈 Monitoramento

### Logs Importantes

Procure por estes logs no sistema:

```
🚫 Botão "Presencial" já foi processado recentemente para o bloco bloco_14. Ignorando clique duplicado.
✅ Processando botão "Presencial" para o bloco bloco_14
🧹 Limpeza de debounce: 5 registros antigos removidos
```

### Verificar Funcionamento

```sql
-- Verificar registros de debounce ativos
SELECT 
  conversation_id,
  block_id,
  button_text,
  processed_at,
  EXTRACT(EPOCH FROM (NOW() - processed_at)) as seconds_ago
FROM button_debounce 
WHERE processed_at > NOW() - INTERVAL '1 hour'
ORDER BY processed_at DESC;
```

## 🛠️ Solução de Problemas

### Erro: "Tabela button_debounce não existe"

```bash
# Recriar a tabela
psql -h [DB_HOST] -p [DB_PORT] -d [DB_NAME] -U [DB_USERNAME] -f create-button-debounce-table.sql
```

### Erro: "Permissão negada"

```bash
# Verificar permissões do usuário
psql -h [DB_HOST] -p [DB_PORT] -d [DB_NAME] -U [DB_USERNAME] -c "\du"

# Se necessário, conceder permissões
GRANT ALL PRIVILEGES ON TABLE button_debounce TO [DB_USERNAME];
```

### Erro: "Conexão recusada"

```bash
# Verificar se o PostgreSQL está rodando
sudo systemctl status postgresql

# Verificar configurações de conexão
cat /etc/postgresql/*/main/postgresql.conf | grep listen_addresses
```

## 📚 Documentação Adicional

- **Solução Completa**: `SOLUCAO_DEBOUNCE_BOTOES.md`
- **Script de Teste**: `test-button-debounce.js`
- **Script SQL**: `create-button-debounce-table.sql`

## 🆘 Suporte

Se encontrar problemas durante a instalação:

1. Verifique os logs do script de instalação
2. Execute o teste manualmente: `node test-button-debounce.js`
3. Verifique as permissões do banco de dados
4. Consulte a documentação completa em `SOLUCAO_DEBOUNCE_BOTOES.md`

---

**Status**: ✅ Pronto para Instalação  
**Versão**: 1.0  
**Data**: 2025-01-27
