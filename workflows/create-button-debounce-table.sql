-- Script para criar a tabela button_debounce
-- Esta tabela controla o debounce de botões para evitar cliques duplicados

-- Criar tabela para controle de debounce de botões
CREATE TABLE IF NOT EXISTS button_debounce (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  block_id VARCHAR(255) NOT NULL,
  button_text VARCHAR(500) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id, block_id, button_text)
);

-- Criar índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_button_debounce_conversation_block 
ON button_debounce(conversation_id, block_id);

CREATE INDEX IF NOT EXISTS idx_button_debounce_contact 
ON button_debounce(contact_id);

CREATE INDEX IF NOT EXISTS idx_button_debounce_processed_at 
ON button_debounce(processed_at);

-- Comentários na tabela
COMMENT ON TABLE button_debounce IS 'Tabela para controle de debounce de botões - evita cliques duplicados';
COMMENT ON COLUMN button_debounce.conversation_id IS 'ID da conversa do Chatwoot';
COMMENT ON COLUMN button_debounce.contact_id IS 'ID do contato (geralmente número de telefone)';
COMMENT ON COLUMN button_debounce.block_id IS 'ID do bloco do workflow onde o botão foi clicado';
COMMENT ON COLUMN button_debounce.button_text IS 'Texto do botão que foi clicado';
COMMENT ON COLUMN button_debounce.processed_at IS 'Timestamp de quando o botão foi processado';

-- Verificar se a tabela foi criada
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'button_debounce'
ORDER BY ordinal_position;

-- Mostrar estatísticas da tabela (se existir)
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats 
WHERE tablename = 'button_debounce';
