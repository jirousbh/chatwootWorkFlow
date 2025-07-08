-- Tabela de campanhas
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'tag' ou 'csv'
    tag_name VARCHAR(255),     -- preenchido se type = 'tag'
    csv_file VARCHAR(255),     -- caminho do arquivo CSV, se type = 'csv'
    template_name VARCHAR(255) NOT NULL,
    scheduled_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, finished, error
    chatwoot_account_id INTEGER NOT NULL,
    chatwoot_inbox_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de contatos das campanhas
CREATE TABLE IF NOT EXISTS campaign_contacts (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(255),
    phone VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de status/envio por contato
CREATE TABLE IF NOT EXISTS campaign_status (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES campaign_contacts(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed
    message_id VARCHAR(255),
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
); 