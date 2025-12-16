-- Tabela para templates Evolution API
CREATE TABLE IF NOT EXISTS evolution_api_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb, -- Array de nomes de variáveis disponíveis
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES system_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_evolution_api_templates_name ON evolution_api_templates(name);
CREATE INDEX IF NOT EXISTS idx_evolution_api_templates_active ON evolution_api_templates(is_active);

