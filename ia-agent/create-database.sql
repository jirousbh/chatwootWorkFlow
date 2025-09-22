-- Script para criar o banco de dados do agente IA
-- Execute este script no PostgreSQL para criar o banco workflows_iaagent

-- Criar banco de dados (se não existir)
CREATE DATABASE workflows_iaagent;

-- Conectar ao banco workflows_iaagent
\c workflows_iaagent;

-- Criar tabela de agentes
CREATE TABLE IF NOT EXISTS agent (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    api_provider VARCHAR(50) NOT NULL DEFAULT 'groq',
    model VARCHAR(100) NOT NULL,
    summary_prompt TEXT NOT NULL,
    custom_system_prompt TEXT NOT NULL,
    pdf_filename VARCHAR(255),
    vectorstore_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_agent_name ON agent(name);
CREATE INDEX IF NOT EXISTS idx_agent_active ON agent(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_created_at ON agent(created_at);

-- Comentários nas colunas
COMMENT ON TABLE agent IS 'Tabela para armazenar configurações dos agentes IA';
COMMENT ON COLUMN agent.id IS 'Identificador único do agente';
COMMENT ON COLUMN agent.name IS 'Nome do agente';
COMMENT ON COLUMN agent.api_provider IS 'Provedor da API (groq, openai, etc.)';
COMMENT ON COLUMN agent.model IS 'Modelo de IA a ser usado';
COMMENT ON COLUMN agent.summary_prompt IS 'Prompt usado para gerar resumo do documento';
COMMENT ON COLUMN agent.custom_system_prompt IS 'Prompt personalizado do sistema';
COMMENT ON COLUMN agent.pdf_filename IS 'Nome do arquivo PDF original';
COMMENT ON COLUMN agent.vectorstore_path IS 'Caminho para o vectorstore';
COMMENT ON COLUMN agent.created_at IS 'Data de criação do agente';
COMMENT ON COLUMN agent.updated_at IS 'Data da última atualização';
COMMENT ON COLUMN agent.is_active IS 'Se o agente está ativo';

-- Exemplo de dados (comentado)
-- INSERT INTO agent (id, name, api_provider, model, summary_prompt, custom_system_prompt) 
-- VALUES (
--     'example-agent-id',
--     'Agente Exemplo',
--     'groq',
--     'llama-3.1-8b-instant',
--     'Analise este documento e crie um resumo conciso dos pontos principais.',
--     'Você é um assistente especializado em análise de documentos. Responda em português brasileiro baseado no contexto fornecido.'
-- );
