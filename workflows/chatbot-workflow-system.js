const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Cache para mensagens enviadas pelo bot (evitar loop)
const botSentMessages = new Map();
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const csv = require('csv-parser');
const FormData = require('form-data');
const { env } = require('process');

// ===== SISTEMA DE LOGS DUPLO =====
// Logs aparecem tanto no console (docker logs) quanto em arquivos
const logDir = path.join(__dirname, 'logs');

// Criar diretório de logs se não existir
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ===== CONFIGURAÇÕES GLOBAIS =====
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1'; // Mantido para compatibilidade

const IA_AGENT_URL = process.env.IA_AGENT_URL || 'http://ia-agent-dev:3006';
const IA_AGENT_PORT = process.env.IA_AGENT_PORT || '3006';

// Cache de contas disponíveis
let availableAccounts = [];
let accountsCacheExpiry = 0;
const ACCOUNTS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Função para obter todas as contas disponíveis
async function getAllAvailableAccounts() {
  try {
    // Verificar se o cache ainda é válido
    if (availableAccounts.length > 0 && Date.now() < accountsCacheExpiry) {
      return availableAccounts;
    }

    console.log('🔍 Buscando todas as contas disponíveis...');
    
    // Tentar diferentes endpoints para listar contas
    const endpoints = [
      '/api/v1/profile',  // Endpoint que funcionou no teste
      '/api/v1/accounts',
      '/platform/api/v1/accounts',
      '/admin/api/v1/accounts'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${CHATWOOT_BASE_URL}${endpoint}`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        let accounts = [];
        
        // Extrair contas da resposta baseado na estrutura
        if (Array.isArray(response.data)) {
          accounts = response.data;
        } else if (response.data.payload && Array.isArray(response.data.payload)) {
          accounts = response.data.payload;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          accounts = response.data.data;
        } else if (response.data.accounts && Array.isArray(response.data.accounts)) {
          // Endpoint /api/v1/profile retorna as contas em response.data.accounts
          accounts = response.data.accounts;
        }

        if (accounts.length > 0) {
          console.log(`✅ Encontradas ${accounts.length} contas via ${endpoint}`);
          availableAccounts = accounts;
          accountsCacheExpiry = Date.now() + ACCOUNTS_CACHE_DURATION;
          return accounts;
        }
      } catch (error) {
        console.log(`⚠️ Endpoint ${endpoint} não disponível: ${error.response?.status || 'CONNECTION_ERROR'}`);
      }
    }

    // Se nenhum endpoint funcionou, usar a conta padrão
    console.log('⚠️ Não foi possível listar múltiplas contas, usando conta padrão');
    availableAccounts = [{ id: CHATWOOT_ACCOUNT_ID, name: 'Conta Padrão' }];
    accountsCacheExpiry = Date.now() + ACCOUNTS_CACHE_DURATION;
    return availableAccounts;

  } catch (error) {
    console.error('❌ Erro ao obter contas disponíveis:', error);
    // Fallback para conta padrão
    availableAccounts = [{ id: CHATWOOT_ACCOUNT_ID, name: 'Conta Padrão' }];
    accountsCacheExpiry = Date.now() + ACCOUNTS_CACHE_DURATION;
    return availableAccounts;
  }
}

// Função para formatar timestamp (horário local do Brasil)
function getTimestamp() {
  const now = new Date();
  // Configurar para fuso horário do Brasil (UTC-3)
  const brazilTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  
  const year = brazilTime.getFullYear();
  const month = String(brazilTime.getMonth() + 1).padStart(2, '0');
  const day = String(brazilTime.getDate()).padStart(2, '0');
  const hours = String(brazilTime.getHours()).padStart(2, '0');
  const minutes = String(brazilTime.getMinutes()).padStart(2, '0');
  const seconds = String(brazilTime.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Salvamos o console original antes de redefinir
const originalConsole = { ...console };

// Função de log personalizada
function logger(level, message, ...args) {
  const timestamp = getTimestamp();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  // 1. Sempre enviar para console original (aparece em docker logs)
  if (level === 'error') {
    originalConsole.error(logMessage, ...args);
  } else if (level === 'warn') {
    originalConsole.warn(logMessage, ...args);
  } else {
    originalConsole.log(logMessage, ...args);
  }
  
  // 2. Salvar em arquivo para persistência
  try {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(logDir, `chatwoot-${date}.log`);
    
    let fileMessage = logMessage;
    if (args.length > 0) {
      fileMessage += ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
    }
    
    fs.appendFileSync(logFile, fileMessage + '\n');
  } catch (err) {
    originalConsole.error('❌ Erro ao escrever log em arquivo:', err.message);
  }
}

// Substituir console.log/error padrão por nossa função
console.log = (...args) => logger('info', args.join(' '));
console.error = (...args) => logger('error', args.join(' '));
console.warn = (...args) => logger('warn', args.join(' '));

// Função para logs específicos (quando quiser usar diretamente)
const log = {
  info: (message, ...args) => logger('info', message, ...args),
  error: (message, ...args) => logger('error', message, ...args),
  warn: (message, ...args) => logger('warn', message, ...args),
  debug: (message, ...args) => logger('debug', message, ...args)
};

// Função para limpar logs antigos (mais de 30 dias)
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logDir);
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < thirtyDaysAgo) {
          fs.unlinkSync(filePath);
          log.info('🗑️ Log antigo removido:', file);
        }
      }
    });
  } catch (err) {
    log.error('❌ Erro ao limpar logs antigos:', err.message);
  }
}

// Limpar logs antigos na inicialização
cleanOldLogs();

// Limpar logs antigos diariamente (a cada 24 horas)
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

// Função para limpar registros antigos de debounce de botões
async function cleanOldButtonDebounce() {
  try {
    // Limpar registros de debounce de mais de 1 hora
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    const result = await pool.query(`
      DELETE FROM button_debounce 
      WHERE processed_at < $1
    `, [oneHourAgo]);
    
    if (result.rowCount > 0) {
      console.log(`🧹 Limpeza de debounce: ${result.rowCount} registros antigos removidos`);
    }
  } catch (error) {
    console.error('❌ Erro ao limpar registros antigos de debounce:', error);
  }
}

// Limpar debounce de botões a cada 6 horas
setInterval(cleanOldButtonDebounce, 6 * 60 * 60 * 1000);

// Log de inicialização
log.info('🚀 Sistema de logs duplo inicializado');
log.info('📁 Logs salvos em:', logDir);
log.info('🐳 Logs visíveis via: docker logs chatwoot-chatbot-workflows-1');
log.info('🧹 Limpeza automática de logs antigos (>30 dias) ativada');
log.info('🔒 Sistema de debounce de botões ativado (limpeza a cada 6h)');

// ===== FIM DO SISTEMA DE LOGS =====

// Configuração do multer para upload de mídia
const mediaUpload = multer({ 
  dest: 'uploads/media/',
  limits: {
    fileSize: 16 * 1024 * 1024, // 16MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/quicktime',
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}`), false);
    }
  }
});

const app = express();

// Middleware de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "http://localhost:*", "https://localhost:*", "https://cdn.jsdelivr.net"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));

// Configurar trust proxy para rate limiting
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requests por IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip; // Usar apenas o IP, ignorando X-Forwarded-For se problemático
  }
});
app.use(limiter);

// Configurações do Chatwoot
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

// Configuração do PostgreSQL (usando o mesmo servidor postgres do Chatwoot)
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Variáveis para controle de polling
let lastMessageId = 0;
let isPolling = false;
const POLLING_INTERVAL = 5000; // 5 segundos

// Função utilitária para identificar caixas da EvolutionAPI
function isEvolutionAPIInbox(inbox) {
  return inbox.channel_type === 'Channel::Api' || 
         inbox.channel_type === 'Channel::Webhook' ||
         (inbox.name && inbox.name.toLowerCase().includes('evolution')) ||
         (inbox.name && inbox.name.toLowerCase().includes('evo')) ||
         (inbox.provider_config && inbox.provider_config.webhook_url && 
          inbox.provider_config.webhook_url.includes('evolution'));
}

// Função utilitária para identificar caixas do WhatsApp API
function isWhatsAppAPIInbox(inbox) {
  return inbox.channel_type === 'Channel::Whatsapp';
}

// Função utilitária para verificar se uma caixa é suportada
function isSupportedInbox(inbox) {
  return isWhatsAppAPIInbox(inbox) || isEvolutionAPIInbox(inbox);
}

// Cache para informações de caixas (evitar chamadas repetidas à API)
const inboxCache = new Map();

// Função para buscar informações da caixa de entrada
async function getInboxInfo(accountId, inboxId) {
  const cacheKey = `${accountId}-${inboxId}`;
  
  // Verificar cache primeiro
  if (inboxCache.has(cacheKey)) {
    return inboxCache.get(cacheKey);
  }
  
  try {
    console.log(`🔍 Buscando informações da caixa ${inboxId} da conta ${accountId}`);
    
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    
    //console.log(`🔍 Resposta da API para caixa ${inboxId}:`, JSON.stringify(response.data, null, 2));
    
    // Verificar diferentes formatos de resposta
    let inboxInfo = response.data.payload || response.data;
    
    if (!inboxInfo || !inboxInfo.name) {
      console.error(`❌ Formato de resposta inesperado para caixa ${inboxId}:`, response.data);
      return null;
    }
    
    // Cachear resultado por 10 minutos
    inboxCache.set(cacheKey, inboxInfo);
    setTimeout(() => inboxCache.delete(cacheKey), 10 * 60 * 1000);
    
    console.log(`✅ Informações da caixa ${inboxId} obtidas: ${inboxInfo.name} (${inboxInfo.channel_type})`);
    return inboxInfo;
    
  } catch (error) {
    console.error(`❌ Erro ao buscar informações da caixa ${inboxId}:`, error.message);
    if (error.response) {
      console.error(`❌ Resposta de erro:`, error.response.data);
    }
    return null;
  }
}

// Função para formatar botões como lista numerada para EvolutionAPI
function formatButtonsAsNumberedList(message, buttons) {
  if (!buttons || buttons.length === 0) {
    return message;
  }
  
  let formattedMessage = message;
  
  // Adicionar lista numerada
  formattedMessage += '\n\n';
  buttons.forEach((button, index) => {
    formattedMessage += `${index + 1} - ${button.text}\n`;
  });
  
  formattedMessage += '\n_Digite o número da opção desejada_';
  
  return formattedMessage;
}

// Função para processar resposta numérica e converter para texto do botão
function processNumericResponse(userMessage, buttons) {
  if (!buttons || buttons.length === 0) {
    return null;
  }
  
  // Remover espaços e verificar se é um número
  const cleanMessage = userMessage.trim();
  const number = parseInt(cleanMessage);
  
  // Verificar se é um número válido e está dentro do range dos botões
  if (!isNaN(number) && number >= 1 && number <= buttons.length) {
    const selectedButton = buttons[number - 1];
    console.log(`🔢 Resposta numérica detectada: ${number} -> "${selectedButton.text}"`);
    return selectedButton.text;
  }
  
  return null;
}

// Sistema sem workflows padrão - apenas fluxos configurados explicitamente por conta/caixa

// Função para detectar o bloco inicial do workflow
function getInitialBlock(workflow) {
  if (!workflow) {
    return null;
  }
  
  // Se for workflow de agente IA, não precisa de bloco inicial
  if (workflow.type === 'ai_agent') {
    return 'ai_agent'; // Retornar um identificador especial para agentes IA
  }
  
  // Para workflows estáticos, verificar se tem blocos
  if (!workflow.blocks) {
    return null;
  }
  
  // Tentar bloco_1 primeiro
  if (workflow.blocks.bloco_1) {
    return 'bloco_1';
  }
  
  // Tentar bloco_01
  if (workflow.blocks.bloco_01) {
    return 'bloco_01';
  }
  
  // Se não encontrar, procurar por padrões de bloco inicial
  const blockKeys = Object.keys(workflow.blocks);
  const initialBlockPatterns = [
    'bloco_1', 'bloco_01', 'bloco_001',
    'inicio', 'start', 'welcome', 'boas_vindas'
  ];
  
  for (const pattern of initialBlockPatterns) {
    if (blockKeys.includes(pattern)) {
      return pattern;
    }
  }
  
  // Se ainda não encontrar, retornar o primeiro bloco
  return blockKeys[0] || null;
}

// Inicializar tabelas do sistema de workflows
async function initializeDatabase() {
  try {
    console.log('🔧 Inicializando banco de dados...');
    
    // Criar tabela de usuários do sistema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        assigned_accounts JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de configurações de workflow
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_configs (
        id SERIAL PRIMARY KEY,
        workflow_name VARCHAR(255) UNIQUE NOT NULL,
        config JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de conversas do workflow
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_conversations (
        id SERIAL PRIMARY KEY,
        contact_id VARCHAR(255) NOT NULL,
        conversation_id INTEGER,
        account_id INTEGER DEFAULT 1,
        workflow_name VARCHAR(255) NOT NULL,
        current_block VARCHAR(255) NOT NULL,
        data JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'active',
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de interações do workflow
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_interactions (
        id SERIAL PRIMARY KEY,
        wf_conversation_id INTEGER NOT NULL,
        contact_id VARCHAR(255) NOT NULL,
        block_name VARCHAR(255) NOT NULL,
        user_response TEXT,
        bot_message TEXT,
        buttons JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Adicionar foreign key com ON DELETE CASCADE para workflow_interactions
    try {
      await pool.query(`
        ALTER TABLE workflow_interactions 
        ADD CONSTRAINT workflow_interactions_wf_conversation_id_fkey 
        FOREIGN KEY (wf_conversation_id) 
        REFERENCES workflow_conversations(id) 
        ON DELETE CASCADE
      `);
      console.log('✅ Foreign key com CASCADE criada para workflow_interactions');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ Foreign key workflow_interactions_wf_conversation_id_fkey já existe');
      } else {
        console.log('⚠️ Erro ao criar foreign key para workflow_interactions:', error.message);
      }
    }

    // Criar tabela de mensagens processadas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        id SERIAL PRIMARY KEY,
        message_id INTEGER UNIQUE NOT NULL,
        contact_id VARCHAR(255) NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de fluxos por caixa de entrada
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inbox_workflows (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL,
        inbox_id INTEGER NOT NULL,
        workflow_name VARCHAR(255) NOT NULL,
        workflow_config JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(account_id, inbox_id)
      )
    `);

    // Criar tabela de arquivos de mídia
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media_files (
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
      )
    `);

    // ATUALIZADA: Tabela de campanhas conforme create-campaign-tables.sql
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        tag_name VARCHAR(255),
        csv_file VARCHAR(255),
        template_name VARCHAR(255) NOT NULL,
        scheduled_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        chatwoot_account_id INTEGER NOT NULL,
        chatwoot_inbox_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // NOVA: Tabela de contatos das campanhas conforme create-campaign-tables.sql
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_contacts (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
        name VARCHAR(255),
        phone VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Criar tabela de execuções de campanhas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_executions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id),
        contact_id INTEGER NOT NULL,
        conversation_id INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        executed_at TIMESTAMP,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela para controle de round-robin de atribuição de agentes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_round_robin (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        last_assigned_agent INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id)
      )
    `);

    // NOVA: Criar tabela de controle de status do bot
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_conversation_status (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER UNIQUE NOT NULL,
        contact_id VARCHAR(255) NOT NULL,
        bot_active BOOLEAN DEFAULT true,
        paused_reason VARCHAR(255),
        paused_by VARCHAR(255),
        paused_at TIMESTAMP,
        reactivated_at TIMESTAMP,
        last_agent_check TIMESTAMP,
        has_human_agent BOOLEAN DEFAULT false,
        auto_followup_disabled BOOLEAN DEFAULT true,
        followup_disabled_by VARCHAR(255),
        followup_disabled_at TIMESTAMP,
        agent_id INTEGER,
        last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ATUALIZADA: Tabela para controle de debounce de botões conforme create-button-debounce-table.sql
    await pool.query(`
      CREATE TABLE IF NOT EXISTS button_debounce (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        contact_id VARCHAR(255) NOT NULL,
        block_id VARCHAR(255) NOT NULL,
        button_text VARCHAR(500) NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(conversation_id, block_id, button_text)
      )
    `);

    // ATUALIZADA: Tabela de status por contato conforme create-campaign-tables.sql
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_status (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES campaign_contacts(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        message_id VARCHAR(255),
        error_message TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Criar constraints únicas para evitar duplicatas (com verificação manual)
    try {
      await pool.query(`
        ALTER TABLE campaign_status 
        ADD CONSTRAINT unique_campaign_contact_status 
        UNIQUE (campaign_id, contact_id);
      `);
      console.log('✅ Constraint única criada para campaign_status');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ Constraint unique_campaign_contact_status já existe');
      } else {
        console.log('⚠️ Erro ao criar constraint para campaign_status:', error.message);
      }
    }

    try {
      await pool.query(`
        ALTER TABLE campaign_executions 
        ADD CONSTRAINT unique_campaign_contact_execution 
        UNIQUE (campaign_id, contact_id);
      `);
      console.log('✅ Constraint única criada para campaign_executions');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ Constraint unique_campaign_contact_execution já existe');
      } else {
        console.log('⚠️ Erro ao criar constraint para campaign_executions:', error.message);
      }
    }

    // Criar índices para performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bot_status_conversation 
      ON bot_conversation_status(conversation_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bot_status_contact 
      ON bot_conversation_status(contact_id);
    `);

    // Criar índices para campanhas
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_status_campaign_id 
      ON campaign_status(campaign_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_executions_campaign_id 
      ON campaign_executions(campaign_id);
    `);

    // NOVOS: Índices para button_debounce conforme create-button-debounce-table.sql
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_button_debounce_conversation_block 
      ON button_debounce(conversation_id, block_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_button_debounce_contact 
      ON button_debounce(contact_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_button_debounce_processed_at 
      ON button_debounce(processed_at);
    `);

    // NOVA: Tabela para agentes IA
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_agents (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        api_provider VARCHAR(50) DEFAULT 'groq',
        model VARCHAR(100) NOT NULL,
        summary_prompt TEXT NOT NULL,
        custom_system_prompt TEXT NOT NULL,
        pdf_filename VARCHAR(255),
        vectorstore_path VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES system_users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // NOVA: Tabela para vincular agentes IA aos workflows
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_ai_agents (
        id SERIAL PRIMARY KEY,
        workflow_name VARCHAR(255) NOT NULL,
        ai_agent_id VARCHAR(36) REFERENCES ai_agents(id) ON DELETE SET NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workflow_name)
      )
    `);

    // Migração: Alterar tipo de ID para VARCHAR se necessário
    try {
      await pool.query(`
        ALTER TABLE ai_agents 
        ALTER COLUMN id TYPE VARCHAR(36);
      `);
    } catch (error) {
      // Ignorar erro se a coluna já for VARCHAR
      console.log('Coluna ai_agents.id já é VARCHAR ou erro esperado:', error.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE workflow_ai_agents 
        ALTER COLUMN ai_agent_id TYPE VARCHAR(36);
      `);
    } catch (error) {
      // Ignorar erro se a coluna já for VARCHAR
      console.log('Coluna workflow_ai_agents.ai_agent_id já é VARCHAR ou erro esperado:', error.message);
    }

    // Criar índices para agentes IA
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_agents_active 
      ON ai_agents(is_active);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_ai_agents_workflow 
      ON workflow_ai_agents(workflow_name);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_ai_agents_agent 
      ON workflow_ai_agents(ai_agent_id);
    `);

    console.log('✅ Banco de dados inicializado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    throw error;
  }
}

// Funções de autenticação
function generateToken(payload) {
  return jwt.sign(payload, CHATWOOT_API_TOKEN, { expiresIn: '24h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, CHATWOOT_API_TOKEN);
  } catch (error) {
    return null;
  }
}

// Middleware de autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Token inválido' });
  }

  req.user = decoded;
  next();
}

// Middleware de autorização por conta
async function authorizeAccount(req, res, next) {
  try {
    const userId = req.user.id;
    const accountId = parseInt(req.params.accountId || req.body.chatwoot_account_id || req.query.accountId);
    
    // Admin tem acesso a todas as contas
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Buscar contas atribuídas ao usuário
    const result = await pool.query('SELECT assigned_accounts FROM system_users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Usuário não encontrado' });
    }
    
    const assignedAccounts = result.rows[0].assigned_accounts || [];
    
    // Verificar se o usuário tem acesso à conta
    if (!assignedAccounts.includes(accountId)) {
      return res.status(403).json({ error: 'Acesso negado para esta conta' });
    }
    
    next();
  } catch (error) {
    console.error('Erro na autorização:', error);
    res.status(500).json({ error: 'Erro interno na autorização' });
  }
}

// Função para filtrar contas baseado no perfil do usuário
async function getAuthorizedAccounts(userId, userRole) {
  if (userRole === 'admin') {
    // Admin pode ver todas as contas
    return null; // null significa sem filtro
  }
  
  // Usuário comum: apenas contas atribuídas
  const result = await pool.query('SELECT assigned_accounts FROM system_users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    return [];
  }
  
  return result.rows[0].assigned_accounts || [];
}

// Função para criar usuário inicial
async function createInitialUser() {
  try {
    const result = await pool.query('SELECT * FROM system_users WHERE username = $1', ['admin']);
    if (result.rows.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO system_users (username, password_hash, role) VALUES ($1, $2, $3)',
        ['admin', passwordHash, 'admin']
      );
      console.log('✅ Usuário admin criado com sucesso');
    }
  } catch (error) {
    console.error('Erro ao criar usuário inicial:', error);
  }
}

// Função auxiliar para obter accountId de uma conversa
async function getAccountIdForConversation(conversationId) {
  try {
    // Primeiro, tentar buscar na tabela workflow_conversations
    const conversationResult = await pool.query(
      'SELECT account_id FROM workflow_conversations WHERE conversation_id = $1',
      [conversationId]
    );
    
    if (conversationResult.rows.length > 0 && conversationResult.rows[0].account_id) {
      return conversationResult.rows[0].account_id;
    }
    
    // Se não encontrar, tentar buscar na tabela bot_conversation_status usando contact_id
    const botStatusResult = await pool.query(
      'SELECT contact_id FROM bot_conversation_status WHERE conversation_id = $1',
      [conversationId]
    );
    
    if (botStatusResult.rows.length > 0) {
      const contactId = botStatusResult.rows[0].contact_id;
      
      // Buscar na tabela workflow_conversations usando contact_id
      const contactResult = await pool.query(
        'SELECT account_id FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
        [contactId, 'active']
      );
      
      if (contactResult.rows.length > 0 && contactResult.rows[0].account_id) {
        return contactResult.rows[0].account_id;
      }
    }
    
    // Se ainda não encontrar, retornar o padrão
    return CHATWOOT_ACCOUNT_ID;
  } catch (error) {
    console.error(`❌ Erro ao buscar accountId para conversa ${conversationId}:`, error);
    return CHATWOOT_ACCOUNT_ID;
  }
}

// Função para adicionar labels ao contato no Chatwoot
async function addLabelsToContact(contactId, labels, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Garantir que todos os labels existem antes de adicioná-los
    for (const label of labels) {
      await createLabelIfNotExists(label);
    }
    
    // Buscar o ID interno do contato se necessário
    let internalId = contactId;
    if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
      console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
      const foundId = await getContactIdByPhone(contactId, accountId);
      if (foundId) {
        internalId = foundId;
        console.log(`🔄 Convertido telefone ${contactId} para ID interno: ${internalId}`);
      } else {
        console.error(`❌ Não foi possível encontrar contato para telefone: ${contactId}`);
        return;
      }
    }
    
    // Validar se temos um ID válido
    if (!internalId || internalId === contactId && typeof contactId === 'string' && contactId.startsWith('+')) {
      console.error(`❌ ID de contato inválido: ${internalId}`);
      return;
    }
    
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${internalId}/labels`,
      { labels },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    console.log(`✅ Labels [${labels.join(', ')}] adicionadas ao contato ${internalId}`);
  } catch (error) {
    console.error('❌ Erro ao adicionar labels ao contato:', JSON.stringify(error.response?.data) || error.message);
    
    // Log adicional para debug
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   URL: ${error.config?.url}`);
      console.error(`   ContactId original: ${contactId}`);
    }
  }
}

// Função para remover todos os labels do contato no Chatwoot
async function removeAllLabelsFromContact(contactId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    console.log(`🧹 Iniciando remoção de labels para contactId: ${contactId}`);
    
    // Buscar o ID interno do contato se necessário
    let internalId = contactId;
    
    // Se contactId parece ser um número de telefone, buscar o ID interno
    if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
      console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
      const foundId = await getContactIdByPhone(contactId, accountId);
      if (foundId) {
        internalId = foundId;
        console.log(`🔄 Convertido telefone ${contactId} para ID interno: ${internalId}`);
      } else {
        console.error(`❌ Não foi possível encontrar contato para telefone: ${contactId}`);
        return;
      }
    }

    // Validar se temos um ID válido
    if (!internalId || internalId === contactId && typeof contactId === 'string' && contactId.startsWith('+')) {
      console.error(`❌ ID de contato inválido ou não encontrado: ${internalId}`);
      return;
    }

    console.log(`📋 Buscando labels atuais do contato ID: ${internalId}`);

    // Primeiro, buscar todos os labels atuais do contato
    const labelsResponse = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${internalId}/labels`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    const currentLabels = labelsResponse.data.payload || [];
    
    if (currentLabels.length === 0) {
      console.log(`ℹ️ Contato ${internalId} não possui labels para remover`);
      return;
    }

    console.log(`🏷️ Contato possui ${currentLabels.length} labels: [${currentLabels.join(', ')}]`);

    // Remover todos os labels definindo uma lista vazia
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${internalId}/labels`,
      { labels: [] },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    console.log(`✅ Todos os labels removidos do contato ${internalId} (${currentLabels.length} labels removidos)`);
  } catch (error) {
    console.error('❌ Erro ao remover labels do contato:', error.response?.data || error.message);
    
    // Log adicional para debug
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   URL: ${error.config?.url}`);
      console.error(`   ContactId original: ${contactId}`);
    }
  }
}

// Função para atribuir conversa a um agente
async function assignConversationToAgent(conversationId, agentId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Validar parâmetros
    if (!conversationId) {
      console.log('⚠️ ConversationId inválido, pulando atribuição de agente');
      return;
    }
    
    if (!agentId) {
      console.log('⚠️ AgentId inválido, pulando atribuição de agente');
      return;
    }
    
    console.log(`🔍 Tentando atribuir conversa ${conversationId} ao agente ${agentId}`);
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando atribuição de agente`);
      return;
    }
    
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
      { assignee_id: agentId },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    console.log(`✅ Conversa ${conversationId} atribuída ao agente ${agentId}`);
  } catch (error) {
    console.error(`❌ Erro ao atribuir conversa ${conversationId} ao agente ${agentId}:`, error.response?.data || error.message);
  }
}

// Função para atribuir conversa a um time (sem atribuir a agente específico)
async function assignConversationToTeam(conversationId, teamId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Validar parâmetros
    if (!conversationId) {
      console.log('⚠️ ConversationId inválido, pulando atribuição de time');
      return;
    }
    
    if (!teamId) {
      console.log('⚠️ TeamId inválido, pulando atribuição de time');
      return;
    }
    
    console.log(`🔍 Tentando atribuir conversa ${conversationId} ao time ${teamId} (sem agente específico)`);
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId, accountId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando atribuição de time`);
      return;
    }
    
    // Primeiro, atribuir ao time
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
      { team_id: teamId },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    // Depois, remover a atribuição de agente específico (definir assignee_id como null)
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
      { assignee_id: null },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    console.log(`✅ Conversa ${conversationId} atribuída ao time ${teamId} (sem agente específico)`);
  } catch (error) {
    console.error(`❌ Erro ao atribuir conversa ${conversationId} ao time ${teamId}:`, error.response?.data || error.message);
  }
}

// Função para atribuir conversa apenas ao time (sem agente específico) - versão alternativa
async function assignConversationToTeamOnly(conversationId, teamId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Validar parâmetros
    if (!conversationId) {
      console.log('⚠️ ConversationId inválido, pulando atribuição de time');
      return;
    }
    
    if (!teamId) {
      console.log('⚠️ TeamId inválido, pulando atribuição de time');
      return;
    }
    
    console.log(`🔍 Tentando atribuir conversa ${conversationId} apenas ao time ${teamId}`);
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId, accountId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando atribuição de time`);
      return;
    }
    
    // Atribuir ao time e remover agente em uma única operação
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
      { 
        team_id: teamId,
        assignee_id: null 
      },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    console.log(`✅ Conversa ${conversationId} atribuída apenas ao time ${teamId}`);
  } catch (error) {
    console.error(`❌ Erro ao atribuir conversa ${conversationId} ao time ${teamId}:`, error.response?.data || error.message);
  }
}

// Função para atribuir conversa a um membro específico do time (não-administrador)
async function assignConversationToTeamMember(conversationId, teamId, options = {}, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Validar parâmetros
    if (!conversationId) {
      console.log('⚠️ ConversationId inválido, pulando atribuição de membro do time');
      return;
    }
    
    if (!teamId) {
      console.log('⚠️ TeamId inválido, pulando atribuição de membro do time');
      return;
    }
    
    console.log(`🔍 Tentando atribuir conversa ${conversationId} a um membro do time ${teamId}`);
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId, accountId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando atribuição de membro do time`);
      return;
    }

    // Buscar agentes específicos do time usando o endpoint correto
    const teamAgents = await getChatwootTeamAgents(teamId, accountId);
    
    // Filtrar apenas agentes não-administradores
    const teamMembers = teamAgents.filter(agent => {
      return agent.role !== 'administrator';
    });

    if (teamMembers.length === 0) {
      console.log(`⚠️ Nenhum agente encontrado no time ${teamId} (não-administradores)`);
      
      // Se não houver agentes disponíveis, atribuir ao time
      console.log(`🔄 Atribuindo conversa ao time ${teamId} (sem agente específico)`);
      await assignConversationToTeam(conversationId, teamId, accountId);
      return;
    }

    let selectedAgent;

    // Estratégia de seleção de agente
    const strategy = options.strategy || 'least_busy'; // 'round_robin', 'least_busy', 'random'
    
    switch (strategy) {
      case 'least_busy':
        // Selecionar agente com menos conversas ativas
        selectedAgent = await selectLeastBusyAgent(teamMembers, accountId);
        break;
        
      case 'random':
        // Seleção aleatória
        selectedAgent = teamMembers[Math.floor(Math.random() * teamMembers.length)];
        break;
        
      case 'round_robin':
      default:
        // Round-robin (rotação)
        selectedAgent = await selectNextAgentInRoundRobin(teamMembers, teamId, accountId);
        break;
    }

    if (!selectedAgent) {
      console.log(`⚠️ Não foi possível selecionar um agente, atribuindo ao time ${teamId}`);
      await assignConversationToTeam(conversationId, teamId, accountId);
      return;
    }

    // Atribuir conversa ao agente selecionado
    await assignConversationToAgent(conversationId, selectedAgent.id, accountId);
    
    console.log(`✅ Conversa ${conversationId} atribuída ao agente ${selectedAgent.name} (${selectedAgent.id}) do time ${teamId}`);
    
  } catch (error) {
    console.error(`❌ Erro ao atribuir conversa ${conversationId} a membro do time ${teamId}:`, error.response?.data || error.message);
    
    // Em caso de erro, tentar atribuir ao time como fallback
    try {
      console.log(`🔄 Fallback: atribuindo conversa ao time ${teamId}`);
      await assignConversationToTeam(conversationId, teamId, accountId);
    } catch (fallbackError) {
      console.error(`❌ Erro no fallback ao atribuir ao time:`, fallbackError.response?.data || fallbackError.message);
    }
  }
}

// Função para atribuir conversa a um agente disponível
async function assignConversationToAvailableAgent(conversationId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    console.log(`🔍 Tentando encontrar agente disponível para conversa ${conversationId}`);
    
    // Buscar agentes disponíveis na conta
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/agents`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    if (!response.data || !response.data.data || !Array.isArray(response.data.data.payload)) {
      console.log(`⚠️ Nenhum agente encontrado na conta ${accountId}`);
      return;
    }
    
    const agents = response.data.data.payload;
    console.log(`👥 Encontrados ${agents.length} agentes na conta ${accountId}`);
    
    // Buscar primeiro agente disponível (status: available)
    const availableAgent = agents.find(agent => 
      agent.availability_status === 'available' || 
      agent.availability_status === 'online'
    );
    
    if (availableAgent) {
      console.log(`✅ Agente disponível encontrado: ${availableAgent.name} (ID: ${availableAgent.id})`);
      await assignConversationToAgent(conversationId, availableAgent.id, accountId);
    } else {
      console.log(`⚠️ Nenhum agente disponível encontrado, conversa ficará sem atribuição`);
      // Opcional: atribuir a um time padrão se configurado
      // await assignConversationToTeam(conversationId, DEFAULT_TEAM_ID, accountId);
    }
    
  } catch (error) {
    console.error(`❌ Erro ao buscar agente disponível para conversa ${conversationId}:`, error.response?.data || error.message);
  }
}

// Função para selecionar o próximo agente no round-robin
async function selectNextAgentInRoundRobin(teamMembers, teamId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Buscar o último agente usado para este time no banco de dados
    const result = await pool.query(
      'SELECT last_assigned_agent FROM team_round_robin WHERE team_id = $1',
      [teamId]
    );
    
    let lastAgentIndex = -1;
    
    if (result.rows.length > 0) {
      const lastAgentId = result.rows[0].last_assigned_agent;
      lastAgentIndex = teamMembers.findIndex(agent => agent.id === lastAgentId);
    }
    
    // Selecionar o próximo agente
    const nextIndex = (lastAgentIndex + 1) % teamMembers.length;
    const selectedAgent = teamMembers[nextIndex];
    
    // Atualizar o banco de dados com o agente selecionado
    await pool.query(
      `INSERT INTO team_round_robin (team_id, last_assigned_agent, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP) 
       ON CONFLICT (team_id) 
       DO UPDATE SET last_assigned_agent = $2, updated_at = CURRENT_TIMESTAMP`,
      [teamId, selectedAgent.id]
    );
    
    return selectedAgent;
    
  } catch (error) {
    console.error('Erro ao selecionar agente no round-robin:', error);
    // Em caso de erro, retornar o primeiro agente disponível
    return teamMembers[0];
  }
}

// Função para selecionar o agente menos ocupado
async function selectLeastBusyAgent(teamMembers, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Buscar conversas ativas de cada agente
    const agentWorkloads = await Promise.all(
      teamMembers.map(async (agent) => {
        try {
          const response = await axios.get(
            `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations`,
            {
              params: { assignee_id: agent.id, status: 'open' },
              headers: { 'api_access_token': CHATWOOT_API_TOKEN }
            }
          );
          
          const conversations = response.data.payload || [];
          
          return {
            agent,
            activeConversations: conversations.length
          };
        } catch (error) {
          console.error(`Erro ao buscar conversas do agente ${agent.id}:`, error);
          return { agent, activeConversations: 999 }; // Penalizar em caso de erro
        }
      })
    );
    
    // Ordenar por carga de trabalho (menos conversas primeiro)
    agentWorkloads.sort((a, b) => a.activeConversations - b.activeConversations);
    
    // Retornar o agente com menos conversas ativas
    return agentWorkloads[0]?.agent || teamMembers[0];
    
  } catch (error) {
    console.error('Erro ao selecionar agente menos ocupado:', error);
    return teamMembers[0]; // Fallback para o primeiro agente
  }
}

// Cache de labels para evitar muitas consultas à API
let labelsCache = new Map();
let labelsCacheExpiry = 0;
const LABELS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Função para obter labels existentes (com cache)
async function getExistingLabels(accountId = CHATWOOT_ACCOUNT_ID) {
  const now = Date.now();
  
  // Verificar se o cache ainda é válido
  if (labelsCache.size > 0 && now < labelsCacheExpiry) {
    return labelsCache;
  }
  
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/labels`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    const labels = response.data.payload || [];
    
    // Atualizar cache
    labelsCache.clear();
    labels.forEach(label => {
      labelsCache.set(label.title, label);
    });
    
    labelsCacheExpiry = now + LABELS_CACHE_DURATION;
    
    return labelsCache;
  } catch (error) {
    console.error('Erro ao buscar labels existentes:', error.response?.data || error.message);
    return labelsCache; // Retornar cache antigo em caso de erro
  }
}

// Função para criar label se não existir
async function createLabelIfNotExists(labelName, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Verificar cache primeiro
    const existingLabels = await getExistingLabels(accountId);
    
    if (!existingLabels.has(labelName)) {
      // Criar o label se não existir
      const response = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/labels`,
        { 
          title: labelName,
          description: `Label criado automaticamente pelo workflow: ${labelName}`,
          color: '#1f2937' // cor padrão
        },
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      // Adicionar ao cache
      labelsCache.set(labelName, response.data.payload);
      
      console.log(`✅ Label "${labelName}" criado com sucesso`);
    }
  } catch (error) {
    // Se o erro for 422 (label já existe), apenas ignorar
    if (error.response?.status === 422) {
      console.log(`ℹ️ Label "${labelName}" já existe (422)`);
      // Invalidar cache para atualizar na próxima consulta
      labelsCacheExpiry = 0;
    } else {
      console.error(`❌ Erro ao criar/verificar label "${labelName}":`, error.response?.data || error.message);
    }
  }
}

// Função para verificar se a conversa existe
async function conversationExists(conversationId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    if (!conversationId) {
      console.log('❌ ConversationId é inválido (null/undefined)');
      return false;
    }
    
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    return response.status === 200;
  } catch (error) {
    console.log(`❌ Conversa ${conversationId} não encontrada: ${error.response?.status}`);
    return false;
  }
}

// Função para adicionar etiquetas à conversa
async function addLabelsToConversation(conversationId, labels, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Validar parâmetros
    if (!conversationId) {
      console.log('⚠️ ConversationId inválido, pulando adição de etiquetas à conversa');
      return;
    }
    
    if (!labels || labels.length === 0) {
      console.log('⚠️ Nenhuma etiqueta para adicionar à conversa');
      return;
    }
    
    console.log(`🔍 Tentando adicionar etiquetas à conversa ${conversationId}: [${labels.join(', ')}]`);
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId, accountId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando adição de etiquetas`);
      return;
    }
    
    // Garantir que todos os labels existem antes de adicioná-los
    for (const label of labels) {
      await createLabelIfNotExists(label, accountId);
    }
    
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
      { labels },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    console.log(`✅ Etiquetas [${labels.join(', ')}] adicionadas à conversa ${conversationId}`);
  } catch (error) {
    console.error(`❌ Erro ao adicionar etiquetas à conversa ${conversationId}:`, error.response?.data || error.message);
    
    // Log adicional para debug
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   URL: ${error.config?.url}`);
      console.error(`   Data enviada:`, { labels });
    }
  }
}

// Função para remover todos os labels da conversa no Chatwoot
async function removeAllLabelsFromConversation(conversationId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    console.log(`🧹 Iniciando remoção de labels da conversa: ${conversationId}`);
    
    // Validar parâmetros
    if (!conversationId) {
      console.log('⚠️ ConversationId inválido, pulando remoção de etiquetas da conversa');
      return;
    }
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId, accountId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando remoção de etiquetas`);
      return;
    }
    
    console.log(`📋 Buscando labels atuais da conversa: ${conversationId}`);
    
    // Primeiro, buscar dados da conversa para ver os labels atuais
    let currentLabels = [];
    try {
      const conversationResponse = await axios.get(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}`,
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      // Os labels podem estar em diferentes lugares da resposta
      const conversationData = conversationResponse.data;
      if (conversationData.labels) {
        currentLabels = conversationData.labels;
      } else if (conversationData.payload && conversationData.payload.labels) {
        currentLabels = conversationData.payload.labels;
      } else if (conversationData.meta && conversationData.meta.labels) {
        currentLabels = conversationData.meta.labels;
      }
      
      console.log(`🏷️ Labels atuais da conversa: [${currentLabels.join(', ')}]`);
    } catch (fetchError) {
      console.log(`⚠️ Não foi possível buscar labels atuais da conversa ${conversationId}, tentando remoção direta`);
    }
    
    if (currentLabels.length === 0) {
      console.log(`ℹ️ Conversa ${conversationId} não possui labels para remover`);
      return;
    }
    
    // Remover todos os labels definindo uma lista vazia
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
      { labels: [] },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    console.log(`✅ Todos os labels removidos da conversa ${conversationId} (${currentLabels.length} labels removidos)`);
  } catch (error) {
    console.error(`❌ Erro ao remover labels da conversa ${conversationId}:`, error.response?.data || error.message);
    
    // Log adicional para debug
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   URL: ${error.config?.url}`);
    }
  }
}

// Função para buscar agentes de um time específico
async function getChatwootTeamAgents(teamId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/teams/${teamId}/team_members`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    return response.data || [];
  } catch (error) {
    console.error('Erro ao buscar agentes do time:', error.response?.data || error.message);
    return [];
  }
}

// Função para buscar agentes disponíveis
async function getChatwootAgents(accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/agents`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    return response.data.payload || [];
  } catch (error) {
    console.error('Erro ao buscar agentes:', error.response?.data || error.message);
    return [];
  }
}

// Função para buscar times disponíveis
async function getChatwootTeams(accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/teams`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    return response.data.payload || [];
  } catch (error) {
    console.error('Erro ao buscar times:', error.response?.data || error.message);
    return [];
  }
}

// Classe para gerenciar conversas com PostgreSQL
class ConversationManager {
  constructor() {
    this.workflows = new Map();
    this.loadWorkflows();
  }

  // Carregar workflows do banco de dados
  async loadWorkflows() {
    try {
      // Carregar apenas workflows salvos no banco (sem padrões)
      await this.loadWorkflowsFromDatabase();
    } catch (error) {
      console.error('Erro ao carregar workflows:', error);
    }
  }

  // Carregar todos os workflows do banco de dados
  async loadWorkflowsFromDatabase() {
    try {
      console.log('🔍 Carregando workflows salvos no banco de dados...');
      
      // Buscar em workflow_configs (apenas ativos)
      const configResult = await pool.query('SELECT workflow_name, config FROM workflow_configs WHERE is_active = true');
      
      // Buscar em inbox_workflows (apenas ativos)
      const inboxResult = await pool.query('SELECT DISTINCT workflow_name, workflow_config FROM inbox_workflows WHERE is_active = true');
      
      let loadedCount = 0;
      
      // Processar workflows de workflow_configs
      for (const row of configResult.rows) {
        const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
        this.workflows.set(row.workflow_name, config);
        loadedCount++;
        console.log(`✅ Workflow carregado do banco: ${row.workflow_name}`);
      }
      
      // Processar workflows de inbox_workflows (evitar duplicatas)
      for (const row of inboxResult.rows) {
        if (!this.workflows.has(row.workflow_name)) {
          const config = typeof row.workflow_config === 'string' ? JSON.parse(row.workflow_config) : row.workflow_config;
          this.workflows.set(row.workflow_name, config);
          loadedCount++;
          console.log(`✅ Workflow carregado do banco (inbox): ${row.workflow_name}`);
        }
      }
      
      console.log(`📊 Total de workflows carregados do banco: ${loadedCount}`);
      console.log(`📊 Total de workflows no cache: ${this.workflows.size}`);
      
    } catch (error) {
      console.error('❌ Erro ao carregar workflows do banco:', error);
    }
  }

  // Carregar workflow específico do banco de dados
  async loadWorkflowFromDatabase(workflowName) {
    try {
      console.log(`🔍 Buscando workflow '${workflowName}' no banco de dados...`);
      
      // Primeiro tentar buscar por nome exato (apenas ativos)
      let result = await pool.query(
        'SELECT * FROM workflow_configs WHERE workflow_name = $1 AND is_active = true',
        [workflowName]
      );
      
      // Se não encontrar, tentar buscar em inbox_workflows (apenas ativos)
      if (result.rows.length === 0) {
        console.log(`🔍 Não encontrado em workflow_configs, buscando em inbox_workflows...`);
        result = await pool.query(
          'SELECT workflow_name, workflow_config as config FROM inbox_workflows WHERE workflow_name = $1 AND is_active = true',
          [workflowName]
        );
      }
      
      if (result.rows.length > 0) {
        const workflowData = result.rows[0];
        const config = typeof workflowData.config === 'string' 
          ? JSON.parse(workflowData.config) 
          : workflowData.config;
        
        console.log(`✅ Workflow '${workflowName}' encontrado no banco, adicionando ao cache`);
        
        // Adicionar ao cache para futuras consultas
        this.workflows.set(workflowName, config);
        
        return config;
      }
      
      console.log(`❌ Workflow '${workflowName}' não encontrado no banco de dados`);
      return null;
    } catch (error) {
      console.error(`❌ Erro ao buscar workflow '${workflowName}' no banco:`, error);
      return null;
    }
  }

  // Salvar workflow no banco
  async saveWorkflow(name, config) {
    try {
      await pool.query(
        'INSERT INTO workflow_configs (workflow_name, config) VALUES ($1, $2) ON CONFLICT (workflow_name) DO UPDATE SET config = $2, updated_at = CURRENT_TIMESTAMP',
        [name, config]
      );
      
      // Adicionar/atualizar no cache
      this.workflows.set(name, config);
      console.log(`✅ Workflow '${name}' salvo no banco e cache atualizado`);
    } catch (error) {
      console.error('Erro ao salvar workflow:', error);
    }
  }

  // Iniciar nova conversa
  async startConversation(contactId, workflowName, initialData = {}, accountId = CHATWOOT_ACCOUNT_ID) {
    try {
      let workflow = this.workflows.get(workflowName);
      
      // Se não encontrar o workflow, tentar buscar no banco de dados
      if (!workflow) {
        console.log(`🔍 Workflow '${workflowName}' não encontrado no cache, buscando no banco...`);
        workflow = await this.loadWorkflowFromDatabase(workflowName);
        
        if (!workflow) {
          throw new Error(`Workflow ${workflowName} não encontrado nem no cache nem no banco`);
        }
      }

      // Buscar nome do contato se não estiver em initialData
      if (!initialData.nome) {
        initialData.nome = await getContactName(contactId, null, accountId);
      }
      console.log("Nome do contato:", initialData.nome);

      // Verificar se já existe uma conversa ativa
      const existingResult = await pool.query(
        'SELECT * FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
        [contactId, 'active']
      );

      // Carregar workflow para determinar o bloco inicial
      const workflowConfig = await this.loadWorkflowFromDatabase(workflowName);
      const initialBlock = getInitialBlock(workflowConfig);
      
      if (!initialBlock) {
        throw new Error(`Não foi possível determinar o bloco inicial para o workflow '${workflowName}'`);
      }
      
      // Para workflows de agente IA, usar um bloco especial
      const blockToUse = initialBlock === 'ai_agent' ? 'ai_agent_start' : initialBlock;
      
      if (existingResult.rows.length > 0) {
        // Atualizar conversa existente
        await pool.query(
          'UPDATE workflow_conversations SET workflow_name = $1, current_block = $2, data = $3, account_id = $4, conversation_id = $5, last_activity = CURRENT_TIMESTAMP WHERE id = $6',
          [workflowName, blockToUse, JSON.stringify(initialData), accountId, initialData.conversation_id || null, existingResult.rows[0].id]
        );
        return existingResult.rows[0];
      }

      // Criar nova conversa
      const result = await pool.query(
        'INSERT INTO workflow_conversations (contact_id, workflow_name, current_block, data, account_id, conversation_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [contactId, workflowName, blockToUse, JSON.stringify(initialData), accountId, initialData.conversation_id || null]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Erro ao iniciar conversa:', error);
      throw error;
    }
  }

  // Obter conversa atual
  async getConversation(contactId) {
    try {
      const result = await pool.query(
        'SELECT * FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
        [contactId, 'active']
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao obter conversa:', error);
      return null;
    }
  }

  // Processar resposta do usuário
  async processResponse(contactId, userResponse, accountId = CHATWOOT_ACCOUNT_ID) {
    try {
      const conversation = await this.getConversation(contactId);
      if (!conversation) return null;

      // Declarar conversationId no início do método para evitar erro de inicialização
      const conversationId = conversation.data?.conversation_id || conversation.conversation_id;

      let workflow = this.workflows.get(conversation.workflow_name);
      
      // Se não encontrar o workflow, tentar buscar no banco de dados
      if (!workflow) {
        console.log(`🔍 Workflow '${conversation.workflow_name}' não encontrado no cache, buscando no banco...`);
        workflow = await this.loadWorkflowFromDatabase(conversation.workflow_name);
        
        if (!workflow) {
          console.error(`❌ Workflow '${conversation.workflow_name}' não encontrado nem no cache nem no banco!`);
          return null;
        }
      }

      const currentBlock = workflow.blocks[conversation.current_block];
      if (!currentBlock) return null;

      // Garantir que o nome está sempre presente no data
      let data = conversation.data;
      if (typeof data === 'string') data = JSON.parse(data);
      if (!data.nome) {
        data.nome = await getContactName(contactId, null, accountId);
      }

      const button = Array.isArray(currentBlock.buttons)
        ? currentBlock.buttons.find(btn => 
            btn.text.toLowerCase() === userResponse.toLowerCase() ||
            btn.text.includes(userResponse)
          )
        : null;

      if (button) {
        // ===== VERIFICAÇÃO DE DEBOUNCE DE BOTÃO =====
        const isRecentlyProcessed = await isButtonRecentlyProcessed(conversationId, conversation.current_block, button.text);
        if (isRecentlyProcessed) {
          console.log(`🚫 Botão "${button.text}" já foi processado recentemente para o bloco ${conversation.current_block}. Ignorando clique duplicado.`);
          return { 
            type: 'duplicate_button', 
            message: `Botão "${button.text}" já foi processado. Aguarde um momento antes de clicar novamente.` 
          };
        }

        // Marcar botão como processado para evitar cliques duplicados
        await markButtonAsProcessed(conversationId, contactId, conversation.current_block, button.text);
        
        console.log(`✅ Processando botão "${button.text}" para o bloco ${conversation.current_block}`);

        // Salvar interação no histórico
        await this.saveInteraction(conversation.id, contactId, conversation.current_block, userResponse, currentBlock.message, currentBlock.buttons);

        // Aplicar tag se especificada
        if (button.tag) {
          await this.applyTag(contactId, button.tag, accountId);
          // Adicionar label: tag - texto do botão
          await addLabelsToContact(contactId, [`${button.tag} - ${button.text}`], accountId);
        }

        // Aplicar atribuições do botão
        console.log(`🔍 Debug - conversation.conversation_id: ${conversation.conversation_id}, conversation.data.conversation_id: ${conversation.data?.conversation_id}, usando: ${conversationId}`);
        await this.processButtonActions(button, conversationId, contactId, accountId);

                    // Mover para próximo bloco
            if (button.next_block === 'finalizar') {
              await this.finalizeConversation(contactId);
              return { type: 'finalized', message: 'Conversa finalizada. Obrigado!' };
            } else {
              const nextBlock = workflow.blocks[button.next_block];
              if (nextBlock) {
                // ===== RESET DE DEBOUNCE AO NAVEGAR ENTRE BLOCOS =====
                await resetButtonDebounceForBlock(conversationId, button.next_block);
                
                // NOVA LÓGICA: Verificar se é bloco de atendimento humano
                if (nextBlock.id === 'atendimento_humano' || nextBlock.name?.toLowerCase().includes('atendimento')) {
                  console.log(`👤 Bloco de atendimento humano detectado: ${nextBlock.name || nextBlock.id}`);
                  // Pausar o bot automaticamente
                  await pauseBotForConversation(conversationId, contactId, 'human_handoff', 'system');
                }
                
                // Aplicar ações do próximo bloco
                await this.processBlockActions(nextBlock, conversationId, contactId, accountId);
                
                // Atualizar o campo data com o nome
                await pool.query(
                  'UPDATE workflow_conversations SET current_block = $1, last_activity = CURRENT_TIMESTAMP, data = $2 WHERE id = $3',
                  [button.next_block, JSON.stringify(data), conversation.id]
                );
                return {
                  type: 'next_block',
                  block: nextBlock,
                  message: this.processMessage(nextBlock.message, data)
                };
              }
            }
      } else {
        // Se não houver botões, avançar automaticamente para o next_block
        await this.saveInteraction(conversation.id, contactId, conversation.current_block, userResponse, currentBlock.message, []);
        // Aplicar tag se houver
        if (currentBlock.tag) {
          await this.applyTag(contactId, currentBlock.tag, accountId);
          // Adicionar label: tag - resposta do usuário
          await addLabelsToContact(contactId, [`${currentBlock.tag} - ${userResponse}`], accountId);
        }
        
        // Aplicar ações do bloco atual
        await this.processBlockActions(currentBlock, conversationId, contactId, accountId);
        
        // Avançar para o next_block se existir
        if (currentBlock.next_block) {
          const nextBlock = workflow.blocks[currentBlock.next_block];
          if (nextBlock) {
            // ===== RESET DE DEBOUNCE AO AVANÇAR AUTOMATICAMENTE =====
            await resetButtonDebounceForBlock(conversationId, currentBlock.next_block);
            
            // Aplicar ações do próximo bloco
            await this.processBlockActions(nextBlock, conversationId, contactId, accountId);
            
            // Atualizar o campo data com o nome
            await pool.query(
              'UPDATE workflow_conversations SET current_block = $1, last_activity = CURRENT_TIMESTAMP, data = $2 WHERE id = $3',
              [currentBlock.next_block, JSON.stringify(data), conversation.id]
            );
            return {
              type: 'next_block',
              block: nextBlock,
              message: this.processMessage(nextBlock.message, data)
            };
          }
        }
      }

      return { 
        type: 'invalid_response', 
        message: `Ops! Não entendi sua resposta. ${currentBlock.message}` 
      };
    } catch (error) {
      console.error('Erro ao processar resposta:', error);
      return { type: 'error', message: 'Erro interno do sistema' };
    }
  }

  // Salvar interação no histórico
  async saveInteraction(conversationId, contactId, blockName, userResponse, botMessage, buttons) {
    try {
      await pool.query(
        'INSERT INTO workflow_interactions (wf_conversation_id, contact_id, block_name, user_response, bot_message, buttons) VALUES ($1, $2, $3, $4, $5, $6)',
        [conversationId, contactId, blockName, userResponse, botMessage, JSON.stringify(buttons)]
      );
    } catch (error) {
      console.error('Erro ao salvar interação:', error);
    }
  }

  // Processar mensagem com variáveis
  processMessage(message, data) {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    console.log('🔧 Processando mensagem:', message);
    console.log('🔧 Dados disponíveis:', JSON.stringify(data, null, 2));
    
    const processedMessage = message.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = data[key];
      console.log(`🔧 Substituindo ${match} por ${value || 'NÃO ENCONTRADO'}`);
      return value || match;
    });
    
    console.log('🔧 Mensagem processada:', processedMessage);
    return processedMessage;
  }

  // Aplicar tag ao contato
  async applyTag(contactId, tag, accountId = CHATWOOT_ACCOUNT_ID) {
    try {
      console.log(`🏷️ Aplicando tag "${tag}" ao contactId: ${contactId}`);
      
      // Garantir que o label existe antes de aplicá-lo
      await createLabelIfNotExists(tag);
      
      // Buscar o ID interno do contato se necessário
      let internalId = contactId;
      if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
        console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
        const foundId = await getContactIdByPhone(contactId, accountId);
        if (foundId) {
          internalId = foundId;
          console.log(`🔄 Convertido telefone ${contactId} para ID interno: ${internalId}`);
        } else {
          console.error(`❌ Não foi possível encontrar contato para telefone: ${contactId}`);
          return;
        }
      }
      
      // Validar se temos um ID válido
      if (!internalId || internalId === contactId && typeof contactId === 'string' && contactId.startsWith('+')) {
        console.error(`❌ ID de contato inválido: ${internalId}`);
        return;
      }
      
      // Primeiro, obter labels existentes
      const existingLabelsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${internalId}/labels`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN
        }
      });
      
      const existingLabels = existingLabelsResponse.data.payload || [];
      
      // Adicionar nova label se não existir
      if (!existingLabels.includes(tag)) {
        const updatedLabels = [...existingLabels, tag];
        
        await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${internalId}/labels`, {
          labels: updatedLabels
        }, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`✅ Tag "${tag}" aplicada ao contato ${internalId}`);
      } else {
        console.log(`ℹ️ Tag "${tag}" já existe no contato ${internalId}`);
      }
    } catch (error) {
      console.error('❌ Erro ao aplicar tag:', error.response?.data || error.message);
      
      // Log adicional para debug
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   URL: ${error.config?.url}`);
        console.error(`   ContactId original: ${contactId}`);
      }
    }
  }

  // Processar ações do botão (atribuições, etiquetas, etc.)
  async processButtonActions(button, conversationId, contactId, accountId = CHATWOOT_ACCOUNT_ID) {
    try {
      console.log(`🔧 Processando ações do botão "${button.text}" - ConversationId: ${conversationId}, ContactId: ${contactId}`);
      
      // Atribuir agente se especificado
      if (button.assign_agent) {
        console.log(`🔧 Botão solicita atribuição de agente: ${button.assign_agent}`);
        await assignConversationToAgent(conversationId, button.assign_agent, accountId);
      }

      // Atribuir time se especificado
      if (button.assign_team) {
        console.log(`🔧 Botão solicita atribuição de time: ${button.assign_team}`);
        
        // Verificar se deve atribuir a um membro específico do time
        if (button.assign_team_member === true) {
          const options = {
            strategy: button.assignment_strategy || 'least_busy' // 'round_robin', 'least_busy', 'random'
          };
          await assignConversationToTeamMember(conversationId, button.assign_team, options, accountId);
        } else {
          await assignConversationToTeam(conversationId, button.assign_team, accountId);
        }
      }

      // Adicionar etiquetas se especificadas
      if (button.assign_labels && Array.isArray(button.assign_labels)) {
        console.log(`🔧 Botão solicita etiquetas na conversa: [${button.assign_labels.join(', ')}]`);
        await addLabelsToConversation(conversationId, button.assign_labels, accountId);
      }

      // Adicionar etiquetas ao contato se especificadas
      if (button.contact_labels && Array.isArray(button.contact_labels)) {
        console.log(`🔧 Botão solicita etiquetas no contato: [${button.contact_labels.join(', ')}]`);
        await addLabelsToContact(contactId, button.contact_labels, accountId);
      }

      // Pausar bot se solicitado no botão
      if (button.pause_bot === true) {
        console.log(`⏸️ Botão "${button.text}" solicita pausa do bot - pausando automaticamente`);
        await pauseBotForConversation(conversationId, contactId, 'button_action', 'system');
      }

      // Processar auto_followup baseado no botão
      if (button.auto_followup_disabled === true) {
        console.log(`🚫 Botão "${button.text}" solicita desativação do auto_followup - desativando automaticamente`);
        await disableAutoFollowupForConversation(conversationId, contactId, 'button_action');
      } else if (button.auto_followup_disabled === false) {
        console.log(`✅ Botão "${button.text}" solicita ativação do auto_followup - ativando automaticamente`);
        await enableAutoFollowupForConversation(conversationId, contactId, 'button_action');
      }
    } catch (error) {
      console.error(`❌ Erro ao processar ações do botão "${button.text}":`, error);
    }
  }

  // Processar ações do bloco (atribuições, etiquetas, etc.)
  async processBlockActions(block, conversationId, contactId, accountId = CHATWOOT_ACCOUNT_ID) {
    try {
      console.log(`🔧 Processando ações do bloco "${block.name || block.id}" - ConversationId: ${conversationId}, ContactId: ${contactId}`);
      
      // Atribuir agente se especificado
      if (block.assign_agent) {
        console.log(`🔧 Bloco solicita atribuição de agente: ${block.assign_agent}`);
        await assignConversationToAgent(conversationId, block.assign_agent, accountId);
      }

      // Atribuir time se especificado
      if (block.assign_team) {
        console.log(`🔧 Bloco solicita atribuição de time: ${block.assign_team}`);
        
        // Verificar se deve atribuir a um membro específico do time
        if (block.assign_team_member === true) {
          const options = {
            strategy: block.assignment_strategy || 'least_busy' // 'round_robin', 'least_busy', 'random'
          };
          await assignConversationToTeamMember(conversationId, block.assign_team, options, accountId);
        } else {
          await assignConversationToTeam(conversationId, block.assign_team, accountId);
        }
      }

      // Adicionar etiquetas se especificadas
      if (block.assign_labels && Array.isArray(block.assign_labels)) {
        console.log(`🔧 Bloco solicita etiquetas na conversa: [${block.assign_labels.join(', ')}]`);
        await addLabelsToConversation(conversationId, block.assign_labels, accountId);
      }

      // Adicionar etiquetas ao contato se especificadas
      if (block.contact_labels && Array.isArray(block.contact_labels)) {
        console.log(`🔧 Bloco solicita etiquetas no contato: [${block.contact_labels.join(', ')}]`);
        await addLabelsToContact(contactId, block.contact_labels, accountId);
      }

      // Pausar bot se solicitado no bloco
      if (block.pause_bot === true) {
        console.log(`⏸️ Bloco "${block.name || block.id}" solicita pausa do bot - pausando automaticamente`);
        await pauseBotForConversation(conversationId, contactId, 'sector_transfer', 'system');
      }

      // Desativar auto_followup se solicitado no bloco
      if (block.auto_followup_disabled === true) {
        console.log(`🚫 Bloco "${block.name || block.id}" solicita desativação do auto_followup - desativando automaticamente`);
        await disableAutoFollowupForConversation(conversationId, contactId);
      } else if (block.auto_followup_disabled === false) {
        console.log(`✅ Bloco "${block.name || block.id}" solicita ativação do auto_followup - ativando automaticamente`);
        await enableAutoFollowupForConversation(conversationId, contactId, 'block_action');
      }
    } catch (error) {
      console.error(`❌ Erro ao processar ações do bloco "${block.name || block.id}":`, error);
    }
  }

  // Finalizar conversa
  async finalizeConversation(contactId) {
    try {
      await pool.query(
        'UPDATE workflow_conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE contact_id = $2 AND status = $3',
        ['completed', contactId, 'active']
      );
      
      // Limpar registros de debounce para este contato
      await pool.query('DELETE FROM button_debounce WHERE contact_id = $1', [contactId]);
      
      console.log(`✅ Conversa finalizada para ${contactId} (debounce limpo)`);
    } catch (error) {
      console.error('Erro ao finalizar conversa:', error);
    }
  }

  // Obter estatísticas
  async getStats() {
    try {
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_conversations,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_conversations,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_conversations,
          AVG(EXTRACT(EPOCH FROM (updated_at - start_time))/60) as avg_duration_minutes
        FROM workflow_conversations
      `);
      return stats.rows[0];
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      return null;
    }
  }
}

// Classe para gerenciar fluxos por caixa de entrada
class InboxWorkflowManager {
  // Salvar fluxo para uma caixa de entrada específica
  async saveInboxWorkflow(accountId, inboxId, workflowName, workflowConfig) {
    try {
      console.log('💾 Salvando fluxo no banco:', { accountId, inboxId, workflowName });
      
      await pool.query(
        `INSERT INTO inbox_workflows (account_id, inbox_id, workflow_name, workflow_config, is_active) 
         VALUES ($1, $2, $3, $4, true) 
         ON CONFLICT (account_id, inbox_id) 
         DO UPDATE SET workflow_name = $3, workflow_config = $4, is_active = true, updated_at = CURRENT_TIMESTAMP`,
        [accountId, inboxId, workflowName, workflowConfig]
      );
      
      // Adicionar também ao cache global do conversationManager
      if (conversationManager) {
        conversationManager.workflows.set(workflowName, workflowConfig);
        console.log(`✅ Workflow '${workflowName}' adicionado ao cache global`);
      }
      
      console.log('✅ Fluxo salvo com sucesso no banco');
      return { success: true, message: 'Fluxo salvo com sucesso' };
    } catch (error) {
      console.error('❌ Erro ao salvar fluxo da caixa de entrada:', error);
      return { success: false, error: error.message };
    }
  }

  // Obter fluxo de uma caixa de entrada específica
  async getInboxWorkflow(accountId, inboxId) {
    try {
      const result = await pool.query(
        'SELECT * FROM inbox_workflows WHERE account_id = $1 AND inbox_id = $2 AND is_active = true',
        [accountId, inboxId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao obter fluxo da caixa de entrada:', error);
      return null;
    }
  }

  // Listar todos os fluxos de caixas de entrada
  async getAllInboxWorkflows() {
    try {
      const result = await pool.query(
        'SELECT * FROM inbox_workflows WHERE is_active = true ORDER BY account_id, inbox_id'
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao listar fluxos das caixas de entrada:', error);
      return [];
    }
  }

  // Desativar fluxo de uma caixa de entrada
  async deactivateInboxWorkflow(accountId, inboxId) {
    try {
      await pool.query(
        'UPDATE inbox_workflows SET is_active = false WHERE account_id = $1 AND inbox_id = $2',
        [accountId, inboxId]
      );
      return { success: true, message: 'Fluxo desativado com sucesso' };
    } catch (error) {
      console.error('Erro ao desativar fluxo da caixa de entrada:', error);
      return { success: false, error: error.message };
    }
  }
}

// Instância global do gerenciador de conversas
let conversationManager;
// Instância global do gerenciador de fluxos por caixa de entrada
let inboxWorkflowManager;

// Inicializar sistema
async function initializeSystem() {
  try {
    console.log('🔧 Iniciando sistema de workflows...');
    await initializeDatabase();
    await createInitialUser();
    console.log('📊 Carregando gerenciadores...');
    conversationManager = new ConversationManager();
    inboxWorkflowManager = new InboxWorkflowManager();
    console.log('✅ Sistema de workflows inicializado com sucesso');
    
    // Iniciar polling do Chatwoot
    console.log('🔄 Preparando para iniciar monitoramento do Chatwoot...');
    startChatwootPolling();
    
    // Iniciar verificador de reativação automática
    startBotReactivationScheduler();

    // Iniciar verificador de campanhas agendadas
    startCampaignScheduler();

    // Iniciar verificador de auto followup
    startAutoFollowupScheduler();
  } catch (error) {
    console.error('❌ Erro ao inicializar sistema:', error);
    process.exit(1);
  }
}

// Função para iniciar polling do Chatwoot
function startChatwootPolling() {
  if (isPolling) {
    console.log('⚠️ Polling já está ativo');
    return;
  }
  
  isPolling = true;
  console.log('🔄 Iniciando monitoramento do Chatwoot...');
  
  // Iniciar primeiro polling imediatamente
  pollChatwootMessages();
}

// Função para iniciar verificação de reativação automática (24h)
function startBotReactivationScheduler() {
  console.log('🕐 Iniciando verificador de reativação automática de bots (24h)...');
  
  // Executar primeira verificação após 1 minuto
  setTimeout(() => {
    checkAndReactivateBotsAfter24Hours();
  }, 60000);
  
  // Verificar a cada 30 minutos
  setInterval(async () => {
    try {
      await checkAndReactivateBotsAfter24Hours();
    } catch (error) {
      console.error('❌ Erro na verificação de reativação automática:', error);
    }
  }, 1800000); // 30 minutos = 1800000ms
  
  console.log('✅ Verificador de reativação automática configurado (verificação a cada 30 minutos)');
}

// Iniciador do scheduler de campanhas agendadas
function startCampaignScheduler() {
  console.log('📅 Iniciando verificador de campanhas agendadas...');
  
  // Executar primeira verificação após 30 segundos
  setTimeout(() => {
    checkAndExecuteScheduledCampaigns();
  }, 30000);
  
  // Executar verificação a cada 2 minutos
  setInterval(async () => {
    try {
      await checkAndExecuteScheduledCampaigns();
    } catch (error) {
      console.error('❌ Erro na verificação de campanhas agendadas:', error);
    }
  }, 5 * 60 * 1000); // 5 minutos
  
  console.log('✅ Verificador de campanhas agendadas configurado (verificação a cada 5 minutos)');
}

// Iniciador do scheduler de auto followup
function startAutoFollowupScheduler() {
  console.log('🔄 Iniciando verificador de auto followup...');
  
  // Executar primeira verificação após 1 minuto
  setTimeout(() => {
    checkAndExecuteAutoFollowups();
  }, 60000);
  
  // Executar verificação a cada 2 minutos
  setInterval(async () => {
    try {
      await checkAndExecuteAutoFollowups();
    } catch (error) {
      console.error('❌ Erro na verificação de auto followup:', error);
    }
  }, 2 * 60 * 1000); // 2 minutos
  
  console.log('✅ Verificador de auto followup configurado (verificação a cada 2 minutos)');
}

// Verificar e executar auto followups
async function checkAndExecuteAutoFollowups() {
  try {
    console.log(`🔄 Verificando auto followups... Horário atual: ${getTimestamp()}`);
    
    // Primeiro: buscar workflows com auto_followup
    const workflowsWithFollowup = await getWorkflowsWithAutoFollowup();
    
    if (workflowsWithFollowup.length === 0) {
      console.log(`🔄 Nenhum workflow com auto_followup configurado encontrado`);
      return;
    }
    
    console.log(`🔄 Encontrados ${workflowsWithFollowup.length} workflow(s) com auto_followup configurado`);
    
    // Segundo: buscar conversas ativas apenas dos workflows que têm auto_followup
    const workflowNames = workflowsWithFollowup.map(w => w.workflow_name);
    const activeConversations = await pool.query(`
      SELECT 
        wc.id,
        wc.contact_id,
        wc.workflow_name,
        wc.current_block,
        wc.data,
        wc.last_activity,
        wc.created_at,
        EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive
      FROM workflow_conversations wc
      WHERE wc.status = 'active'
        AND wc.last_activity IS NOT NULL
        AND wc.workflow_name = ANY($1)
      ORDER BY wc.last_activity ASC
    `, [workflowNames]);
    
    if (activeConversations.rows.length === 0) {
      console.log(`🔄 Nenhuma conversa ativa encontrada nos workflows com auto_followup`);
      return;
    }
    
    console.log(`🔄 Verificando ${activeConversations.rows.length} conversa(s) em workflows com auto_followup`);
    
    // Usar o cálculo do PostgreSQL que está correto
    const conversationsWithInactivity = activeConversations.rows.map(conversation => {
      const secondsInactive = Math.floor(parseFloat(conversation.seconds_inactive));

      //console.log('Conversation:', JSON.stringify(conversation, null, 2));
      
      console.log(`🔍 Conversa ${conversation.data.conversation_id} (${conversation.contact_id}):`);
      console.log(`   Última atividade: ${conversation.last_activity}`);
      console.log(`   Segundos inativos (PostgreSQL): ${secondsInactive}`);
      
      return {
        ...conversation,
        seconds_inactive: secondsInactive
      };
    });
    
    // Terceiro: processar conversas agrupadas por workflow
    const conversationsByWorkflow = {};
    for (const conversation of conversationsWithInactivity) {
      if (!conversationsByWorkflow[conversation.workflow_name]) {
        conversationsByWorkflow[conversation.workflow_name] = [];
      }
      conversationsByWorkflow[conversation.workflow_name].push(conversation);
    }
    
    // Quarto: processar cada workflow
    for (const [workflowName, conversations] of Object.entries(conversationsByWorkflow)) {
      try {
        // Obter workflow do cache ou carregar do banco
        let workflow = conversationManager.workflows.get(workflowName);
        if (!workflow) {
          workflow = await conversationManager.loadWorkflowFromDatabase(workflowName);
        }
        
        if (!workflow || !workflow.auto_followup) {
          continue;
        }
        
        console.log(`📋 Processando workflow '${workflowName}' com ${conversations.length} conversa(s)`);
        
        // Processar todas as conversas deste workflow
        for (const conversation of conversations) {
          try {
            await processAutoFollowupForConversationWithWorkflow(conversation, workflow);
          } catch (error) {
            console.error(`❌ Erro ao processar followup para conversa ${conversation.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`❌ Erro ao processar workflow ${workflowName}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro na verificação de auto followups:', error);
  }
}

// Buscar workflows que têm auto_followup configurado
async function getWorkflowsWithAutoFollowup() {
  try {
    const workflows = [];
    
    // Buscar em workflow_configs
    const result1 = await pool.query(`
      SELECT workflow_name, config 
      FROM workflow_configs 
      WHERE is_active = true 
        AND config::text LIKE '%auto_followup%'
    `);
    
    for (const row of result1.rows) {
      try {
        const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
        if (config.auto_followup && Object.keys(config.auto_followup).length > 0) {
          workflows.push({
            workflow_name: row.workflow_name,
            source: 'workflow_configs'
          });
        }
      } catch (e) {
        // Ignorar workflows com JSON inválido
      }
    }
    
    // Buscar em inbox_workflows
    const result2 = await pool.query(`
      SELECT workflow_name, workflow_config as config 
      FROM inbox_workflows 
      WHERE is_active = true 
        AND workflow_config::text LIKE '%auto_followup%'
    `);
    
    for (const row of result2.rows) {
      try {
        const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
        if (config.auto_followup && Object.keys(config.auto_followup).length > 0) {
          workflows.push({
            workflow_name: row.workflow_name,
            source: 'inbox_workflows'
          });
        }
      } catch (e) {
        // Ignorar workflows com JSON inválido
      }
    }
    
    return workflows;
  } catch (error) {
    console.error('❌ Erro ao buscar workflows com auto_followup:', error);
    return [];
  }
}

// Processar auto followup para uma conversa específica (versão otimizada)
async function processAutoFollowupForConversationWithWorkflow(conversation, workflow) {
  const { id, contact_id, workflow_name, current_block, data, last_activity, seconds_inactive } = conversation;
  
  try {
    if (!workflow || !workflow.auto_followup) {
      return; // Sem configuração de auto followup
    }
    
    // Verificar cada bloco configurado para auto followup
    for (const [blockName, followupConfig] of Object.entries(workflow.auto_followup)) {
      const { delay, condition } = followupConfig;
      
      // Delay já está em segundos (nova implementação)
      const delaySeconds = delay;

      console.log(`🔄 Delay em segundos: ${delaySeconds}`); 
      console.log(`🔄 Segundos inativos: ${seconds_inactive}`);
       
      // Verificar se o tempo de inatividade atingiu o delay configurado
      if (seconds_inactive >= delaySeconds) {
        console.log(`⏰ Followup ativado para conversa ${id} - Bloco ${blockName} - Inativo há ${Math.round(seconds_inactive / 60)} minutos`);
        
        // Verificar condição
        if (condition === 'inactive') {
          // Verificar se o auto_followup está desativado para esta conversa
          const isFollowupDisabled = await isAutoFollowupDisabledForConversation(conversation.data.conversation_id, contact_id);
          
          if (isFollowupDisabled) {
            console.log(`🚫 Auto_followup desativado para conversa ${id}, pulando followup ${blockName}`);
            return;
          }
          
          // Verificar se o bot está ativo para esta conversa
          const isBotActive = await isBotActiveForConversation(conversation.data.conversation_id, contact_id, CHATWOOT_ACCOUNT_ID);
          
          if (isBotActive) {
            // Verificar se o bloco já foi executado recentemente
            const alreadyExecuted = await checkIfFollowupAlreadyExecuted(conversation.id, blockName, delaySeconds);
            
            if (!alreadyExecuted) {
              await executeAutoFollowup(conversation.id, contact_id, workflow, blockName, data);
            } else {
              console.log(`⏭️ Followup para bloco ${blockName} já foi executado recentemente`);
            }
          } else {
            console.log(`⏸️ Bot pausado para conversa ${id}, pulando followup ${blockName}`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Erro ao processar followup para conversa ${conversation.data.conversation_id}:`, error);
  }
}

// Obter ID da conversa do Chatwoot baseado no contact_id
async function getChatwootConversationId(contactId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Primeiro, buscar o account_id correto na tabela workflow_conversations
    const conversationResult = await pool.query(`
      SELECT account_id 
      FROM workflow_conversations 
      WHERE contact_id = $1 
        AND status = 'active'
      ORDER BY last_activity DESC 
      LIMIT 1
    `, [contactId]);
    
    if (conversationResult.rows.length === 0) {
      console.log(`⚠️ Conversa de workflow não encontrada para contact ${contactId}`);
      return null;
    }
    
    const correctAccountId = conversationResult.rows[0].account_id;
    console.log(`🔍 Buscando conversa do Chatwoot para contact ${contactId} na conta ${correctAccountId}`);
    
    // Usar a API do Chatwoot para buscar conversas na conta correta
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${correctAccountId}/conversations`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      },
      params: {
        status: 'open'
      }
    });

    // Verificar se a resposta tem a estrutura esperada
    if (!response.data || !response.data.data || !response.data.data.payload || !Array.isArray(response.data.data.payload)) {
      console.log(`⚠️ Resposta inesperada da API do Chatwoot para conta ${correctAccountId}:`, JSON.stringify(response.data, null, 2));
      return null;
    }

    console.log(`📋 Encontradas ${response.data.data.payload.length} conversas abertas na conta ${correctAccountId}`);

    // Mostrar todas as conversas para debug
    response.data.data.payload.forEach((conv, index) => {
      const phoneNumber = conv.meta?.sender?.phone_number;
      console.log(`📞 Conversa ${index + 1}: ID ${conv.id}, Telefone: ${phoneNumber}`);
    });

    // Procurar conversa com o contact_id
    const conversation = response.data.data.payload.find(conv => {
      const phoneNumber = conv.meta?.sender?.phone_number;
      console.log(`🔍 Verificando conversa ${conv.id}: ${phoneNumber} vs ${contactId}`);
      return phoneNumber === contactId;
    });

    if (conversation) {
      console.log(`✅ Conversa encontrada: ID ${conversation.id} na conta ${correctAccountId}`);
    } else {
      console.log(`❌ Conversa não encontrada para contact ${contactId} na conta ${correctAccountId}`);
    }

    return conversation ? conversation.id : null;
  } catch (error) {
    console.error('❌ Erro ao obter ID da conversa do Chatwoot:', error);
    return null;
  }
}

// Verificar se uma conversa está inativa (sem atividade do usuário)
async function isConversationInactive(contactId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Verificar se a conversa de workflow está inativa baseada no last_activity
    const conversationResult = await pool.query(`
      SELECT 
        id,
        last_activity,
        EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
      FROM workflow_conversations 
      WHERE contact_id = $1 
        AND status = 'active'
      ORDER BY last_activity DESC 
      LIMIT 1
    `, [contactId]);
    
    if (conversationResult.rows.length === 0) {
      console.log(`⚠️ Conversa de workflow não encontrada para contact ${contactId}`);
      return false;
    }
    
    const conversation = conversationResult.rows[0];
    const secondsInactive = Math.floor(parseFloat(conversation.seconds_inactive));
    const minutesInactive = Math.floor(secondsInactive / 60);
    
    // Verificar se houve interações recentes do usuário (últimas 2 horas)
    const recentInteractions = await pool.query(`
      SELECT COUNT(*) as count
      FROM workflow_interactions 
      WHERE wf_conversation_id = $1 
        AND user_response != 'AUTO_FOLLOWUP'  -- Excluir followups automáticos
        AND timestamp > NOW() - INTERVAL '2 hours'
    `, [conversation.id]);
    
    const hasRecentUserActivity = recentInteractions.rows[0].count > 0;
    
    // Considerar inativa se:
    // 1. Não houve atividade nas últimas 2 horas (7200 segundos) E
    // 2. Não houve interações do usuário nas últimas 2 horas
    const isInactive = secondsInactive >= 7200 && !hasRecentUserActivity;
    
    console.log(`🔍 Verificação de inatividade para ${contactId}:`);
    console.log(`   Última atividade: ${conversation.last_activity}`);
    console.log(`   Segundos inativos: ${secondsInactive} (${minutesInactive} minutos)`);
    console.log(`   Interações usuário (2h): ${recentInteractions.rows[0].count}`);
    console.log(`   Considerada inativa: ${isInactive ? '✅ SIM' : '❌ NÃO'}`);
    
    return isInactive;
  } catch (error) {
    console.error('❌ Erro ao verificar inatividade da conversa:', error);
    return false;
  }
}

// Verificar se o followup já foi executado recentemente
async function checkIfFollowupAlreadyExecuted(conversationId, blockName, delaySeconds) {
  try {
    // Verificar se há uma interação com este bloco desde que o delay foi atingido
    const recentInteraction = await pool.query(`
      SELECT timestamp 
      FROM workflow_interactions 
      WHERE wf_conversation_id = $1 
        AND block_name = $2 
        AND timestamp > NOW() - INTERVAL '1 day'
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [conversationId, blockName]);
    
    if (recentInteraction.rows.length > 0) {
      const lastExecution = recentInteraction.rows[0].timestamp;
      const timeSinceExecution = (Date.now() - new Date(lastExecution).getTime()) / 1000;
      
      // Se foi executado há menos tempo que o delay, considerar como já executado
      if (timeSinceExecution < delaySeconds) {
        console.log(`⏭️ Followup ${blockName} executado há ${Math.round(timeSinceExecution / 60)} minutos, aguardando mais ${Math.round((delaySeconds - timeSinceExecution) / 60)} minutos`);
        return true;
      }
    }
    
    // Verificar se já foi executado um followup para este bloco (independente do tempo)
    const followupExecuted = await pool.query(`
      SELECT timestamp 
      FROM workflow_interactions 
      WHERE wf_conversation_id = $1 
        AND block_name = $2 
        AND user_response = 'AUTO_FOLLOWUP'
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [conversationId, blockName]);
    
    if (followupExecuted.rows.length > 0) {
      console.log(`⏭️ Followup ${blockName} já foi executado anteriormente para esta conversa`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Erro ao verificar execução recente de followup:', error);
    return false;
  }
}

// Executar auto followup
async function executeAutoFollowup(conversationId, contactId, workflow, blockName, conversationData) {
  try {
    console.log(`🚀 Executando auto followup: ${blockName} para conversa ${conversationId}`);
    
    // ===== VERIFICAÇÃO DE CONTATO EVOLUTIONAPI =====
    // Verificar se o contato é o EvolutionAPI
    const isEvolutionAPI = await isEvolutionAPIContact(contactId, conversationData?.account_id);
    if (isEvolutionAPI) {
      console.log(`🚫 Auto followup cancelado: contato EvolutionAPI detectado (${contactId})`);
      return; // Não executar auto followups para o EvolutionAPI
    }
    
    // Obter o account_id correto da tabela workflow_conversations
    const accountResult = await pool.query(`
      SELECT account_id 
      FROM workflow_conversations 
      WHERE id = $1
    `, [conversationId]);
    
    if (accountResult.rows.length === 0) {
      console.error(`❌ Conversa ${conversationId} não encontrada`);
      return;
    }
    
    const correctAccountId = accountResult.rows[0].account_id;
    console.log(`🔍 Usando conta ${correctAccountId} para conversa ${conversationId}`);
    
    // Obter o ID da conversa do Chatwoot
    const chatwootConversationId = await getChatwootConversationId(contactId, correctAccountId);
    if (!chatwootConversationId) {
      console.error(`❌ Não foi possível encontrar conversa do Chatwoot para contact ${contactId}`);
      return;
    }
    
    // VERIFICAÇÃO ADICIONAL: Verificar se a conversa atual está em uma caixa com fluxo ativo
    try {
      const conversationResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${correctAccountId}/conversations/${chatwootConversationId}`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      const inboxId = conversationResponse.data.payload.inbox_id;
      const currentInboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(correctAccountId, inboxId);
      if (!currentInboxWorkflow) {
        console.log(`🚫 Auto followup cancelado: conversa ${conversationId} está em caixa sem fluxo ativo (Inbox: ${inboxId})`);
        return;
      }
    } catch (error) {
      console.log(`⚠️ Não foi possível verificar inbox da conversa, continuando com followup:`, error.message);
    }
    
    // Obter o bloco de followup
    const followupBlock = workflow.blocks[blockName];
    if (!followupBlock) {
      console.error(`❌ Bloco de followup ${blockName} não encontrado no workflow`);
      return;
    }
    
    // Processar dados da conversa
    let data = {};
    if (conversationData) {
      try {
        data = typeof conversationData === 'string' ? JSON.parse(conversationData) : conversationData;
      } catch (e) {
        console.error('❌ Erro ao processar dados da conversa:', e);
      }
    }
    
    // Processar mensagem com variáveis
    const processedMessage = conversationManager.processMessage(followupBlock.message, data);
    
    // ATUALIZAR O BLOCO ATUAL PARA O BLOCO DE FOLLOWUP ANTES DE ENVIAR
    await pool.query(
      'UPDATE workflow_conversations SET current_block = $1, last_activity = CURRENT_TIMESTAMP WHERE id = $2',
      [blockName, conversationId]
    );
    console.log(`🔄 Atualizando conversa ${conversationId} para bloco ${blockName} antes do followup`);
    
    // Enviar mensagem de followup
    const buttons = followupBlock.buttons || [];
    await sendChatwootMessage(chatwootConversationId, processedMessage, buttons, null, correctAccountId, inboxId);
    
    // Salvar interação - usar o id da tabela workflow_conversations, não o conversation_id do Chatwoot
    await conversationManager.saveInteraction(
      conversationData.id || conversationId, 
      contactId, 
      blockName, 
      'AUTO_FOLLOWUP', 
      processedMessage, 
      buttons
    );
    
    // Aplicar ações do bloco (tags, labels, etc.)
    await conversationManager.processBlockActions(followupBlock, conversationData?.conversation_id || conversationId, contactId, correctAccountId);
    
    console.log(`✅ Followup executado para bloco: ${blockName}`);
    
    // Se o bloco tem pause_bot, pausar o bot
    if (followupBlock.pause_bot) {
      await pauseBotForConversation(conversationData?.conversation_id || conversationId, contactId, 'Auto followup executado', 'system');
      console.log(`⏸️ Bot pausado após followup para conversa ${conversationData?.conversation_id || conversationId}`);
    }
    
  } catch (error) {
    console.error(`❌ Erro ao executar auto followup ${blockName}:`, error);
  }
}

// Verificar e executar campanhas agendadas
async function checkAndExecuteScheduledCampaigns() {
  try {
    // Usar timestamp atual em timezone do Brasil
    const now = new Date();
    
    console.log(`📅 Verificando campanhas agendadas... Horário atual (Brasil): ${getTimestamp()}`);
    
    // Buscar campanhas agendadas que devem ser executadas agora
    // Usar timezone do Brasil para comparação correta
    const scheduledCampaigns = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.scheduled_at,
        c.status,
        c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' as scheduled_at_brasil,
        NOW() as current_time
      FROM campaigns c
      WHERE c.status = 'pending' 
        AND c.scheduled_at IS NOT NULL 
        AND c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' >= (NOW()) - INTERVAL '5 minutes'
        AND c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' <= (NOW()) + INTERVAL '5 minutes'
      ORDER BY c.scheduled_at ASC
    `);
    
    if (scheduledCampaigns.rows.length === 0) {
      console.log(`📅 Nenhuma campanha agendada para execução encontrada`);
      return;
    }
    
    console.log(`🚀 Encontradas ${scheduledCampaigns.rows.length} campanha(s) agendada(s) para execução:`);
    
    for (const campaign of scheduledCampaigns.rows) {
      const { id, name, scheduled_at, scheduled_at_brasil, current_time_brasil } = campaign;
      
      console.log(`📤 Executando campanha agendada: ${name} (ID: ${id})`);
      console.log(`   📅 Agendada para: ${scheduled_at_brasil} (Brasil)`);
      console.log(`   📅 Horário atual: ${current_time_brasil} (Brasil)`);
      
      try {
        // Atualizar status para 'running'
        await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['running', id]);
        
        // Processar campanha em background
        processCampaign(id).catch(err => {
          console.error(`❌ Erro no processamento da campanha agendada ${id}:`, err);
        });
        
        console.log(`✅ Campanha ${name} (ID: ${id}) iniciada com sucesso`);
        
      } catch (campaignError) {
        console.error(`❌ Erro ao executar campanha agendada ${id}:`, campaignError);
        
        // Marcar campanha como failed em caso de erro
        await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', id]);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar campanhas agendadas:', error);
  }
}

// Função de polling para verificar novas mensagens no Chatwoot
async function pollChatwootMessages() {
  try {
    // Log reduzido: não exibir detalhes por conta
    
    // Obter todas as contas disponíveis
    const accounts = await getAllAvailableAccounts();
    
    let totalConversations = 0;
    
    // Iterar por cada conta
    for (const account of accounts) {
      try {
        // Obter conversas ativas da conta atual
        const conversations = await getChatwootConversations(account.id);
        
        totalConversations += conversations.length;
        
        // Processar conversas da conta atual
        for (const conversation of conversations) {
          await processChatwootConversation(conversation, account.id);
        }
        
      } catch (error) {
        console.error(`❌ Erro ao processar conta ${account.name} (ID: ${account.id}):`, error);
      }
    }
    
    console.log(`✅ Polling concluído - ${totalConversations} conversas processadas em ${accounts.length} conta(s), agendando próximo...`);
  } catch (error) {
    console.error('❌ Erro no polling do Chatwoot:', error);
  } finally {
    // Agendar próximo polling
    setTimeout(() => {
      console.log('⏰ Executando próximo polling...');
      pollChatwootMessages();
    }, POLLING_INTERVAL);
  }
}

// Obter conversas ativas do Chatwoot
async function getChatwootConversations(accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      },
      params: {
        status: 'open'
        // Removido inbox_id hardcoded - agora busca de todas as caixas de entrada
      }
    });
    return response.data.data.payload || [];
  } catch (error) {
    console.error(`❌ Erro ao obter conversas da conta ${accountId}:`, error);
    return [];
  }
}

// Processar conversa do Chatwoot
async function processChatwootConversation(conversation, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    const conversationId = conversation.id;
    const inboxId = conversation.inbox_id; // Detectar automaticamente o inbox_id
    
    // VERIFICAÇÃO: Ignorar conversas de grupo
    if (
        conversation.phone_number === null ||
        conversation.conversation_type === 'group' || 
        conversation.conversation_type === 'team' ||
        conversation.conversation_type === 'multiple' ||
        conversation.meta?.channel_type === 'group' ||
        conversation.meta?.channel_type === 'team' ||
        conversation.meta?.channel_type === 'multiple' ||
        conversation.meta?.sender?.phone_number === null ||
        (conversation.meta?.sender?.name && conversation.meta.sender.name.toLowerCase().includes('(group)')) ||
        (conversation.meta?.sender?.identifier && conversation.meta.sender.identifier.includes('@g.us'))) {
      //console.log(`👥 Ignorando conversa de grupo/team - ID: ${conversationId}, Name: ${conversation.meta?.sender?.name}`);
      return;
    }
    
    // Obter o ID real do contato e o número de telefone
    const realContactId = conversation.meta && conversation.meta.sender && conversation.meta.sender.id
      ? conversation.meta.sender.id
      : null;
    const phoneNumber = conversation.meta && conversation.meta.sender && conversation.meta.sender.phone_number
      ? conversation.meta.sender.phone_number
      : null;
    
    // Usar o ID real do contato se disponível, senão usar o número de telefone como fallback
    const contactId = realContactId || phoneNumber;
    
    if (!contactId) {
      console.error('❌ Não foi possível extrair o contactId da conversa:', JSON.stringify(conversation));
      return;
    }
    
    // ===== VERIFICAÇÃO DE CONTATO EVOLUTIONAPI =====
    // Verificar se o contato é o EvolutionAPI pelo nome ou telefone
    const contactName = conversation.meta?.sender?.name || '';
    
    const isEvolutionAPI = contactName.toLowerCase().includes('evolutionapi') || 
                          phoneNumber.includes('+123456') ||
                          phoneNumber.includes('123456');
    
    if (isEvolutionAPI) {
      //console.log(`🚫 Ignorando conversa do contato EvolutionAPI: ${contactName} (${phoneNumber}) - ID: ${conversationId}`);
      return; // Não processar conversas do EvolutionAPI
    }
    
    //console.log(`🔍 Processando conversa - ID: ${conversationId}, Inbox: ${inboxId}, Contato: ${contactId}, Conta: ${accountId}`);
    
    // Verificar se já existe uma conversa de workflow ativa
    let workflowConversation = await conversationManager.getConversation(contactId);
    
    // Obter mensagens recentes da conversa
    const messages = await getChatwootMessages(conversationId, accountId);
    
    for (const message of messages) {
      // Verificar se a mensagem já foi processada
      const isProcessed = await isMessageProcessed(message.id);
      if (isProcessed) continue;
      
      // Marcar mensagem como processada
      await markMessageAsProcessed(message.id, contactId);
      
      // Processar mensagens do usuário (incoming) e TODAS as mensagens de agentes (outgoing)
      // Também tratar mensagens com anexos (áudio)
      const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
      if (hasAttachments) {
        // Detectar áudio
        const audioAttachment = message.attachments.find(att => {
          const t = (att.content_type || att.file_type || '').toLowerCase();
          return t.startsWith('audio/') || t.includes('audio');
        });
        if (audioAttachment && message.message_type === 0) { // incoming de usuário
          try {
            console.log(`🎤 Áudio recebido na conversa ${conversationId}. Iniciando transcrição...`);
            // Identificar workflow ativo e agente IA associado
            let agentId = null;
            if (!workflowConversation) {
              workflowConversation = await conversationManager.getConversation(contactId);
            }
            // Descobrir nome do workflow ativo
            let activeWorkflowName = workflowConversation && workflowConversation.workflow_name
              ? workflowConversation.workflow_name
              : null;
            
            // Fallback: tentar obter workflow configurado pela inbox
            if (!activeWorkflowName) {
              try {
                const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(accountId, inboxId);
                if (inboxWorkflow && inboxWorkflow.workflow_name) {
                  activeWorkflowName = inboxWorkflow.workflow_name;
                  // Se não houver conversa, inicializar uma básica para manter consistência
                  if (!workflowConversation) {
                    await conversationManager.startConversation(contactId, activeWorkflowName, { conversation_id: conversationId }, accountId);
                    workflowConversation = await conversationManager.getConversation(contactId);
                  }
                }
              } catch (e) {
                console.warn('⚠️ Falha ao obter workflow da inbox:', e.message);
              }
            }
            
            if (activeWorkflowName) {
              const agentInfo = await getAIAgentByWorkflow(activeWorkflowName);
              agentId = agentInfo && agentInfo.id ? agentInfo.id : null;
            }
            
            // Se não há agente IA configurado, ignorar transcrição
            if (!agentId) {
              console.log('⚠️ Nenhum agente IA configurado para este workflow. Ignorando transcrição.');
            } else {
              // Obter detalhes do agente para checar provider
              const agentDetailsResp = await fetch(`${IA_AGENT_URL}/agents/${agentId}`);
              const agentDetails = agentDetailsResp.ok ? (await agentDetailsResp.json()).agent : null;
              if (!agentDetails || agentDetails.api_provider !== 'groq') {
                await sendChatwootMessage(conversationId, 'Esse agente não tem suporte para ouvir mensagens de áudio. Favor enviar mensagens de texto.', [], null, accountId, inboxId);
              } else {
                // Baixar arquivo de áudio da URL pública do Chatwoot
                const url = audioAttachment.data_url || audioAttachment.download_url || audioAttachment.file_url || audioAttachment.url;
                if (!url) {
                  console.warn('⚠️ Não foi possível obter URL do arquivo de áudio.');
                } else {
                  const path = require('path');
                  const fs = require('fs');
                  const os = require('os');
                  const axios = require('axios');
                  const FormData = require('form-data');
                  
                  const tempDir = path.join(os.tmpdir(), 'chatwoot_audio');
                  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                  const fileExt = (audioAttachment.file_type && audioAttachment.file_type.split('/')[1]) || 'mp3';
                  const tempPath = path.join(tempDir, `audio_${Date.now()}.${fileExt}`);
                  
                  const resp = await axios.get(url, { responseType: 'stream', timeout: 30000 });
                  await new Promise((resolve, reject) => {
                    const writer = fs.createWriteStream(tempPath);
                    resp.data.pipe(writer);
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                  });
                  
                  // Enviar para o ia-agent para transcrever
                  const formData = new FormData();
                  formData.append('audio_file', fs.createReadStream(tempPath));
                  const transcribeResp = await axios.post(
                    `${IA_AGENT_URL}/agents/${agentId}/transcribe-audio`,
                    formData,
                    { headers: formData.getHeaders(), timeout: 120000 }
                  );
                  
                  let transcript = null;
                  if (transcribeResp && transcribeResp.data && transcribeResp.data.status === 'success') {
                    transcript = transcribeResp.data.transcript;
                  }
                  
                  // Limpar arquivo temporário
                  setTimeout(() => { try { fs.unlinkSync(tempPath); } catch(e){} }, 5000);
                  
                  if (transcript) {
                    // Enviar a transcrição como mensagem do usuário para o workflow
                    const transcribedMsg = `🗣️ (Transcrição de áudio) ${transcript}`;
                    await processUserMessage(contactId, conversationId, transcribedMsg, inboxId, accountId);
                  } else {
                    await sendChatwootMessage(conversationId, '❌ Não foi possível transcrever o áudio. Por favor, envie sua mensagem em texto.', [], null, accountId, inboxId);
                  }
                }
              }
            }
          } catch (err) {
            console.error('❌ Erro ao processar áudio:', err.message);
            await sendChatwootMessage(conversationId, '❌ Ocorreu um erro ao processar seu áudio. Envie sua mensagem em texto, por favor.', [], null, accountId, inboxId);
          }
          // Passar para próxima mensagem
          continue;
        }
      }
      
      if (message.content) {
        if (message.message_type === 0) {  // 0 = incoming (usuário)
          await processUserMessage(contactId, conversationId, message.content, inboxId, accountId);
        } else if (message.message_type === 1) {  // 1 = outgoing (sistema/agente)
          // VERIFICAÇÕES PARA EVITAR LOOP - Ignorar mensagens do próprio bot
          const isBotMessage = 
            !message.sender || // Sem sender (sistema)
            message.sender.type === 'AgentBot' || 
            message.sender.type === 'Bot' ||
            message.content.includes('**Bot Pausado Automaticamente**') || // Mensagem específica do bot
            message.content.includes('**Comando de Agente Executado**') ||
            message.content.startsWith('🤖') || // Mensagens que começam com emoji de bot
            message.content.includes('Detectei intervenção de agente') || // Conteúdo específico
            message.content.includes('Fluxo reiniciado com sucesso') || // Mensagem de reset
            message.content.includes('Bot reativado com sucesso') || // Mensagem de reativação
            message.content.includes('Status do Bot') || // Mensagem de status
            message.content.includes('assistente virtual') || // Mensagens típicas do bot
            message.content.includes('👋') || // Mensagens com emoji de saudação (comum em bots)
            (message.sender && message.sender.name && message.sender.name.includes('Admin CRM')) || // Sender do sistema/bot
            // NOVA VERIFICAÇÃO: Verificar se user_id é null/undefined (mensagens do sistema)
            (!message.user_id || message.user_id === null || message.user_id === undefined) ||
            // VERIFICAÇÃO DE PADRÕES ESPECÍFICOS DO BOT DA WIZARD
            (message.content.includes('Wizard') && message.content.includes('assistente virtual')) ||
            (message.content.includes('Você já é nosso aluno') && message.content.includes('👋'));
          
          if (isBotMessage) {
            console.log(`🤖 Mensagem de bot ignorada: ${message.sender?.type || 'Sistema'} - ${message.content.substring(0, 50)}...`);
          } else if (message.sender) {
            // Log detalhado para debug
            console.log(`👤 DEBUG: Mensagem outgoing - ID: ${message.id}, User_ID: ${message.user_id}, Sender: ${JSON.stringify(message.sender)}, Content: ${message.content.substring(0, 100)}`);
            console.log(`👤 Mensagem de agente humano detectada: ${message.sender.name || message.user_id} - ${message.content}`);
            await processAgentCommand(contactId, conversationId, message.content, inboxId, accountId, message.user_id);
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao processar conversa da conta ${accountId}:`, error);
  }
}

// Obter mensagens de uma conversa do Chatwoot
async function getChatwootMessages(conversationId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      },
      params: {
        page: 1,
        per_page: 10 // Últimas 10 mensagens
      }
    });
    
    return response.data.payload || [];
  } catch (error) {
    console.error(`❌ Erro ao obter mensagens da conta ${accountId}:`, error);
    return [];
  }
}

// Verificar se mensagem já foi processada
async function isMessageProcessed(messageId) {
  try {
    const result = await pool.query('SELECT id FROM processed_messages WHERE message_id = $1', [messageId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ Erro ao verificar mensagem processada:', error);
    return false;
  }
}

// Marcar mensagem como processada
async function markMessageAsProcessed(messageId, contactId) {
  try {
    await pool.query(
      'INSERT INTO processed_messages (message_id, contact_id) VALUES ($1, $2) ON CONFLICT (message_id) DO NOTHING',
      [messageId, contactId]
    );
  } catch (error) {
    console.error('❌ Erro ao marcar mensagem como processada:', error);
  }
}

// Verificar se um botão já foi processado recentemente (debounce)
async function isButtonRecentlyProcessed(conversationId, blockId, buttonText) {
  try {
    const result = await pool.query(`
      SELECT processed_at 
      FROM button_debounce 
      WHERE conversation_id = $1 AND block_id = $2 AND button_text = $3
    `, [conversationId, blockId, buttonText]);
    
    if (result.rows.length === 0) {
      return false; // Botão nunca foi processado
    }
    
    const processedAt = result.rows[0].processed_at;
    const now = new Date();
    const timeDiff = (now - processedAt) / 1000; // Diferença em segundos
    
    // ===== DEBOUNCE INTELIGENTE =====
    // Se foi processado há menos de 5 segundos, considerar como recente
    // Mas se passou mais de 5 minutos, permitir reutilização (usuário pode ter voltado ao bloco)
    if (timeDiff < 5) {
      console.log(`🚫 Botão "${buttonText}" processado há ${timeDiff.toFixed(1)} segundos. Bloqueando clique duplicado.`);
      return true; // Clique muito recente - bloquear
    } else if (timeDiff > 300) { // 5 minutos = 300 segundos
      console.log(`🔄 Botão "${buttonText}" foi processado há ${Math.round(timeDiff/60)} minutos. Permitindo reutilização (usuário pode ter voltado ao bloco).`);
      return false; // Permitir reutilização após tempo significativo
    } else {
      console.log(`⏳ Botão "${buttonText}" processado há ${Math.round(timeDiff)} segundos. Mantendo bloqueio (entre 5s e 5min).`);
      return true; // Entre 5 segundos e 5 minutos - manter bloqueio
    }
  } catch (error) {
    console.error('❌ Erro ao verificar debounce do botão:', error);
    return false; // Em caso de erro, permitir processamento
  }
}

// Marcar botão como processado (para debounce)
async function markButtonAsProcessed(conversationId, contactId, blockId, buttonText) {
  try {
    await pool.query(`
      INSERT INTO button_debounce (conversation_id, contact_id, block_id, button_text) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (conversation_id, block_id, button_text) 
      DO UPDATE SET processed_at = CURRENT_TIMESTAMP
    `, [conversationId, contactId, blockId, buttonText]);
  } catch (error) {
    console.error('❌ Erro ao marcar botão como processado:', error);
  }
}

// Resetar debounce quando usuário navega para bloco diferente
async function resetButtonDebounceForBlock(conversationId, newBlockId) {
  try {
    // Buscar o bloco atual da conversa
    const currentBlockResult = await pool.query(`
      SELECT current_block 
      FROM workflow_conversations 
      WHERE conversation_id = $1
    `, [conversationId]);
    
    if (currentBlockResult.rows.length === 0) {
      // Se não encontrar a conversa, assumir que é uma navegação direta
      // e resetar debounce de todos os blocos para esta conversa
      console.log(`🔄 Conversa ${conversationId} não encontrada. Resetando debounce de todos os blocos.`);
      
      await pool.query(`
        UPDATE button_debounce 
        SET processed_at = processed_at - INTERVAL '10 minutes'
        WHERE conversation_id = $1
      `, [conversationId]);
      
      console.log(`✅ Debounce resetado para todos os blocos da conversa ${conversationId}`);
      return;
    }
    
    const currentBlock = currentBlockResult.rows[0].current_block;
    
    // Se o usuário está navegando para um bloco diferente, resetar debounce do bloco anterior
    if (currentBlock && currentBlock !== newBlockId) {
      console.log(`🔄 Usuário navegando de bloco ${currentBlock} para ${newBlockId}. Resetando debounce do bloco anterior.`);
      
      // ===== RESET INTELIGENTE =====
      // Resetar debounce do bloco anterior E de todos os blocos visitados anteriormente
      // para permitir navegação de volta em qualquer ponto do fluxo
      
      // 1. Resetar o bloco atual
      await pool.query(`
        UPDATE button_debounce 
        SET processed_at = processed_at - INTERVAL '10 minutes'
        WHERE conversation_id = $1 AND block_id = $2
      `, [conversationId, currentBlock]);
      
      // 2. Resetar todos os blocos que podem ser acessados de volta
      // (incluindo blocos visitados anteriormente na conversa)
      await pool.query(`
        UPDATE button_debounce 
        SET processed_at = processed_at - INTERVAL '10 minutes'
        WHERE conversation_id = $1 
        AND block_id != $2 
        AND processed_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
      `, [conversationId, newBlockId]);
      
      console.log(`✅ Debounce resetado para bloco ${currentBlock} e blocos anteriores visitados`);
      console.log(`🔄 Agora o usuário pode navegar de volta para qualquer bloco anterior`);
    }
  } catch (error) {
    console.error('❌ Erro ao resetar debounce do bloco:', error);
  }
}

// Processar comando de agente
async function processAgentCommand(contactId, conversationId, agentMessage, inboxId, accountId = CHATWOOT_ACCOUNT_ID, agentId = null) {
  try {
    console.log(`👤 Processando comando de agente ${agentId} (Inbox: ${inboxId}): ${agentMessage}`);
    
    // ===== PAUSAR BOT AUTOMATICAMENTE QUANDO AGENTE INTERVÉM =====
    // Se não for um comando especial, pausar o bot automaticamente
    if (!agentMessage.trim().startsWith('!')) {
      console.log(`👤 Agente ${agentId} enviou mensagem normal, pausando bot automaticamente (silencioso)`);
      await pauseBotForConversation(conversationId, contactId, 'agent_intervention', `agent_${agentId}`);
      
      // NÃO enviar mensagem informativa para evitar loop
      // O agente já está atendendo, não precisa de notificação automática
      
      return; // IMPORTANTE: Sair da função após pausar o bot
    }
    
    const command = agentMessage.trim().toLowerCase();
    
    // ===== COMANDOS DISPONÍVEIS PARA AGENTES =====
    
    // Reset do fluxo
    if (command === '!reset') {
      console.log(`🔄 Reset solicitado por agente ${agentId}`);
      await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contactId]);
      // Limpar registros de debounce para este contato
      await pool.query('DELETE FROM button_debounce WHERE contact_id = $1', [contactId]);
      // Remover todos os labels do contato
      await removeAllLabelsFromContact(contactId, accountId);
      // Remover todos os labels da conversa
      await removeAllLabelsFromConversation(conversationId, accountId);
      
      // Limpar dados do Redis do agente IA (horários sugeridos e informações de agendamento)
      try {
        // Buscar o telefone do contato para limpar dados específicos do Redis
        const contactResponse = await axios.get(
          `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`,
          { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
        );
        
        if (contactResponse.data && contactResponse.data.payload) {
          const phoneNumber = contactResponse.data.payload.phone_number || '';
          
          // Buscar agente IA vinculado ao workflow (se houver)
          const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(accountId, inboxId);
          if (inboxWorkflow && inboxWorkflow.workflow_name) {
            const aiAgent = await getAIAgentByWorkflow(inboxWorkflow.workflow_name);
            if (aiAgent && aiAgent.id) {
              // Limpar horários sugeridos do Redis
              const suggestedTimesKey = `agent:last_suggested_times:${aiAgent.id}:${phoneNumber}`;
              await redis.del(suggestedTimesKey);
              
              // Limpar informações de agendamento do Redis
              const schedulingInfoKey = `agent:last_scheduling_info:${aiAgent.id}`;
              await redis.del(schedulingInfoKey);
              
              console.log(`✅ Dados do Redis limpos para agente IA ${aiAgent.id}`);
            }
          }
        }
      } catch (error) {
        console.error('⚠️ Erro ao limpar dados do Redis:', error.message);
        // Não bloquear o reset se houver erro ao limpar Redis
      }
      
      // Reativar o bot após reset
      await reactivateBotForConversation(conversationId, contactId, `agent_${agentId}_reset`);
      await sendChatwootMessage(conversationId, '🔄 **Comando de Agente Executado**\n\nFluxo reiniciado com sucesso! Todos os dados foram limpos:\n✅ Conversas e interações\n✅ Labels (contato e conversa)\n✅ Dados do agente IA (Redis)\n\nO bot foi reativado e está pronto para uma nova conversa.', [], null, accountId, inboxId);
      return;
    }
    
    // Reativar bot
    if (command === '!activebot') {
      console.log(`▶️ Comando de reativação do bot solicitado por agente ${agentId}`);
      const success = await reactivateBotForConversation(conversationId, contactId, `agent_${agentId}`);
      if (success) {
        await sendChatwootMessage(conversationId, '🔄 **Comando de Agente Executado**\n\n▶️ Bot reativado com sucesso! O bot voltará a responder normalmente nesta conversa.', [], null, accountId, inboxId);
      } else {
        await sendChatwootMessage(conversationId, '❌ Erro ao reativar bot. Tente novamente.', [], null, accountId);
      }
      return;
    }
    
    // Pausar bot
    if (command === '!pausebot') {
      console.log(`⏸️ Comando de pausa do bot solicitado por agente ${agentId}`);
      const success = await pauseBotForConversation(conversationId, contactId, 'manual_pause', `agent_${agentId}`);
      if (success) {
        await sendChatwootMessage(conversationId, '🔄 **Comando de Agente Executado**\n\n⏸️ Bot pausado com sucesso! O bot não responderá mais nesta conversa até ser reativado.', [], null, accountId, inboxId);
      } else {
        await sendChatwootMessage(conversationId, '❌ Erro ao pausar bot. Tente novamente.', [], null, accountId);
      }
      return;
    }
    
    // Status do bot
    if (command === '!botstatus') {
      console.log(`🔍 Status do bot solicitado por agente ${agentId}`);
      try {
        const botStatus = await getBotConversationStatus(conversationId, contactId);
        const status = botStatus.bot_active ? '✅ Ativo' : `❌ Pausado (${botStatus.paused_reason})`;
        const agent = botStatus.has_human_agent ? `👤 Agente: ${botStatus.agent_id}` : '🤖 Sem agente humano';
        const message = `🔄 **Comando de Agente Executado**\n\n🤖 **Status do Bot**\n${status}\n${agent}\n\n**Comandos disponíveis para agentes:**\n• !pausebot - Pausar bot\n• !activebot - Reativar bot\n• !reset - Reiniciar fluxo\n• !workflows - Listar workflows\n• !reload - Recarregar workflows`;
        await sendChatwootMessage(conversationId, message, [], null, accountId);
      } catch (error) {
        console.error('❌ Erro ao obter status do bot:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao obter status do bot.', [], null, accountId);
      }
      return;
    }
    
    // Recarregar workflows
    if (command === '!reload') {
      console.log(`🔄 Reload de workflows solicitado por agente ${agentId}`);
      try {
        await conversationManager.loadWorkflowsFromDatabase();
        const totalWorkflows = conversationManager.workflows.size;
        await sendChatwootMessage(conversationId, `🔄 **Comando de Agente Executado**\n\n✅ Workflows recarregados com sucesso! Total de workflows no cache: ${totalWorkflows}`, [], null, accountId);
      } catch (error) {
        console.error('❌ Erro ao recarregar workflows:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao recarregar workflows. Verifique os logs do sistema.', [], null, accountId);
      }
      return;
    }
    
    // Listar workflows
    if (command === '!workflows') {
      console.log(`🔍 Lista de workflows solicitada por agente ${agentId}`);
      try {
        const workflowNames = Array.from(conversationManager.workflows.keys());
        const message = `🔄 **Comando de Agente Executado**\n\n📋 Workflows disponíveis (${workflowNames.length}):\n${workflowNames.map(name => `• ${name}`).join('\n')}`;
        await sendChatwootMessage(conversationId, message, [], null, accountId);
      } catch (error) {
        console.error('❌ Erro ao listar workflows:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao listar workflows. Verifique os logs do sistema.', [], null, accountId);
      }
      return;
    }
    
    // Comando não reconhecido
    console.log(`⚠️ Comando não reconhecido por agente ${agentId}: ${command}`);
    await sendChatwootMessage(conversationId, `🔄 **Comando de Agente**\n\n❌ Comando não reconhecido: ${command}\n\n**Comandos disponíveis para agentes:**\n• !pausebot - Pausar bot\n• !activebot - Reativar bot\n• !reset - Reiniciar fluxo\n• !botstatus - Status do bot\n• !workflows - Listar workflows\n• !reload - Recarregar workflows`, [], null, accountId);
    
  } catch (error) {
    console.error(`❌ Erro ao processar comando de agente ${agentId}:`, error);
    await sendChatwootMessage(conversationId, '❌ Erro ao processar comando. Verifique os logs do sistema.', [], null, accountId);
  }
}

// Processar mensagem do usuário
// Função para verificar se o contato é o EvolutionAPI (contato do sistema)
async function isEvolutionAPIContact(contactId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Buscar informações do contato
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`,
      {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      }
    );
    
    if (response.data && response.data.payload) {
      const contact = response.data.payload;
      const contactName = contact.name || '';
      const phoneNumber = contact.phone_number || '';
      
      // Verificar se é o contato EvolutionAPI pelo nome ou telefone
      const isEvolutionAPI = contactName.toLowerCase().includes('evolutionapi') || 
                            phoneNumber.includes('+123456') ||
                            phoneNumber.includes('123456');
      
      if (isEvolutionAPI) {
        console.log(`🚫 Contato EvolutionAPI detectado: ${contactName} (${phoneNumber})`);
      }
      
      return isEvolutionAPI;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Erro ao verificar se é contato EvolutionAPI:', error);
    return false;
  }
}

async function processUserMessage(contactId, conversationId, userMessage, inboxId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    console.log(`📨 Processando mensagem de ${contactId} (Inbox: ${inboxId}): ${userMessage}`);
    
    // ===== VERIFICAÇÃO DE CONTATO EVOLUTIONAPI =====
    // Verificar se o contato é o EvolutionAPI (contato do sistema)
    const isEvolutionAPI = await isEvolutionAPIContact(contactId, accountId);
    if (isEvolutionAPI) {
      console.log(`🚫 Ignorando mensagem do contato EvolutionAPI (${contactId}): ${userMessage}`);
      return; // Não processar mensagens do EvolutionAPI
    }
    
    // ===== COMANDOS QUE SEMPRE FUNCIONAM (mesmo com bot pausado) =====
    
    // Se o usuário digitar !reset, zera o fluxo
    if (userMessage.trim().toLowerCase() === '!reset') {
      console.log(`🔄 Reset solicitado por ${contactId} para conversa ${conversationId}`);
      
      // Verificar status antes do reset
      const statusBeforeReset = await getBotConversationStatus(conversationId, contactId);
      console.log(`🔍 Status do bot ANTES do reset: bot_active=${statusBeforeReset.bot_active}, paused_reason=${statusBeforeReset.paused_reason}`);
      
      await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contactId]);
      // Limpar registros de debounce para este contato
      await pool.query('DELETE FROM button_debounce WHERE contact_id = $1', [contactId]);
      // Remover todos os labels do contato
      await removeAllLabelsFromContact(contactId, accountId);
      // Remover todos os labels da conversa
      await removeAllLabelsFromConversation(conversationId, accountId);
      
      // Limpar dados do Redis do agente IA (horários sugeridos e informações de agendamento)
      try {
        // Buscar o telefone do contato para limpar dados específicos do Redis
        const contactResponse = await axios.get(
          `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`,
          { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
        );
        
        if (contactResponse.data && contactResponse.data.payload) {
          const phoneNumber = contactResponse.data.payload.phone_number || '';
          
          // Buscar agente IA vinculado ao workflow (se houver)
          const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(accountId, inboxId);
          if (inboxWorkflow && inboxWorkflow.workflow_name) {
            const aiAgent = await getAIAgentByWorkflow(inboxWorkflow.workflow_name);
            if (aiAgent && aiAgent.id) {
              // Limpar horários sugeridos do Redis
              const suggestedTimesKey = `agent:last_suggested_times:${aiAgent.id}:${phoneNumber}`;
              await redis.del(suggestedTimesKey);
              
              // Limpar informações de agendamento do Redis
              const schedulingInfoKey = `agent:last_scheduling_info:${aiAgent.id}`;
              await redis.del(schedulingInfoKey);
              
              console.log(`✅ Dados do Redis limpos para agente IA ${aiAgent.id}`);
            }
          }
        }
      } catch (error) {
        console.error('⚠️ Erro ao limpar dados do Redis:', error.message);
        // Não bloquear o reset se houver erro ao limpar Redis
      }
      
      // Reativar o bot após reset
      console.log(`🔄 Iniciando reativação do bot para conversa ${conversationId}...`);
      const reactivateSuccess = await reactivateBotForConversation(conversationId, contactId, 'user_reset');
      console.log(`🔄 Resultado da reativação após reset: ${reactivateSuccess}`);
      
      // Verificar status do bot após reativação
      const statusAfterReset = await getBotConversationStatus(conversationId, contactId);
      console.log(`🔍 Status do bot APÓS reset: bot_active=${statusAfterReset.bot_active}, paused_reason=${statusAfterReset.paused_reason}, reactivated_at=${statusAfterReset.reactivated_at}`);
      
      await sendChatwootMessage(conversationId, 'Fluxo reiniciado com sucesso! Todos os dados foram limpos (conversas, labels e dados do agente IA). Agora você pode iniciar a conversa novamente. Tente dar um "oi".', [], null, accountId);
      return;
    }
    
    // Reativar bot - DEVE FUNCIONAR MESMO COM BOT PAUSADO
    if (userMessage.trim().toLowerCase() === '!activebot') {
      console.log(`▶️ Comando de reativação do bot solicitado por ${contactId}`);
      const success = await reactivateBotForConversation(conversationId, contactId, contactId);
      if (success) {
        await sendChatwootMessage(conversationId, '▶️ Bot reativado com sucesso! O bot voltará a responder normalmente nesta conversa.', [], null, accountId);
              } else {
          await sendChatwootMessage(conversationId, '❌ Erro ao reativar bot. Tente novamente.', [], null, accountId);
      }
      return;
    }
    
    // Status do bot - DEVE FUNCIONAR MESMO COM BOT PAUSADO
    if (userMessage.trim().toLowerCase() === '!botstatus') {
      console.log(`🔍 Status do bot solicitado por ${contactId}`);
      try {
        const botStatus = await getBotConversationStatus(conversationId, contactId);
        const status = botStatus.bot_active ? '✅ Ativo' : `❌ Pausado (${botStatus.paused_reason})`;
        const agent = botStatus.has_human_agent ? `👤 Agente: ${botStatus.agent_id}` : '🤖 Sem agente humano';
        const message = `🤖 **Status do Bot**\n${status}\n${agent}\n\nComandos disponíveis:\n• !pausebot - Pausar bot\n• !activebot - Reativar bot\n• !reset - Reiniciar fluxo`;
        await sendChatwootMessage(conversationId, message, [], null, accountId);
      } catch (error) {
        console.error('❌ Erro ao obter status do bot:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao obter status do bot.', [], null, accountId);
      }
      return;
    }
    
    // Se o usuário digitar !reload, recarrega workflows do banco
    if (userMessage.trim().toLowerCase() === '!reload') {
      console.log(`🔄 Reload de workflows solicitado por ${contactId}`);
      try {
        await conversationManager.loadWorkflowsFromDatabase();
        const totalWorkflows = conversationManager.workflows.size;
        await sendChatwootMessage(conversationId, `✅ Workflows recarregados com sucesso! Total de workflows no cache: ${totalWorkflows}`, [], null, accountId);
      } catch (error) {
        console.error('❌ Erro ao recarregar workflows:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao recarregar workflows. Verifique os logs do sistema.', [], null, accountId);
      }
      return;
    }
    
    // Se o usuário digitar !workflows, lista workflows disponíveis
    if (userMessage.trim().toLowerCase() === '!workflows') {
      console.log(`🔍 Lista de workflows solicitada por ${contactId}`);
      try {
        const workflowNames = Array.from(conversationManager.workflows.keys());
        const message = `📋 Workflows disponíveis (${workflowNames.length}):\n${workflowNames.map(name => `• ${name}`).join('\n')}`;
        await sendChatwootMessage(conversationId, message, [], null, accountId);
      } catch (error) {
        console.error('❌ Erro ao listar workflows:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao listar workflows. Verifique os logs do sistema.', [], null, accountId);
      }
      return;
    }
    
    // Pausar bot
    if (userMessage.trim().toLowerCase() === '!pausebot') {
      console.log(`⏸️ Comando de pausa do bot solicitado por ${contactId}`);
      const success = await pauseBotForConversation(conversationId, contactId, 'manual_pause', contactId);
      if (success) {
        await sendChatwootMessage(conversationId, '⏸️ Bot pausado com sucesso! O bot não responderá mais nesta conversa até ser reativado com !activebot', [], null, accountId);
      } else {
        await sendChatwootMessage(conversationId, '❌ Erro ao pausar bot. Tente novamente.', [], null, accountId);
      }
      return;
    }
    
    // Comando especial para forçar reativação (debug)
    if (userMessage.trim().toLowerCase() === '!forceactive') {
      console.log(`⚡ Comando FORÇAR reativação solicitado por ${contactId} para conversa ${conversationId}`);
      
      // Forçar limpeza completa do status
      await pool.query(`
        DELETE FROM bot_conversation_status WHERE conversation_id = $1
      `, [conversationId]);
      
      // Recriar status ativo
      const success = await reactivateBotForConversation(conversationId, contactId, 'force_active');
      
      // Verificar resultado
      const status = await getBotConversationStatus(conversationId, contactId);
      
      const message = `⚡ **Reativação Forçada**\n\nResultado: ${success ? '✅ Sucesso' : '❌ Falha'}\nStatus: ${status.bot_active ? 'Ativo' : 'Inativo'}\nRazão: ${status.paused_reason || 'Nenhuma'}`;
      await sendChatwootMessage(conversationId, message, [], null, accountId);
      return;
    }
    
    // ===== VERIFICAÇÃO DE STATUS DO BOT (apenas para mensagens normais) =====
    // NOVA VERIFICAÇÃO: Verificar se o bot deve estar ativo para esta conversa
    const botShouldBeActive = await isBotActiveForConversation(conversationId, contactId, accountId);
    
    if (!botShouldBeActive) {
      console.log(`🚫 Bot desativado para conversa ${conversationId}, ignorando mensagem: ${userMessage}`);
      return;
    }
    
    // Atualizar timestamp da última interação
    try {
      await pool.query(`
        UPDATE bot_conversation_status 
        SET last_interaction_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE conversation_id = $1
      `, [conversationId]);
    } catch (error) {
      console.log(`⚠️ Erro ao atualizar last_interaction_at para conversa ${conversationId}:`, error.message);
    }
    
    // Verificar se é uma conversa existente
    let conversation = await conversationManager.getConversation(contactId);
    
    if (!conversation) {
      // Iniciar nova conversa se for uma mensagem de trigger
      if (await isTriggerMessage(userMessage, inboxId, accountId)) {
        // Buscar o fluxo configurado para esta caixa de entrada específica
        const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(accountId, inboxId);
        
        if (inboxWorkflow) {
          console.log(`🔍 Usando fluxo do banco para inbox ${inboxId}: ${inboxWorkflow.workflow_name}`);
          
          // Verificar se a configuração do workflow é válida
          if (!inboxWorkflow.workflow_config || !inboxWorkflow.workflow_config.blocks) {
            console.error(`❌ Configuração de workflow inválida para ${inboxWorkflow.workflow_name}:`, inboxWorkflow.workflow_config);
            return;
          }
          
          // Adicionar o fluxo do banco ao conversationManager temporariamente
          conversationManager.workflows.set(inboxWorkflow.workflow_name, inboxWorkflow.workflow_config);
          console.log(`✅ Workflow '${inboxWorkflow.workflow_name}' adicionado ao conversationManager`);
          
          try {
          conversation = await conversationManager.startConversation(contactId, inboxWorkflow.workflow_name, {
            conversation_id: conversationId,
            nome: await getContactName(contactId, conversation, accountId)
          }, accountId);
            
            if (!conversation) {
              console.error(`❌ Falha ao criar conversa para contato ${contactId}`);
              return;
            }
          } catch (startError) {
            console.error(`❌ Erro ao iniciar conversa:`, startError.message);
            return;
          }
          
          console.log(`✅ Conversa criada com sucesso:`, conversation);
          
          const workflow = inboxWorkflow.workflow_config;
          
          // Verificar se é workflow de agente IA
          if (workflow.type === 'ai_agent') {
            console.log(`🤖 Workflow de agente IA detectado - processando mensagem de trigger diretamente com agente IA`);
            
            // Para workflows de agente IA, processar a mensagem de trigger diretamente com o agente
            const aiAgent = await getAIAgentByWorkflow(inboxWorkflow.workflow_name);
            
            if (aiAgent) {
              console.log(`🤖 Processando mensagem de trigger com Agente IA: ${aiAgent.name} (ID: ${aiAgent.id})`);
              
              try {
                // Para mensagem de trigger, usar histórico vazio
                const chatHistory = []; // Histórico vazio para mensagem de trigger
                
                console.log(`🤖 Enviando mensagem para agente IA, histórico: ${chatHistory.length} mensagens`);
                
                const aiResponse = await sendMessageToAIAgent(aiAgent.id, userMessage, chatHistory, contactId, accountId);
                
                if (aiResponse && (aiResponse.answer || aiResponse.response)) {
                  // Usar answer se disponível, senão usar response (para compatibilidade)
                  const responseText = aiResponse.answer || aiResponse.response;
                  
                  // Salvar interação usando o ID da conversa do workflow, não do Chatwoot
                  await conversationManager.saveInteraction(conversation.id, contactId, 'ai_agent', userMessage, responseText, []);
                  
                  // Verificar se há arquivo .ics para enviar como anexo
                  if (aiResponse.ics_content && aiResponse.ics_filename) {
                    console.log(`📎 Enviando arquivo .ics: ${aiResponse.ics_filename}`);
                    const icsAttachment = createTempIcsFile(aiResponse.ics_content, aiResponse.ics_filename);
                    if (icsAttachment) {
                      await sendChatwootMessageWithAttachment(conversationId, responseText, [], icsAttachment, 1000, accountId);
                    } else {
                      // Fallback: enviar apenas a mensagem se não conseguir criar o arquivo
                      await sendChatwootMessage(conversationId, responseText, [], null, accountId, inboxId);
                    }
                  } else {
                    // Enviar resposta do agente IA (sem anexo)
                    await sendChatwootMessage(conversationId, responseText, [], null, accountId, inboxId);
                  }
                  
                  console.log(`✅ Resposta do agente IA enviada com sucesso para mensagem de trigger`);
                } else {
                  console.error(`❌ Falha ao obter resposta do agente IA para mensagem de trigger`);
                  await sendChatwootMessage(conversationId, 'Desculpe, não consegui processar sua mensagem no momento. Tente novamente.', [], null, accountId, inboxId);
                }
                
              } catch (error) {
                console.error(`❌ Erro ao processar mensagem de trigger com agente IA:`, error);
                await sendChatwootMessage(conversationId, 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.', [], null, accountId, inboxId);
              }
            } else {
              console.error(`❌ Agente IA não encontrado para workflow: ${inboxWorkflow.workflow_name}`);
              await sendChatwootMessage(conversationId, 'Desculpe, o agente de atendimento não está disponível no momento.', [], null, accountId, inboxId);
            }
            
            return;
          }
          
          const initialBlockName = getInitialBlock(workflow);
          const firstBlock = workflow.blocks[initialBlockName];
          
          if (!firstBlock) {
            console.error(`❌ Bloco inicial '${initialBlockName}' não encontrado no workflow`, Object.keys(workflow.blocks));
            return;
          }
          
          // Aplicar ações do primeiro bloco
          await conversationManager.processBlockActions(firstBlock, conversationId, contactId, accountId);
          
          await sendChatwootMessage(
            conversationId,
            conversationManager.processMessage(firstBlock.message, conversation.data),
            firstBlock.buttons,
            firstBlock.media,
            accountId,
            inboxId
          );
        } else {
          console.log(`🚫 Nenhum fluxo configurado para a caixa de entrada ${inboxId}. Bot não responderá automaticamente.`);
          return;
        }
      }
    } else {
      // Processar resposta na conversa existente
      // VERIFICAÇÃO ADICIONAL: Verificar se a caixa de entrada atual tem fluxo ativo
      const currentInboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(accountId, inboxId);
      if (!currentInboxWorkflow) {
        console.log(`🚫 Conversa existente em caixa sem fluxo ativo (Inbox: ${inboxId}). Bot não responderá automaticamente.`);
        return;
      }
      
      // Verificar se é EvolutionAPI e processar resposta numérica se necessário
      let processedMessage = userMessage;
      try {
        const inboxInfo = await getInboxInfo(accountId, inboxId);
        let isEvolutionAPI = inboxInfo ? isEvolutionAPIInbox(inboxInfo) : false;
        
        // Fallback: detectar Evolution API por IDs conhecidos
        if (!isEvolutionAPI && (inboxId == 26 || inboxId == 27 || inboxId == 28 || inboxId == 30)) {
          console.log(`🔄 Fallback: Caixa ${inboxId} detectada como Evolution API pelo ID (processamento numérico)`);
          isEvolutionAPI = true;
        }
        
        if (isEvolutionAPI) {
          // Buscar o bloco atual para obter os botões
          const conversation = await conversationManager.getConversation(contactId);
          if (conversation) {
            const workflow = conversationManager.workflows.get(conversation.workflow_name) || 
                           await conversationManager.loadWorkflowFromDatabase(conversation.workflow_name);
            
            if (workflow && workflow.blocks[conversation.current_block]) {
              const currentBlock = workflow.blocks[conversation.current_block];
              if (currentBlock.buttons && currentBlock.buttons.length > 0) {
                const numericResponse = processNumericResponse(userMessage, currentBlock.buttons);
                if (numericResponse) {
                  processedMessage = numericResponse;
                  console.log(`🔄 EvolutionAPI: Convertendo resposta "${userMessage}" -> "${numericResponse}"`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao processar resposta numérica:`, error.message);
      }
      
      // ===== VERIFICAR SE HÁ AGENTE IA VINCULADO AO WORKFLOW =====
      const conversation = await conversationManager.getConversation(contactId);
      if (conversation && conversation.workflow_name) {
        const aiAgent = await getAIAgentByWorkflow(conversation.workflow_name);
        
        if (aiAgent) {
          console.log(`🤖 Processando mensagem com Agente IA: ${aiAgent.name} (ID: ${aiAgent.id})`);
          
          try {
            // Obter histórico da conversa para contexto
            const chatHistory = [];
            const interactions = await pool.query(`
              SELECT bot_message, user_response, timestamp 
              FROM workflow_interactions wi
              JOIN workflow_conversations wc ON wi.wf_conversation_id = wc.id
              WHERE wc.contact_id = $1 
              ORDER BY wi.timestamp DESC 
              LIMIT 10
            `, [contactId]);
            
            // Construir histórico (mais recente primeiro, depois inverter)
            for (const interaction of interactions.rows.reverse()) {
              if (interaction.user_response) {
                chatHistory.push({ role: 'user', content: interaction.user_response });
              }
              if (interaction.bot_message) {
                chatHistory.push({ role: 'assistant', content: interaction.bot_message });
              }
            }
            
            // Enviar mensagem para o agente IA
            console.log(`🤖 Enviando mensagem para agente IA, histórico: ${chatHistory.length} mensagens`);
            
            const aiResponse = await sendMessageToAIAgent(aiAgent.id, processedMessage, chatHistory, contactId, accountId);
            
            if (aiResponse && (aiResponse.answer || aiResponse.response)) {
              // Usar answer se disponível, senão usar response (para compatibilidade)
              const responseText = aiResponse.answer || aiResponse.response;
              
              // Verificar se deve transferir para atendimento humano
              if (aiResponse.should_transfer) {
                console.log(`🔄 Agente IA detectou necessidade de transferência: ${aiResponse.transfer_reason}`);
                
                // Pausar bot e transferir para atendimento humano
                await pauseBotForConversation(conversationId, contactId, 'ai_agent_transfer', 'ai_agent');
                
                // Atribuir conversa a um agente disponível (se houver)
                await assignConversationToAvailableAgent(conversationId, accountId);
                
                // Enviar mensagem informativa
                await sendChatwootMessage(
                  conversationId,
                  `👤 **Transferência para Atendimento Humano**\n\n` +
                  `Detectei que você precisa de atendimento humano: ${aiResponse.transfer_reason}\n\n` +
                  `Um de nossos atendentes entrará em contato em breve para ajudá-lo melhor.\n\n`,
                  [], null, accountId, inboxId
                );
                //+
                //  `📞 **Resposta do assistente:** ${aiResponse.response}`
                
                return; // Sair sem salvar interação normal
              }
              
              // Salvar interação normal
                await conversationManager.saveInteraction(
                conversation.id, // Usar ID da tabela workflow_conversations, não do Chatwoot
                contactId, 
                'ai_agent_response', 
                processedMessage, 
                responseText
              );
              
              // Verificar se há arquivo .ics para enviar como anexo
              if (aiResponse.ics_content && aiResponse.ics_filename) {
                console.log(`📎 Enviando arquivo .ics: ${aiResponse.ics_filename}`);
                const icsAttachment = createTempIcsFile(aiResponse.ics_content, aiResponse.ics_filename);
                if (icsAttachment) {
                  await sendChatwootMessageWithAttachment(conversationId, responseText, [], icsAttachment, 1000, accountId);
                } else {
                  // Fallback: enviar apenas a mensagem se não conseguir criar o arquivo
                  await sendChatwootMessage(conversationId, responseText, [], null, accountId, inboxId);
                }
              } else {
                // Enviar resposta do agente IA (sem anexo)
                await sendChatwootMessage(conversationId, responseText, [], null, accountId, inboxId);
              }
              return;
            } else {
              console.error('❌ Resposta inválida do agente IA:', aiResponse);
              await sendChatwootMessage(conversationId, '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.', [], null, accountId);
              return;
            }
          } catch (error) {
            console.error('❌ Erro ao processar mensagem com agente IA:', error);
            await sendChatwootMessage(conversationId, '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.', [], null, accountId);
            return;
          }
        }
      }
      
      // ===== PROCESSAMENTO NORMAL DO WORKFLOW =====
      const result = await conversationManager.processResponse(contactId, processedMessage, accountId);
      
      if (result && result.type) {
      if (result.type === 'next_block') {
        await sendChatwootMessage(conversationId, result.message, result.block.buttons, result.block.media, accountId, inboxId);
      } else if (result.type === 'finalized') {
        await sendChatwootMessage(conversationId, result.message, [], null, accountId, inboxId);
        await conversationManager.finalizeConversation(contactId);
      } else if (result.type === 'invalid_response') {
        let workflow = conversationManager.workflows.get(conversation.workflow_name);
        
        // Se não encontrar o workflow, tentar buscar no banco
        if (!workflow) {
          console.log(`🔍 Carregando workflow '${conversation.workflow_name}' do banco para resposta inválida...`);
          workflow = await conversationManager.loadWorkflowFromDatabase(conversation.workflow_name);
        }
        
        if (workflow) {
          const currentBlock = workflow.blocks[conversation.current_block];
          await sendChatwootMessage(conversationId, result.message, currentBlock.buttons, currentBlock.media, accountId, inboxId);
        } else {
          console.error(`❌ Não foi possível encontrar workflow '${conversation.workflow_name}' para resposta inválida`);
        }
        }
      } else {
        console.warn(`⚠️ processResponse retornou null/undefined para contato ${contactId} com mensagem: ${userMessage}`);
        console.log('Debug - conversation object:', conversation);
        
        // Tentar recuperar informações para debug
        if (conversation) {
          console.log(`🔍 Workflow name: ${conversation.workflow_name}`);
          console.log(`🔍 Current block: ${conversation.current_block}`);
          
          let workflow = conversationManager.workflows.get(conversation.workflow_name);
          
          // Se não encontrar, tentar carregar do banco
          if (!workflow) {
            console.log(`🔍 Tentando carregar workflow '${conversation.workflow_name}' do banco...`);
            workflow = await conversationManager.loadWorkflowFromDatabase(conversation.workflow_name);
          }
          
          if (!workflow) {
            console.error(`❌ Workflow '${conversation.workflow_name}' não encontrado! Workflows disponíveis no cache:`, 
              Array.from(conversationManager.workflows.keys()));
            
            // Listar também workflows do banco para debug
            try {
              const bankWorkflows = await pool.query('SELECT workflow_name FROM inbox_workflows UNION SELECT workflow_name FROM workflow_configs');
              console.error(`❌ Workflows disponíveis no banco:`, bankWorkflows.rows.map(r => r.workflow_name));
            } catch (err) {
              console.error(`❌ Erro ao listar workflows do banco:`, err.message);
            }
          } else {
            console.log(`✅ Workflow encontrado, blocos disponíveis:`, Object.keys(workflow.blocks));
            if (!workflow.blocks[conversation.current_block]) {
              console.error(`❌ Bloco '${conversation.current_block}' não encontrado no workflow!`);
            }
          }
        } else {
          console.error(`❌ Conversa não encontrada para contato ${contactId}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem do usuário:', error);
  }
}

// Enviar mensagem para o Chatwoot
async function sendChatwootMessage(conversationId, message, buttons = [], mediaContent = null, accountId = CHATWOOT_ACCOUNT_ID, inboxId = null) {
  try {
    // Se houver anexo direto via file_id, baixar arquivo e enviar via multipart/form-data
    if (mediaContent && mediaContent.attachment && mediaContent.attachment.file_id) {
      const fileResult = await pool.query('SELECT * FROM media_files WHERE id = $1 AND is_active = true', [mediaContent.attachment.file_id]);
      
      if (fileResult.rows.length > 0) {
        const file = fileResult.rows[0];
        
        console.log(`📁 Arquivo encontrado: ${file.original_name} (ID: ${file.id})`);
        console.log(`🎯 Enviando via multipart/form-data (método que funciona)`);
        
        // Extrair delay customizável do mediaContent (padrão: 3 segundos para vídeos)
        const customDelay = mediaContent.delay || (file.mimetype.startsWith('video/') ? 3000 : 1000);
        console.log(`⏰ Delay configurado: ${customDelay}ms`);
        
        // ✅ ABORDAGEM CORRETA: Baixar arquivo da URL pública e enviar via multipart/form-data
        return await sendChatwootMessageWithFileDownload(conversationId, message, buttons, file, customDelay, accountId);
      } else {
        console.error(`❌ Arquivo não encontrado: ${mediaContent.attachment.file_id}`);
        // Continuar com envio normal da mensagem
      }
    }
    
    // Se houver anexo direto (arquivo local), enviar como anexo
    if (mediaContent && mediaContent.attachment && mediaContent.attachment.path) {
      return await sendChatwootMessageWithAttachment(conversationId, message, buttons, mediaContent.attachment, 1000, accountId);
    }
    
    // ESPECIAL: Vídeo do YouTube - enviar thumbnail + link para melhor visualização no WhatsApp
    if (mediaContent && mediaContent.type === 'video' && mediaContent.url) {
      const videoId = extractYouTubeVideoId(mediaContent.url);
      if (videoId) {
        console.log(`🎬 Detectado vídeo do YouTube: ${videoId}, enviando com thumbnail otimizado para WhatsApp`);
        return await sendYouTubeVideoWithThumbnail(conversationId, message, buttons, mediaContent, videoId, accountId);
      }
    }
    
    // Detectar tipo de caixa para adaptar formato dos botões
    let isEvolutionAPI = false;
    let inboxInfo = null;
    
    if (inboxId && buttons && buttons.length > 0) {
      try {
        inboxInfo = await getInboxInfo(accountId, inboxId);
        isEvolutionAPI = inboxInfo ? isEvolutionAPIInbox(inboxInfo) : false;
        
        // Fallback: detectar Evolution API por IDs conhecidos
        if (!isEvolutionAPI && (inboxId == 26 || inboxId == 27 || inboxId == 28 || inboxId == 30)) {
          console.log(`🔄 Fallback: Caixa ${inboxId} detectada como Evolution API pelo ID`);
          isEvolutionAPI = true;
        }
        
        if (isEvolutionAPI) {
          console.log(`🔄 Caixa Evolution API detectada: ${inboxInfo.name} - Convertendo botões para lista numerada`);
        } else {
          console.log(`📱 Caixa WhatsApp API detectada: ${inboxInfo?.name || 'Desconhecida'} - Mantendo botões interativos`);
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao detectar tipo da caixa ${inboxId}:`, error.message);
      }
    }
    
    // Se for EvolutionAPI e houver botões, converter para lista numerada
    const finalMessage = isEvolutionAPI && buttons && buttons.length > 0 
      ? formatButtonsAsNumberedList(message, buttons)
      : message;
    
    const payload = {
      content: finalMessage,
      message_type: 'outgoing'  // outgoing message
    };
    
    // Se houver conteúdo de mídia (vídeo, imagem), criar card com mídia
    if (mediaContent && mediaContent.type && mediaContent.url) {
      payload.content_type = 'cards';
      payload.content_attributes = {
        items: [{
          media_url: mediaContent.url,
          title: mediaContent.title || 'Mídia',
          description: mediaContent.description || finalMessage,
          actions: (!isEvolutionAPI && buttons && buttons.length > 0) ? buttons.map(button => ({
            type: 'postback',
            text: button.text,
            payload: button.text
          })) : []
        }]
    };
    } 
    // Se houver botões mas sem mídia e não for EvolutionAPI, criar mensagem com botões
    else if (buttons && buttons.length > 0 && !isEvolutionAPI) {
      payload.content_type = 'input_select';
      payload.content_attributes = {
        items: buttons.map((button, index) => ({
          title: button.text,
          value: button.text
        }))
      };
    }

    console.log(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`);
    
    await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, payload, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    const mediaInfo = mediaContent ? ` (${mediaContent.type}: ${mediaContent.url})` : '';
    console.log(`✅ Mensagem enviada para conversa ${conversationId}: ${message}${mediaInfo}`);
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem para Chatwoot:', error);
    if (error.response) {
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
      console.error('   Status:', error.response.status);
    }
  }
}

// Extrair ID do vídeo do YouTube de diferentes formatos de URL
function extractYouTubeVideoId(url) {
  const regexes = [
    // youtube.com/watch?v=ID (pode ter outros parâmetros)
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*[&?]v=([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\n?#]+)/,
    // youtu.be/ID (formato curto)
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^&\n?#\?]+)/,
    // youtube.com/embed/ID
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&\n?#]+)/,
    // youtube.com/v/ID
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^&\n?#]+)/
  ];
  
  for (const regex of regexes) {
    const match = url.match(regex);
    if (match && match[1]) {
      return match[1].split('&')[0]; // Remove parâmetros adicionais
    }
  }
  
  return null;
}

// Enviar vídeo do YouTube com thumbnail para WhatsApp
async function sendYouTubeVideoWithThumbnail(conversationId, message, buttons, mediaContent, videoId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // 1. Enviar mensagem de texto primeiro
    if (message) {
      const textPayload = {
        content: message,
        message_type: 'outgoing'
      };
      
      await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, textPayload, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 2. Baixar thumbnail do YouTube
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    console.log(`📸 Baixando thumbnail: ${thumbnailUrl}`);
    
    const thumbnailResponse = await axios.get(thumbnailUrl, { 
      responseType: 'stream',
      timeout: 10000 
    });
    
    // 3. Salvar thumbnail temporariamente
    const tempThumbnailPath = path.join(__dirname, 'uploads', `thumb_${videoId}_${Date.now()}.jpg`);
    const writer = fs.createWriteStream(tempThumbnailPath);
    thumbnailResponse.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    console.log(`✅ Thumbnail salvo: ${tempThumbnailPath}`);
    
    // 4. Enviar thumbnail como imagem
    const formData = new FormData();
    formData.append('attachments[]', fs.createReadStream(tempThumbnailPath), {
      filename: `youtube_thumbnail_${videoId}.jpg`,
      contentType: 'image/jpeg'
    });
    
    const thumbnailText = `🎬 ${mediaContent.title || 'Vídeo do YouTube'}`;
    formData.append('content', thumbnailText);
    formData.append('message_type', 'outgoing');
    
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      formData,
      {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          ...formData.getHeaders()
        }
      }
    );
    
    console.log(`✅ Thumbnail enviado para conversa ${conversationId}`);
    
    // 5. Enviar link do vídeo
    let linkMessage = `🔗 Assista ao vídeo: ${mediaContent.url}`;
    if (mediaContent.description) {
      linkMessage += `\n\n${mediaContent.description}`;
    }
    
    const linkPayload = {
      content: linkMessage,
      message_type: 'outgoing'
    };
    
    await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, linkPayload, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Link do vídeo enviado para conversa ${conversationId}`);
    
    // 6. Enviar botões se houver
    if (buttons && buttons.length > 0) {
      const buttonPayload = {
        content: 'Escolha uma opção:',
        content_type: 'input_select',
        content_attributes: {
          items: buttons.map((button, index) => ({
            title: button.text,
            value: button.text
          }))
        },
        message_type: 'outgoing'
      };
      
      await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, buttonPayload, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Botões enviados para conversa ${conversationId}`);
    }
    
    // 7. Limpar arquivo temporário
    setTimeout(() => {
      fs.unlink(tempThumbnailPath, (err) => {
        if (err) console.error('Erro ao limpar thumbnail temporário:', err);
        else console.log(`🗑️ Thumbnail temporário removido: ${tempThumbnailPath}`);
      });
    }, 5000); // Aguardar 5 segundos antes de limpar
    
  } catch (error) {
    console.error('❌ Erro ao enviar vídeo do YouTube com thumbnail:', error);
    
    // Fallback: enviar apenas como link normal
    console.log('🔄 Tentando fallback com envio normal...');
    const fallbackPayload = {
      content: `${message}\n\n🎬 ${mediaContent.title || 'Vídeo'}: ${mediaContent.url}`,
      message_type: 'outgoing'
    };
    
    if (buttons && buttons.length > 0) {
      fallbackPayload.content_type = 'input_select';
      fallbackPayload.content_attributes = {
        items: buttons.map((button, index) => ({
          title: button.text,
          value: button.text
        }))
      };
    }
    
    await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, fallbackPayload, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });
  }
}

// Validar arquivo para API oficial do WhatsApp
function validateWhatsAppMedia(attachment) {
  const stats = fs.statSync(attachment.path);
  const fileSizeInMB = stats.size / (1024 * 1024);
  
  console.log(`🔍 Validando arquivo: ${attachment.originalname}`);
  console.log(`📏 Tamanho: ${fileSizeInMB.toFixed(2)}MB, Tipo: ${attachment.mimetype}`);
  
  // Limites da API oficial do WhatsApp
  const limits = {
    'image': { maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png'] },
    'video': { maxSizeMB: 16, allowedTypes: ['video/mp4', 'video/3gpp'] },
    'audio': { maxSizeMB: 16, allowedTypes: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'] },
    'document': { maxSizeMB: 100, allowedTypes: [] } // documentos aceitam qualquer MIME type
  };
  
  let mediaType = 'document'; // padrão
  if (attachment.mimetype) {
    if (attachment.mimetype.startsWith('image/')) mediaType = 'image';
    else if (attachment.mimetype.startsWith('video/')) mediaType = 'video';
    else if (attachment.mimetype.startsWith('audio/')) mediaType = 'audio';
  }
  
  const limit = limits[mediaType];
  
  // Verificar tamanho
  if (fileSizeInMB > limit.maxSizeMB) {
    throw new Error(`❌ Arquivo muito grande: ${fileSizeInMB.toFixed(2)}MB (máximo: ${limit.maxSizeMB}MB para ${mediaType})`);
  }
  
  // Verificar tipo MIME (exceto documentos que aceitam qualquer tipo)
  if (limit.allowedTypes.length > 0 && !limit.allowedTypes.includes(attachment.mimetype)) {
    throw new Error(`❌ Tipo de arquivo não suportado: ${attachment.mimetype} (tipos permitidos para ${mediaType}: ${limit.allowedTypes.join(', ')})`);
  }
  
  console.log(`✅ Arquivo válido para WhatsApp API: ${mediaType}, ${fileSizeInMB.toFixed(2)}MB`);
  return { mediaType, fileSizeInMB };
}

// Enviar mensagem baixando arquivo via URL pública e usando multipart/form-data
async function sendChatwootMessageWithFileDownload(conversationId, message, buttons = [], file, buttonDelay = 1000, accountId = CHATWOOT_ACCOUNT_ID) {
  // Declarar tempFilePath fora do try para ter acesso no catch
  const baseUrl = process.env.BASE_URL || process.env.CHATWOOT_BASE_URL?.replace('crm.', 'workflows.') || 'https://workflows.inovaianalytics.com.br';
  const publicUrl = `${baseUrl}/public-preview/${file.id}`;
  const tempFilePath = path.join(__dirname, 'uploads', `temp_${file.id}_${Date.now()}.${path.extname(file.original_name)}`);
  
  try {
    console.log(`🔗 URL do arquivo: ${publicUrl}`);
    console.log(`📁 Arquivo temporário: ${tempFilePath}`);
    
    // 1. Verificar se URL está acessível
    console.log('🔍 Verificando se URL está acessível...');
    try {
      const headResponse = await axios.head(publicUrl);
      console.log(`✅ URL acessível! Status: ${headResponse.status}`);
      console.log(`📹 Tipo: ${headResponse.headers['content-type']}`);
      console.log(`📏 Tamanho: ${(headResponse.headers['content-length'] / 1024 / 1024).toFixed(2)}MB`);
    } catch (urlError) {
      console.error(`❌ URL não acessível: ${urlError.message}`);
      throw new Error(`URL pública não acessível: ${publicUrl}`);
    }
    
    // 2. Baixar o arquivo para arquivo temporário
    console.log('⬇️ Baixando arquivo...');
    const downloadResponse = await axios.get(publicUrl, {
      responseType: 'stream',
      timeout: 30000 // 30 segundos timeout
    });
    
    // Criar diretório se não existir
    const uploadsDir = path.dirname(tempFilePath);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const writer = fs.createWriteStream(tempFilePath);
    downloadResponse.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    const fileStats = fs.statSync(tempFilePath);
    console.log(`✅ Arquivo baixado: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB`);
    
    // 3. Criar objeto de attachment para a função existente
    const attachment = {
      path: tempFilePath,
      originalname: file.original_name,
      mimetype: file.mimetype,
      temporary: true // Marcar para limpeza automática
    };
    
    // 4. Enviar via multipart/form-data usando função existente
    console.log('🚀 Enviando via multipart/form-data...');
    const result = await sendChatwootMessageWithAttachment(conversationId, message, buttons, attachment, buttonDelay, accountId);
    
    // 5. Limpar arquivo temporário
    console.log('🧹 Limpando arquivo temporário...');
    fs.unlink(tempFilePath, (err) => {
      if (err) console.error('Erro ao limpar arquivo temporário:', err);
      else console.log('✅ Arquivo temporário removido');
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Erro ao enviar arquivo via download:', error.message);
    
    // Limpar arquivo temporário em caso de erro
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlink(tempFilePath, (err) => {
        if (err) console.error('Erro ao limpar arquivo temporário após erro:', err);
        else console.log('🧹 Arquivo temporário removido após erro');
      });
    }
    
    throw error;
  }
}

// Enviar mensagem com anexo para o Chatwoot
async function sendChatwootMessageWithAttachment(conversationId, message, buttons = [], attachment, buttonDelay = 1000, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    console.log(`📎 Enviando mensagem com anexo: ${attachment.originalname}`);
    
    // Verificar se o arquivo existe antes de tentar enviar
    if (!fs.existsSync(attachment.path)) {
      throw new Error(`Arquivo não encontrado: ${attachment.path}`);
    }
    
    // Validar arquivo para API do WhatsApp
    const validation = validateWhatsAppMedia(attachment);
    console.log(`🎯 Tipo detectado: ${validation.mediaType}`);
    
    // Avisar se o arquivo pode ter problemas específicos
    if (validation.mediaType === 'video' && validation.fileSizeInMB > 10) {
      console.log(`⚠️  AVISO: Vídeo com ${validation.fileSizeInMB.toFixed(2)}MB pode ser rejeitado pelo WhatsApp (recomendado: <10MB)`);
    }
    
    // Preparar FormData para o anexo (seguindo padrão oficial do curl)
    const formData = new FormData();
    
    // 1. Adicionar o arquivo
    console.log(`📎 Tentando enviar anexo: ${attachment.path}`);
    console.log(`📄 Nome original: ${attachment.originalname}, Tipo: ${attachment.mimetype}`);
    
    formData.append('attachments[]', fs.createReadStream(attachment.path), {
      filename: attachment.originalname,
      contentType: attachment.mimetype
    });
    
    // 2. Adicionar conteúdo da mensagem (conforme padrão oficial do curl)
    formData.append('content', message || '📎 Arquivo anexado');
    
    // 3. Adicionar tipo da mensagem (outgoing para bot)
    formData.append('message_type', 'outgoing');
    
    // 4. Adicionar tipo do arquivo (usar validação já feita)
    const fileType = validation.mediaType === 'document' ? 'file' : validation.mediaType;
    formData.append('file_type', fileType);
    
    // Enviar anexo (seguindo padrão oficial do Chatwoot)
    console.log(`🚀 Enviando para: ${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`);
    console.log(`📝 Dados: content="${message || '📎 Arquivo anexado'}", message_type="outgoing", file_type="${fileType}"`);
    
    // Debug dos headers para verificar Content-Type com boundary
    const headers = {
      'api_access_token': CHATWOOT_API_TOKEN,
      ...formData.getHeaders()
    };
    console.log(`📋 Headers sendo enviados:`, {
      'Content-Type': headers['content-type'],
      'api_access_token': headers['api_access_token'] ? '[TOKEN_PRESENTE]' : '[TOKEN_AUSENTE]'
    });
    
    const response = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      formData,
      {
        headers
      }
    );
    
    console.log(`✅ Anexo enviado com sucesso! Status: ${response.status}`);
    
    // Enviar botões como mensagem separada se houver
    if (buttons && buttons.length > 0) {
      // Aguardar delay customizável antes de enviar os botões
      console.log(`⏰ Aguardando ${buttonDelay}ms antes de enviar botões...`);
      await new Promise(resolve => setTimeout(resolve, buttonDelay));
      
      // 🔄 DETECTAR TIPO DE CAIXA PARA ADAPTAR BOTÕES (igual função principal)
      let isEvolutionAPI = false;
      let inboxInfo = null;
      
      try {
        // Buscar informações da caixa da conversa
        const convResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN }
        });
        
        const inboxId = convResponse.data.inbox_id;
        if (inboxId) {
          inboxInfo = await getInboxInfo(accountId, inboxId);
          isEvolutionAPI = inboxInfo ? isEvolutionAPIInbox(inboxInfo) : false;
          
          // Fallback: detectar Evolution API por IDs conhecidos
          if (!isEvolutionAPI && (inboxId == 26 || inboxId == 27 || inboxId == 28 || inboxId == 30)) {
            console.log(`🔄 Fallback: Caixa ${inboxId} detectada como Evolution API pelo ID (mídia com botões)`);
            isEvolutionAPI = true;
          }
        }
      } catch (error) {
        console.error('❌ Erro ao detectar tipo de caixa para botões pós-mídia:', error.message);
      }
      
      if (isEvolutionAPI) {
        // 🔄 Evolution API: Enviar lista numerada
        console.log(`🔄 Caixa Evolution API detectada - Enviando botões como lista numerada`);
        const numberedList = formatButtonsAsNumberedList('Escolha uma opção:', buttons);
        
        const textPayload = {
          content: numberedList,
          message_type: 'outgoing'
        };
        
        await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, textPayload, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN }
        });
        
        console.log(`✅ Lista numerada enviada após mídia para Evolution API`);
      } else {
        // 📱 WhatsApp API: Enviar botões interativos
        console.log(`📱 Caixa WhatsApp API detectada - Enviando botões interativos`);
        const buttonPayload = {
          content: 'Escolha uma opção:',
          content_type: 'input_select',
          content_attributes: {
            items: buttons.map((button, index) => ({
              title: button.text,
              value: button.text
            }))
          },
          message_type: 'outgoing'
        };
        
        await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, buttonPayload, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`✅ Botões interativos enviados após mídia para WhatsApp API`);
      }
    }
    
    console.log(`✅ Anexo enviado para conversa ${conversationId}: ${attachment.originalname}`);
    
    // Limpar arquivo temporário apenas se não for de mídia persistente
    if (attachment.temporary !== false) {
      fs.unlink(attachment.path, () => {});
    }
    
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem com anexo:', error.message);
    
    // Tratamento específico para erro da API do WhatsApp
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.error(`🔍 Status HTTP: ${status}`);
      console.error(`📋 Resposta:`, JSON.stringify(data, null, 2));
      
      // Erro 131053 é específico da API do WhatsApp
      if (data && JSON.stringify(data).includes('131053')) {
        console.error(`❌ ERRO 131053: Arquivo rejeitado pela API oficial do WhatsApp. 
Possíveis causas:
• Arquivo muito grande (máximo 16MB para vídeos)
• Codec não suportado (use H.264+AAC para vídeos)
• Formato não suportado (use MP4 para vídeos)
• Arquivo corrompido ou inválido
Arquivo: ${attachment.originalname}`);
      }
    } else {
      console.error('❌ Erro sem resposta HTTP:', error);
    }
    
    // Limpar arquivo temporário em caso de erro (apenas se for temporário)
    if (attachment.path && attachment.temporary !== false) {
      fs.unlink(attachment.path, () => {});
    }
    
    throw error;
  }
}

// Enviar mensagem com anexo via URL pública para o Chatwoot
async function sendChatwootMessageWithAttachmentUrl(conversationId, message, buttons = [], attachmentInfo, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    console.log(`📎 Enviando mensagem com anexo via URL pública: ${attachmentInfo.originalname}`);
    console.log(`🌐 URL: ${attachmentInfo.url}`);
    
    // Criar card com mídia para o Chatwoot
    const payload = {
      content: message || '📎 Arquivo anexado',
      message_type: 'outgoing',
      content_type: 'cards',
      content_attributes: {
        items: [{
          media_url: attachmentInfo.url,
          title: attachmentInfo.originalname || 'Arquivo',
          description: `📁 ${attachmentInfo.mimetype} | ID: ${attachmentInfo.file_id}`,
          actions: buttons && buttons.length > 0 ? buttons.map(button => ({
            type: 'postback',
            text: button.text,
            payload: button.text
          })) : []
        }]
      }
    };
    
    console.log(`🚀 Enviando card com mídia para: ${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`);
    
    const response = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      payload,
      {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Card com mídia enviado com sucesso! Status: ${response.status}`);
    console.log(`✅ Arquivo enviado via URL para conversa ${conversationId}: ${attachmentInfo.originalname}`);
    
    return response;
    
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem com anexo via URL:', error.message);
    
    // Tratamento específico para erro da API
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.error(`🔍 Status HTTP: ${status}`);
      console.error(`📋 Resposta:`, JSON.stringify(data, null, 2));
      
      // Se der erro com URL, tentar fallback para método original
      if (status >= 400) {
        console.log(`⚠️ Tentando fallback para método de arquivo local...`);
        
        // Buscar arquivo novamente para método original
        const fileResult = await pool.query('SELECT * FROM media_files WHERE id = $1 AND is_active = true', [attachmentInfo.file_id]);
        
        if (fileResult.rows.length > 0) {
          const file = fileResult.rows[0];
          const attachment = {
            path: path.join(__dirname, file.file_path),
            originalname: file.original_name,
            mimetype: file.mimetype,
            temporary: false
          };
          
          console.log(`🔄 Tentando envio via arquivo local como fallback...`);
          return await sendChatwootMessageWithAttachment(conversationId, message, buttons, attachment, accountId);
        }
      }
    }
    
    throw error;
  }
}

// Verificar se é mensagem de trigger baseada no workflow da caixa de entrada
async function isTriggerMessage(message, inboxId = null, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Se não temos inbox específico, usar triggers padrão
    if (!inboxId) {
      const defaultTriggers = ['oi', 'ola', 'olá', 'hello', 'start', 'iniciar', 'boa tarde', 'boa noite', 'bom dia', 'tarde', 'noite', 'dia'];
      return defaultTriggers.some(trigger => 
        message.toLowerCase().includes(trigger)
      );
    }
    
    // Buscar workflow específico da caixa de entrada
    const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(accountId, inboxId);
    
    if (inboxWorkflow && inboxWorkflow.workflow_config) {
      // Se for workflow de agente IA, aceitar qualquer mensagem como trigger
      if (inboxWorkflow.workflow_config.type === 'ai_agent') {
        console.log(`🤖 Workflow de agente IA detectado para inbox ${inboxId} - qualquer mensagem aceita como trigger`);
        return true;
      }
      
      // Para workflows normais, verificar triggers configurados
      if (inboxWorkflow.workflow_config.triggers) {
        const triggers = inboxWorkflow.workflow_config.triggers;
        
        // Se o trigger é "*", aceitar qualquer mensagem
        if (triggers.includes('*')) {
          console.log(`🌟 Trigger universal (*) detectado para inbox ${inboxId} - qualquer mensagem aceita`);
          return true;
        }
        
        // Verificar se a mensagem contém algum dos triggers definidos
        const messageMatch = triggers.some(trigger => 
          message.toLowerCase().includes(trigger.toLowerCase())
        );
        
        if (messageMatch) {
          console.log(`✅ Trigger encontrado para inbox ${inboxId}: mensagem "${message}" contém um dos triggers: [${triggers.join(', ')}]`);
        }
        
        return messageMatch;
      }
    }
    
    // Fallback para triggers padrão se não encontrar workflow
    console.log(`⚠️ Workflow não encontrado para inbox ${inboxId}, usando triggers padrão`);
    const defaultTriggers = ['oi', 'ola', 'olá', 'hello', 'start', 'iniciar', 'boa tarde', 'boa noite', 'bom dia', 'tarde', 'noite', 'dia'];
    return defaultTriggers.some(trigger => 
      message.toLowerCase().includes(trigger)
    );
    
  } catch (error) {
    console.error(`❌ Erro ao verificar trigger para inbox ${inboxId}:`, error);
    // Em caso de erro, usar triggers padrão
    const defaultTriggers = ['oi', 'ola', 'olá', 'hello', 'start', 'iniciar', 'boa tarde', 'boa noite', 'bom dia', 'tarde', 'noite', 'dia'];
    return defaultTriggers.some(trigger => 
      message.toLowerCase().includes(trigger)
    );
  }
}

// Buscar contato pelo telefone para obter o ID interno
/**
 * Busca o ID de um contato pelo número de telefone usando o endpoint de busca otimizado do Chatwoot
 * 
 * Melhorias implementadas:
 * - Usa o endpoint específico /contacts/search para busca mais eficiente
 * - Implementa fallback para o endpoint tradicional caso o de busca não esteja disponível
 * - Ordenação por última atividade para priorizar contatos mais recentes
 * - Melhor tratamento de diferentes formatos de telefone
 * - Logs mais detalhados para debugging
 * - Correspondência mais robusta de números de telefone
 * 
 * @param {string} phoneNumber - Número de telefone para buscar
 * @param {number|null} accountId - ID da conta específica (opcional)
 * @returns {number|null} - ID do contato encontrado ou null
 */
async function getContactIdByPhone(phoneNumber, accountId = null) {
  try {
    console.log(`🔍 Buscando contato por telefone: ${phoneNumber}${accountId ? ` na conta ${accountId}` : ''}`);
    
    // Normalizar o número de telefone para busca
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    console.log(`📱 Número normalizado para busca: ${normalizedPhone}`);
    
    // Função auxiliar para buscar em uma conta específica usando o endpoint de busca
    async function searchInAccount(account, searchPhone) {
      try {
        console.log(`🔍 Buscando na conta: ${account.name} (ID: ${account.id})`);
        
        // Usar o endpoint específico de busca de contatos
        const response = await axios.get(
          `${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts/search`,
          {
            headers: { 'api_access_token': CHATWOOT_API_TOKEN },
            params: { 
              q: searchPhone,
              sort: '-last_activity_at' // Ordenar por última atividade (mais recente primeiro)
            }
          }
        );
        
        if (response.data.payload && response.data.payload.length > 0) {
          console.log(`📊 Encontrados ${response.data.payload.length} contatos na busca`);
          
          // Procurar contato que tenha o telefone correspondente
          const contact = response.data.payload.find(c => {
            if (!c.phone_number) return false;
            
            // Comparar removendo caracteres especiais
            const contactPhone = c.phone_number.replace(/\D/g, '');
            const searchPhoneClean = searchPhone.replace(/\D/g, '');
            
            // Verificar correspondência exata ou parcial
            const isExactMatch = contactPhone === searchPhoneClean;
            const isEndsWith = contactPhone.endsWith(searchPhoneClean) || searchPhoneClean.endsWith(contactPhone);
            const isIncludes = contactPhone.includes(searchPhoneClean) || searchPhoneClean.includes(contactPhone);
            
            if (isExactMatch || isEndsWith || isIncludes) {
              console.log(`🔍 Correspondência encontrada: ${contactPhone} vs ${searchPhoneClean}`);
              return true;
            }
            
            return false;
          });
          
          if (contact && contact.id) {
            console.log(`✅ Contato encontrado na conta ${account.name}! ID: ${contact.id}, Telefone: ${contact.phone_number}, Nome: ${contact.name || 'N/A'}`);
            return contact.id;
          }
        }
        
        console.log(`⚠️ Nenhum contato encontrado na conta ${account.name} para: ${searchPhone}`);
        return null;
        
      } catch (searchError) {
        if (searchError.response?.status === 404) {
          console.log(`⚠️ Endpoint de busca não disponível na conta ${account.name}, tentando endpoint tradicional...`);
          // Fallback para o endpoint tradicional
          return await searchInAccountFallback(account, searchPhone);
        } else {
          console.log(`⚠️ Erro ao buscar na conta ${account.name}:`, searchError.response?.status || searchError.message);
        }
        return null;
      }
    }
    
    // Função de fallback usando o endpoint tradicional
    async function searchInAccountFallback(account, searchPhone) {
      try {
        console.log(`🔄 Usando fallback para busca na conta: ${account.name}`);
        
        const response = await axios.get(
          `${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts`,
          {
            headers: { 'api_access_token': CHATWOOT_API_TOKEN },
            params: { q: searchPhone }
          }
        );
        
        if (response.data.payload && response.data.payload.length > 0) {
          console.log(`📊 Encontrados ${response.data.payload.length} contatos no fallback`);
          
          // Procurar contato que tenha o telefone correspondente
          const contact = response.data.payload.find(c => {
            if (!c.phone_number) return false;
            
            // Comparar removendo caracteres especiais
            const contactPhone = c.phone_number.replace(/\D/g, '');
            const searchPhoneClean = searchPhone.replace(/\D/g, '');
            
            // Verificar correspondência exata ou parcial
            const isExactMatch = contactPhone === searchPhoneClean;
            const isEndsWith = contactPhone.endsWith(searchPhoneClean) || searchPhoneClean.endsWith(contactPhone);
            const isIncludes = contactPhone.includes(searchPhoneClean) || searchPhoneClean.includes(contactPhone);
            
            if (isExactMatch || isEndsWith || isIncludes) {
              console.log(`🔍 Correspondência encontrada (fallback): ${contactPhone} vs ${searchPhoneClean}`);
              return true;
            }
            
            return false;
          });
          
          if (contact && contact.id) {
            console.log(`✅ Contato encontrado via fallback na conta ${account.name}! ID: ${contact.id}, Telefone: ${contact.phone_number}, Nome: ${contact.name || 'N/A'}`);
            return contact.id;
          }
        }
        
        console.log(`⚠️ Nenhum contato encontrado via fallback na conta ${account.name} para: ${searchPhone}`);
        return null;
        
      } catch (fallbackError) {
        console.log(`⚠️ Erro no fallback para conta ${account.name}:`, fallbackError.response?.status || fallbackError.message);
        return null;
      }
    }
    
    // Se accountId foi fornecido, buscar apenas naquela conta
    if (accountId) {
      const account = (await getAllAvailableAccounts()).find(a => a.id === accountId);
      if (!account) {
        console.log(`❌ Conta ${accountId} não encontrada ou não disponível`);
        return null;
      }
      
      // Tentar diferentes formatos do número para busca
      const phoneVariations = [
        normalizedPhone,
        phoneNumber, // formato original
        phoneNumber.startsWith('+') ? phoneNumber.substring(1) : '+' + phoneNumber,
        phoneNumber.replace(/^\+55/, ''), // remover código do Brasil
        phoneNumber.replace(/^\+/, ''), // remover apenas o +
      ];
      
      // Remover duplicatas
      const uniquePhones = [...new Set(phoneVariations)];
      console.log(`📱 Tentando formatos de telefone:`, uniquePhones);
      
      for (const phone of uniquePhones) {
        const result = await searchInAccount(account, phone);
        if (result) return result;
      }
      
      // Se não encontrou com busca, tentar buscar diretamente por telefone como ID
      console.log(`🔍 Tentando busca direta por telefone como ID na conta ${account.name}...`);
      try {
        const directResponse = await axios.get(
          `${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts/${phoneNumber}`,
          {
            headers: { 'api_access_token': CHATWOOT_API_TOKEN }
          }
        );
        
        if (directResponse.data.payload && directResponse.data.payload.id) {
          const contact = directResponse.data.payload;
          console.log(`✅ Contato encontrado diretamente! ID: ${contact.id}, Telefone: ${contact.phone_number}`);
          return contact.id;
        }
      } catch (directError) {
        console.log(`⚠️ Busca direta falhou:`, directError.response?.status);
      }
      
      console.log(`❌ Contato não encontrado na conta ${account.name} para nenhum formato de: ${phoneNumber}`);
      return null;
    }
    
    // Se não foi fornecido accountId, buscar em todas as contas
    const accounts = await getAllAvailableAccounts();
    console.log(`🏢 Buscando em ${accounts.length} conta(s)`);
    
    // Tentar diferentes formatos do número para busca
    const phoneVariations = [
      normalizedPhone,
      phoneNumber, // formato original
      phoneNumber.startsWith('+') ? phoneNumber.substring(1) : '+' + phoneNumber,
      phoneNumber.replace(/^\+55/, ''), // remover código do Brasil
      phoneNumber.replace(/^\+/, ''), // remover apenas o +
    ];
    
    // Remover duplicatas
    const uniquePhones = [...new Set(phoneVariations)];
    console.log(`📱 Tentando formatos de telefone:`, uniquePhones);
    
    for (const phone of uniquePhones) {
      for (const account of accounts) {
        const result = await searchInAccount(account, phone);
        if (result) return result;
      }
    }
    
    console.log(`❌ Contato não encontrado para nenhum formato de: ${phoneNumber} em nenhuma conta`);
    return null;
  } catch (error) {
    console.error('❌ Erro geral ao buscar ID do contato pelo telefone:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Busca o nome de um contato usando diferentes estratégias
 * 
 * Melhorias implementadas:
 * - Suporte ao parâmetro accountId para busca específica
 * - Usa a função getContactIdByPhone melhorada para conversão de telefone
 * - Busca prioritária na conta específica quando accountId é fornecido
 * - Melhor validação de nomes vazios ou nulos
 * - Logs mais detalhados para debugging
 * 
 * @param {string|number} contactId - ID do contato ou número de telefone
 * @param {object|null} conversationData - Dados da conversa (opcional)
 * @param {number|null} accountId - ID da conta específica (opcional)
 * @returns {string} - Nome do contato ou 'Cliente' como fallback
 */
async function getContactName(contactId, conversationData = null, accountId = null) {
  try {
    console.log(`👤 Buscando nome para contactId: ${contactId}${accountId ? ` na conta ${accountId}` : ''}`);
    
    // Se temos dados da conversa e há um nome, usar primeiro
    if (conversationData && conversationData.meta && conversationData.meta.sender) {
      const senderName = conversationData.meta.sender.name;
      if (senderName && senderName.trim() !== '') {
        console.log(`✅ Nome encontrado nos dados da conversa: ${senderName}`);
        const firstName = senderName.split(' ')[0];
        return firstName;
      }
    }
    
    // Se contactId for um número de telefone, buscar o ID interno usando a função melhorada
    let internalId = contactId;
    if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
      console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
      const foundId = await getContactIdByPhone(contactId, accountId);
      if (foundId) {
        internalId = foundId;
        console.log(`🔄 Convertido telefone ${contactId} para ID interno: ${internalId}`);
      } else {
        console.log(`⚠️ Contato não encontrado no Chatwoot para telefone: ${contactId}`);
        // Se não encontrou o ID interno, tentar buscar o nome diretamente pelo telefone
        console.log(`🔍 Tentando buscar nome diretamente pelo telefone...`);
        const accounts = await getAllAvailableAccounts();
        
        for (const account of accounts) {
          try {
            const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts/${contactId}`, {
              headers: {
                'api_access_token': CHATWOOT_API_TOKEN
              }
            });
            const fullName = response.data.payload.name;
            if (fullName && fullName.trim() !== '') {
              const firstName = fullName.split(' ')[0];
              console.log(`✅ Nome encontrado diretamente na conta ${account.name}: ${firstName}`);
              return firstName;
            }
          } catch (directError) {
            console.log(`⚠️ Não foi possível buscar na conta ${account.name}`);
            continue;
          }
        }
        
        console.log(`⚠️ Não foi possível buscar diretamente pelo telefone em nenhuma conta`);
        return 'Cliente';
      }
    }
    
    // Buscar o contato usando o ID interno (que pode ser o contactId original ou o ID encontrado)
    const accounts = await getAllAvailableAccounts();
    
    // Se temos um accountId específico, buscar apenas nessa conta primeiro
    if (accountId) {
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        try {
          const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts/${internalId}`, {
            headers: {
              'api_access_token': CHATWOOT_API_TOKEN
            }
          });
          const fullName = response.data.payload.name;
          if (fullName && fullName.trim() !== '') {
            const firstName = fullName.split(' ')[0];
            console.log(`✅ Nome encontrado na conta específica ${account.name}: ${firstName}`);
            return firstName;
          }
        } catch (error) {
          console.log(`⚠️ Contato não encontrado na conta específica ${account.name}`);
        }
      }
    }
    
    // Se não encontrou na conta específica ou não foi fornecida, buscar em todas as contas
    for (const account of accounts) {
      try {
        const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts/${internalId}`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN
          }
        });
        const fullName = response.data.payload.name;
        if (fullName && fullName.trim() !== '') {
          const firstName = fullName.split(' ')[0];
          console.log(`✅ Nome encontrado na conta ${account.name}: ${firstName}`);
          return firstName;
        }
      } catch (error) {
        console.log(`⚠️ Contato não encontrado na conta ${account.name}`);
        continue;
      }
    }
    
    console.log(`⚠️ Contato não encontrado em nenhuma conta`);
    return 'Cliente';
  } catch (error) {
    console.error('❌ Erro ao obter nome do contato:', error.response?.data || error.message);
    
    // Log adicional para debug
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   URL: ${error.config?.url}`);
      console.error(`   ContactId original: ${contactId}`);
    }
    return 'Cliente';
  }
}

// ===== FUNÇÕES DE CONTROLE DE STATUS DO BOT =====

// Verificar se o bot deve estar ativo para uma conversa
async function isBotActiveForConversation(conversationId, contactId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    console.log(`🤖 Verificando status do bot para conversa ${conversationId}`);
    
    // Buscar status do bot no banco
    const botStatus = await getBotConversationStatus(conversationId, contactId);
    
    if (!botStatus.bot_active) {
      console.log(`🚫 Bot desativado para conversa ${conversationId}: ${botStatus.paused_reason}`);
      return false;
    }
    
    // Verificar se bot foi reativado recentemente (últimos 5 minutos)
    // if (botStatus.reactivated_at) {
    //   const now = new Date();
    //   const reactivatedAt = new Date(botStatus.reactivated_at);
    //   const timeDiff = (now.getTime() - reactivatedAt.getTime()) / 1000 / 60; // diferença em minutos
      
    //   if (timeDiff < 5) {
    //     console.log(`⏳ Bot reativado há ${timeDiff.toFixed(1)} minutos, ignorando verificação de agente (período de graça)`);
    //     return true;
    //   }
    // }
    
    // Verificar se há atendente humano ativo no Chatwoot
    const hasHumanAgent = await checkHumanAgentActive(conversationId, accountId);
    
    if (hasHumanAgent) {
      console.log(`👤 Atendente humano detectado na conversa ${conversationId}, pausando bot automaticamente`);
      await pauseBotForConversation(conversationId, contactId, 'human_agent_active', 'system');
      return false;
    }
    
    console.log(`✅ Bot ativo para conversa ${conversationId}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao verificar status do bot para conversa ${conversationId}:`, error);
    // Em caso de erro, permitir que o bot funcione (failsafe)
    return true;
  }
}

// Verificar se o auto_followup está desativado para uma conversa
async function isAutoFollowupDisabledForConversation(conversationId, contactId) {
  try {
    console.log(`🚫 Verificando se auto_followup está desativado para conversa ${conversationId}`);
    
    // Buscar status do bot no banco
    const botStatus = await getBotConversationStatus(conversationId, contactId);
    
    if (botStatus.auto_followup_disabled) {
      console.log(`🚫 Auto_followup desativado para conversa ${conversationId}: ${botStatus.followup_disabled_by}`);
      return true;
    }
    
    console.log(`✅ Auto_followup ativo para conversa ${conversationId}`);
    return false;
  } catch (error) {
    console.error(`❌ Erro ao verificar status do auto_followup para conversa ${conversationId}:`, error);
    // Em caso de erro, permitir que o followup funcione (failsafe)
    return false;
  }
}

// Obter ou criar status do bot para uma conversa
async function getBotConversationStatus(conversationId, contactId) {
  try {
    // Tentar buscar status existente
    let result = await pool.query(
      'SELECT * FROM bot_conversation_status WHERE conversation_id = $1',
      [conversationId]
    );
    
    if (result.rows.length === 0) {
      // Criar novo status se não existir (auto_followup_disabled = true por padrão)
      console.log(`📝 Criando novo status de bot para conversa ${conversationId} (auto_followup_disabled = true por padrão)`);
      result = await pool.query(`
        INSERT INTO bot_conversation_status 
        (conversation_id, contact_id, bot_active, auto_followup_disabled, last_interaction_at, created_at, updated_at) 
        VALUES ($1, $2, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
        RETURNING *
      `, [conversationId, contactId]);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error(`❌ Erro ao obter status do bot para conversa ${conversationId}:`, error);
    // Retornar status padrão ativo em caso de erro (auto_followup_disabled = true por padrão)
    return {
      conversation_id: conversationId,
      contact_id: contactId,
      bot_active: true,
      auto_followup_disabled: true,
      paused_reason: null,
      paused_by: null,
      has_human_agent: false
    };
  }
}

// Verificar se há atendente humano ativo no Chatwoot
async function checkHumanAgentActive(conversationId, accountId) {
  try {
    console.log(`🔍 Verificando atendente humano para conversa ${conversationId}`);
    console.log(`🔍 url: ${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}`);
    
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}`,
      {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      }
    );
    
    
    const conversation = response.data;
    
    // Verificar se há um agente atribuído
    const hasAssignedAgent = conversation.assignee_id && conversation.assignee_id !== null;
    
    // Verificar se a conversa está em status que indica atendimento humano
    const humanStatuses = ['open', 'resolved'];
    const isHumanStatus = humanStatuses.includes(conversation.status);
    
    // Verificar se há mensagens recentes de agentes humanos (PRINCIPAL VERIFICAÇÃO)
    const hasRecentAgentActivity = await checkRecentAgentActivity(conversationId, accountId);
    
    // NOVA LÓGICA: Se há atividade recente de agente, considerar como atendimento humano ativo
    // independentemente de atribuição formal
    const hasHumanAgent = hasRecentAgentActivity || (hasAssignedAgent && isHumanStatus);
    
    console.log(`👤 Conversa ${conversationId} - Agente: ${hasAssignedAgent ? conversation.assignee_id : 'Nenhum'}, Status: ${conversation.status}, Atividade Recente: ${hasRecentAgentActivity}, Atendimento Humano: ${hasHumanAgent}`);
    
    // Atualizar status no banco
    await updateBotAgentStatus(conversationId, hasHumanAgent, conversation.assignee_id);
    
    return hasHumanAgent;
  } catch (error) {
    console.error(`❌ Erro ao verificar atendente humano para conversa ${conversationId}:`, error.response?.status, JSON.stringify(error.response?.data));
    // Em caso de erro, assumir que não há atendente (permitir bot)
    return false;
  }
}

// Verificar atividade recente de agente humano
async function checkRecentAgentActivity(conversationId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { page: 1, per_page: 10 } // Aumentar para 10 mensagens para melhor detecção
      }
    );
    
    const messages = response.data.payload || [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // Aumentar para 1 hora
    
    // Verificar se há mensagens de agentes humanos na última hora
    const recentAgentMessages = messages.filter(msg => {
      const messageTime = new Date(msg.created_at);
      
      // Verificar se é mensagem de agente (outgoing) e não é bot
      const isAgentMessage = msg.message_type === 1 && // outgoing message
                            msg.sender && 
                            msg.sender.type !== 'AgentBot' && // não é bot
                            msg.sender.type !== 'Bot'; // não é bot (outro tipo)
      
      // Verificar se é recente (última hora)
      const isRecent = messageTime > oneHourAgo;
      
      if (isAgentMessage && isRecent) {
        console.log(`👤 Mensagem de agente detectada: ${msg.sender?.name || msg.sender?.type} - ${msg.content} (${messageTime.toLocaleTimeString()})`);
      }
      
      return isAgentMessage && isRecent;
    });
    
    const hasAgentActivity = recentAgentMessages.length > 0;
    console.log(`🔍 Atividade de agente detectada para conversa ${conversationId}: ${hasAgentActivity} (${recentAgentMessages.length} mensagens de agente na última hora)`);
    
    return hasAgentActivity;
  } catch (error) {
    console.error(`❌ Erro ao verificar atividade recente de agente:`, error);
    return false;
  }
}

// Pausar bot para uma conversa específica
async function pauseBotForConversation(conversationId, contactId, reason, pausedBy = 'system') {
  try {
    console.log(`⏸️ Pausando bot para conversa ${conversationId}: ${reason}`);
    
    await pool.query(`
      INSERT INTO bot_conversation_status 
      (conversation_id, contact_id, bot_active, paused_reason, paused_by, paused_at, last_interaction_at, updated_at) 
      VALUES ($1, $2, false, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id) 
      DO UPDATE SET 
        bot_active = false, 
        paused_reason = $3, 
        paused_by = $4, 
        paused_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [conversationId, contactId, reason, pausedBy]);
    
    console.log(`✅ Bot pausado com sucesso para conversa ${conversationId}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao pausar bot para conversa ${conversationId}:`, error);
    return false;
  }
}

// Desativar auto_followup para uma conversa específica
async function disableAutoFollowupForConversation(conversationId, contactId, disabledBy = 'system') {
  try {
    console.log(`🚫 Desativando auto_followup para conversa ${conversationId}`);
    
    await pool.query(`
      INSERT INTO bot_conversation_status 
      (conversation_id, contact_id, auto_followup_disabled, followup_disabled_by, followup_disabled_at, last_interaction_at, updated_at) 
      VALUES ($1, $2, true, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id) 
      DO UPDATE SET 
        auto_followup_disabled = true, 
        followup_disabled_by = $3, 
        followup_disabled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [conversationId, contactId, disabledBy]);
    
    console.log(`✅ Auto_followup desativado com sucesso para conversa ${conversationId}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao desativar auto_followup para conversa ${conversationId}:`, error);
    return false;
  }
}

// Ativar auto_followup para uma conversa específica
async function enableAutoFollowupForConversation(conversationId, contactId, enabledBy = 'system') {
  try {
    console.log(`✅ Ativando auto_followup para conversa ${conversationId}`);
    
    await pool.query(`
      INSERT INTO bot_conversation_status 
      (conversation_id, contact_id, auto_followup_disabled, followup_disabled_by, followup_disabled_at, last_interaction_at, updated_at) 
      VALUES ($1, $2, false, $3, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id) 
      DO UPDATE SET 
        auto_followup_disabled = false, 
        followup_disabled_by = $3, 
        followup_disabled_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `, [conversationId, contactId, enabledBy]);
    
    console.log(`✅ Auto_followup ativado com sucesso para conversa ${conversationId}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao ativar auto_followup para conversa ${conversationId}:`, error);
    return false;
  }
}

// Reativar bot para uma conversa específica
async function reactivateBotForConversation(conversationId, contactId, reactivatedBy = 'system') {
  try {
    console.log(`▶️ Reativando bot para conversa ${conversationId}`);
    
    await pool.query(`
      INSERT INTO bot_conversation_status 
      (conversation_id, contact_id, bot_active, auto_followup_disabled, paused_reason, paused_by, reactivated_at, last_interaction_at, updated_at) 
      VALUES ($1, $2, true, true, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id) 
      DO UPDATE SET 
        bot_active = true, 
        auto_followup_disabled = true,
        paused_reason = NULL, 
        paused_by = NULL, 
        reactivated_at = CURRENT_TIMESTAMP,
        last_interaction_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [conversationId, contactId]);
    
    console.log(`✅ Bot reativado com sucesso para conversa ${conversationId} (auto_followup_disabled = true por padrão)`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao reativar bot para conversa ${conversationId}:`, error);
    return false;
  }
}

// Atualizar status de agente no banco
async function updateBotAgentStatus(conversationId, hasHumanAgent, agentId) {
  try {
    await pool.query(`
      UPDATE bot_conversation_status 
      SET has_human_agent = $1, agent_id = $2, last_agent_check = CURRENT_TIMESTAMP 
      WHERE conversation_id = $3
    `, [hasHumanAgent, agentId, conversationId]);
  } catch (error) {
    console.error(`❌ Erro ao atualizar status de agente:`, error);
  }
}

// Verificar e reativar bots após 24 horas de inatividade no atendimento humano
async function checkAndReactivateBotsAfter24Hours() {
  try {
    console.log(`🕐 Verificando bots pausados há mais de 24 horas para reativação automática...`);
    
    // Buscar conversas pausadas há mais de 24 horas
    const result = await pool.query(`
      SELECT conversation_id, contact_id, paused_reason, paused_at
      FROM bot_conversation_status 
      WHERE bot_active = false 
        AND paused_at < NOW() - INTERVAL '24 hours'
        AND paused_reason IN ('human_handoff', 'sector_transfer', 'human_agent_active', 'agent_intervention', 'ai_agent_transfer')
    `);
    
    if (result.rows.length > 0) {
      console.log(`🔄 Encontradas ${result.rows.length} conversas para reativação automática após 24h`);
      
      for (const row of result.rows) {
        const { conversation_id, contact_id, paused_reason, paused_at } = row;
        
        // Buscar o accountId da conversa usando a função auxiliar
        const accountId = await getAccountIdForConversation(conversation_id);
        
        // Verificar se ainda há agente humano ativo
        const hasActiveAgent = await checkHumanAgentActive(conversation_id, accountId);
        
        if (!hasActiveAgent) {
          console.log(`🔄 Reativando bot para conversa ${conversation_id} após 24h de inatividade (pausado em: ${paused_at})`);
          
          // Reativar o bot
          await reactivateBotForConversation(conversation_id, contact_id, 'auto_24h_reactivation');
          
          // Enviar mensagem informativa opcional (pode comentar se não quiser)
          // try {
          //   await sendChatwootMessage(conversation_id, 
          //     '🤖 *Bot reativado automaticamente*\n\n' +
          //     'Como não detectei atividade de atendimento humano nas últimas 24 horas, ' +
          //     'reativei o assistente virtual para te ajudar.\n\n' +
          //     'Se precisar falar com nossa equipe, é só dizer "atendimento humano" ou usar !pausebot para pausar o bot.'
          //   );
          // } catch (msgError) {
          //   console.log(`⚠️ Não foi possível enviar mensagem de reativação para conversa ${conversation_id}:`, msgError.message);
          // }
        } else {
          console.log(`👤 Conversa ${conversation_id} ainda tem agente ativo, mantendo bot pausado`);
        }
      }
    } else {
      console.log(`✅ Nenhuma conversa encontrada para reativação automática`);
    }

    // Verificar bots ativos há mais de 24 horas de inatividade para reset completo silencioso
    console.log(`🕐 Verificando bots ativos há mais de 24 horas de inatividade para reset completo automático...`);
    
    const inactiveBotsResult = await pool.query(`
      SELECT conversation_id, contact_id, last_interaction_at
      FROM bot_conversation_status 
      WHERE bot_active = true 
        AND last_interaction_at < NOW() - INTERVAL '24 hours'
    `);
    
    if (inactiveBotsResult.rows.length > 0) {
      console.log(`🔄 Encontrados ${inactiveBotsResult.rows.length} bots inativos há mais de 24 horas para reset completo automático`);
      
      for (const row of inactiveBotsResult.rows) {
        const { conversation_id, contact_id, last_interaction_at } = row;
        
        console.log(`🔄 Executando reset completo silencioso para conversa ${conversation_id} após 24h de inatividade (última interação em: ${last_interaction_at})`);
        
        // Buscar o accountId da conversa usando a função auxiliar
        const accountId = await getAccountIdForConversation(conversation_id);
        
        // Executar reset completo silenciosamente (igual ao comando !reset, mas sem enviar mensagem)
        try {
          // 1. Deletar conversa do workflow (reset do estado)
          await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contact_id]);
          
          // 1.5. Limpar registros de debounce para este contato
          await pool.query('DELETE FROM button_debounce WHERE contact_id = $1', [contact_id]);
          
          // 2. Remover todos os labels do contato
          await removeAllLabelsFromContact(contact_id, accountId);
          
          // 3. Remover todos os labels da conversa
          await removeAllLabelsFromConversation(conversation_id, accountId);
          
          // 4. Atualizar a data da última interação para agora
          await pool.query(`
            UPDATE bot_conversation_status 
            SET last_interaction_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE conversation_id = $1
          `, [conversation_id]);
          
          console.log(`✅ Reset completo silencioso executado para conversa ${conversation_id} após 24h de inatividade`);
        } catch (resetError) {
          console.error(`❌ Erro ao executar reset completo para conversa ${conversation_id}:`, resetError);
        }
      }
    } else {
      console.log(`✅ Nenhum bot inativo há mais de 24 horas encontrado para reset completo`);
    }
  } catch (error) {
    console.error(`❌ Erro ao verificar reativação automática de bots:`, error);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// ===== ROTAS DE AUTENTICAÇÃO =====
app.post('/api/auth/login', [
  body('username').notEmpty().withMessage('Username é obrigatório'),
  body('password').notEmpty().withMessage('Password é obrigatório')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    
    const result = await pool.query('SELECT * FROM system_users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = generateToken({ 
      id: user.id, 
      username: user.username, 
      role: user.role 
    });

    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      } 
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ===== ROTA DE ALTERAÇÃO DE SENHA =====
app.post('/api/auth/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Senha atual é obrigatória'),
  body('newPassword').isLength({ min: 6 }).withMessage('Nova senha deve ter pelo menos 6 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    // Buscar usuário
    const result = await pool.query('SELECT * FROM system_users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const user = result.rows[0];
    // Verificar senha atual
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    // Atualizar senha
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE system_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno ao alterar senha' });
  }
});

// ===== ROTAS DO FRONTEND (PROTEGIDAS) =====

// ==================== ROTAS PARA AGENTES IA ====================

// Rota para listar modelos IA disponíveis
app.get('/api/ai-models', authenticateToken, async (req, res) => {
  try {
    const models = await getAvailableAIModels();
    res.json({ success: true, models });
  } catch (error) {
    console.error('Erro ao obter modelos IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para obter configurações do sistema
app.get('/api/config', (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        ia_agent_url: IA_AGENT_URL,
        ia_agent_port: IA_AGENT_PORT,
        chatwoot_base_url: CHATWOOT_BASE_URL
      }
    });
  } catch (error) {
    console.error('Erro ao obter configurações:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Rota para listar agentes IA
app.get('/api/ai-agents', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const agents = await getAllAIAgents();
    res.json({ success: true, agents });
  } catch (error) {
    console.error('Erro ao listar agentes IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para obter agente IA por ID
app.get('/api/ai-agents/:id', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await getAIAgentById(id);
    
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agente IA não encontrado' });
    }
    
    res.json({ success: true, agent });
  } catch (error) {
    console.error('Erro ao obter agente IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para criar agente IA (apenas admins)
app.post('/api/ai-agents', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const user = req.user;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem criar agentes IA' });
    }
    
    const agentData = req.body;
    
    // Validações básicas
    if (!agentData.name || !agentData.model || !agentData.summary_prompt || !agentData.custom_system_prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nome, modelo, summary_prompt e custom_system_prompt são obrigatórios' 
      });
    }
    
    const agent = await createAIAgent(agentData, user.id);
    res.status(201).json({ success: true, agent });
  } catch (error) {
    console.error('Erro ao criar agente IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para atualizar agente IA (apenas admins)
app.put('/api/ai-agents/:id', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem editar agentes IA' });
    }
    
    const agentData = req.body;
    
    // Verificar se o agente existe
    const existingAgent = await getAIAgentById(id);
    if (!existingAgent) {
      return res.status(404).json({ success: false, error: 'Agente IA não encontrado' });
    }
    
    const agent = await updateAIAgent(id, agentData, user.id);
    res.json({ success: true, agent });
  } catch (error) {
    console.error('Erro ao atualizar agente IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para deletar agente IA (apenas admins)
app.delete('/api/ai-agents/:id', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem deletar agentes IA' });
    }
    
    // Verificar se o agente existe
    const existingAgent = await getAIAgentById(id);
    if (!existingAgent) {
      return res.status(404).json({ success: false, error: 'Agente IA não encontrado' });
    }
    
    const agent = await deleteAIAgent(id);
    res.json({ success: true, message: 'Agente IA deletado com sucesso', agent });
  } catch (error) {
    console.error('Erro ao deletar agente IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Configuração do multer para upload de PDFs removida - upload direto para ia-agent

// Rota de upload de PDF removida - agora fazemos upload direto para a API do ia-agent

// Rota para vincular agente IA a um workflow
app.post('/api/workflows/:name/ai-agent', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const user = req.user;
    const { name } = req.params;
    const { agent_id } = req.body;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem vincular agentes IA' });
    }
    
    if (!agent_id) {
      return res.status(400).json({ success: false, error: 'ID do agente é obrigatório' });
    }
    
    // Verificar se o agente existe
    const agent = await getAIAgentById(agent_id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agente IA não encontrado' });
    }
    
    const link = await linkAIAgentToWorkflow(name, agent_id);
    res.json({ success: true, link, message: 'Agente IA vinculado ao workflow com sucesso' });
  } catch (error) {
    console.error('Erro ao vincular agente IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para desvincular agente IA de um workflow
app.delete('/api/workflows/:name/ai-agent', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const user = req.user;
    const { name } = req.params;
    
    // Verificar se é admin
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem desvincular agentes IA' });
    }
    
    const link = await unlinkAIAgentFromWorkflow(name);
    res.json({ success: true, message: 'Agente IA desvinculado do workflow com sucesso', link });
  } catch (error) {
    console.error('Erro ao desvincular agente IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para obter agente IA vinculado a um workflow
app.get('/api/workflows/:name/ai-agent', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const { name } = req.params;
    const agent = await getAIAgentByWorkflow(name);
    res.json({ success: true, agent });
  } catch (error) {
    console.error('Erro ao obter agente IA do workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obter contas do Chatwoot
app.get('/api/accounts', authenticateToken, async (req, res) => {
  try {
    console.log(`🔍 Buscando contas para usuário ${req.user.username} (${req.user.role})...`);
    
    // Buscar perfil do usuário para obter todas as contas que ele tem acesso
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/profile`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    
    let allAccounts = [];
    
    if (response.data && response.data.accounts && Array.isArray(response.data.accounts)) {
      allAccounts = response.data.accounts.map(account => ({
        id: account.id,
        name: account.name,
        domain: CHATWOOT_BASE_URL.replace(/^https?:\/\//, ''),
        status: account.status || 'active',
        role: account.role,
        permissions: account.permissions
      }));
    } else {
      console.warn('⚠️ Nenhuma conta encontrada no perfil, usando conta padrão...');
      
      // Fallback para conta padrão se não encontrar no perfil
      const defaultAccountId = CHATWOOT_ACCOUNT_ID;
      let accountName = `Conta ${defaultAccountId}`;
      
      try {
        const fallbackResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${defaultAccountId}`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN
          }
        });
        if (fallbackResponse.data && fallbackResponse.data.name) {
          accountName = fallbackResponse.data.name;
        }
      } catch (err) {
        console.warn('Não foi possível buscar o nome real da conta, usando nome padrão.');
      }
      
      allAccounts = [{
        id: parseInt(defaultAccountId),
        name: accountName,
        domain: CHATWOOT_BASE_URL.replace(/^https?:\/\//, ''),
        status: 'active'
      }];
    }
    
    // Filtrar contas baseado no perfil do usuário
    const authorizedAccounts = await getAuthorizedAccounts(req.user.id, req.user.role);
    
    let filteredAccounts = allAccounts;
    if (authorizedAccounts !== null) {
      // Usuário comum: filtrar apenas contas atribuídas
      filteredAccounts = allAccounts.filter(account => authorizedAccounts.includes(account.id));
    }
    
    console.log(`✅ Usuário ${req.user.username} (${req.user.role}) tem acesso a ${filteredAccounts.length} conta(s)`);
    res.json(filteredAccounts);
    
  } catch (error) {
    console.error('❌ Erro ao obter contas:', error.message);
    console.error('❌ Detalhes do erro:', error.response?.data || error);
    
    res.status(500).json({ 
      error: 'Erro ao obter contas',
      details: error.message
    });
  }
});

// Obter caixas de entrada de uma conta
app.get('/api/accounts/:accountId/inboxes', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/inboxes`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    res.json(response.data.payload || []);
  } catch (error) {
    console.error('Erro ao obter caixas de entrada:', error);
    res.status(500).json({ error: 'Erro ao obter caixas de entrada' });
  }
});

// Obter fluxo de uma caixa de entrada específica
app.get('/api/inbox-workflows/:accountId/:inboxId', authenticateToken, async (req, res) => {
  try {
    const { accountId, inboxId } = req.params;
    const workflow = await inboxWorkflowManager.getInboxWorkflow(accountId, inboxId);
    res.json(workflow);
  } catch (error) {
    console.error('Erro ao obter fluxo da caixa de entrada:', error);
    res.status(500).json({ error: 'Erro ao obter fluxo' });
  }
});

// Salvar fluxo para uma caixa de entrada
app.post('/api/inbox-workflows', authenticateToken, [
  body('accountId').isInt().withMessage('Account ID deve ser um número'),
  body('inboxId').isInt().withMessage('Inbox ID deve ser um número'),
  body('workflowName').notEmpty().withMessage('Nome do workflow é obrigatório'),
  body('workflowConfig').notEmpty().withMessage('Configuração do workflow é obrigatória')
], async (req, res) => {
  try {
    console.log('🔍 Salvando fluxo:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ Erros de validação:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { accountId, inboxId, workflowName, workflowConfig } = req.body;
    console.log('📝 Dados do fluxo:', { accountId, inboxId, workflowName });
    
    const result = await inboxWorkflowManager.saveInboxWorkflow(accountId, inboxId, workflowName, workflowConfig);
    console.log('✅ Resultado do salvamento:', result);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Erro ao salvar fluxo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar todos os fluxos de caixas de entrada (somente admin)
app.get('/api/inbox-workflows', authenticateToken, async (req, res) => {
  try {
    // Apenas admins podem ver a lista de workflows ativos
    if (req.user.role !== 'admin') {
      return res.json([]); // Usuários comuns veem lista vazia
    }
    
    const workflows = await inboxWorkflowManager.getAllInboxWorkflows();
    res.json(workflows);
  } catch (error) {
    console.error('Erro ao listar fluxos:', error);
    res.status(500).json({ error: 'Erro ao listar fluxos' });
  }
});

// Desativar fluxo de uma caixa de entrada
app.delete('/api/inbox-workflows/:accountId/:inboxId', authenticateToken, async (req, res) => {
  try {
    const { accountId, inboxId } = req.params;
    const result = await inboxWorkflowManager.deactivateInboxWorkflow(accountId, inboxId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Erro ao desativar fluxo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Obter templates de workflows disponíveis (apenas workflows ativos do banco)
app.get('/api/workflow-templates', authenticateToken, async (req, res) => {
  try {
    // Buscar apenas workflows ativos do banco
    const result = await pool.query('SELECT workflow_name, config FROM workflow_configs WHERE is_active = true');
    
    const templates = result.rows.map(row => ({
      name: row.workflow_name,
      displayName: row.workflow_name,
      description: `Workflow configurado: ${row.workflow_name}`,
      config: row.config
    }));
    
    res.json(templates);
  } catch (error) {
    console.error('Erro ao obter templates:', error);
    res.status(500).json({ error: 'Erro ao obter templates' });
  }
});

// ===== ROTAS DE CONTROLE DO BOT =====

// Obter status do bot para uma conversa
app.get('/api/bot-status/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { contactId } = req.query;
    
    if (!contactId) {
      return res.status(400).json({ error: 'ContactId é obrigatório' });
    }
    
    const botStatus = await getBotConversationStatus(conversationId, contactId);
    const isActive = await isBotActiveForConversation(conversationId, contactId);
    
    res.json({
      conversation_id: conversationId,
      contact_id: contactId,
      bot_active: isActive,
      status_details: botStatus
    });
  } catch (error) {
    console.error('Erro ao obter status do bot:', error);
    res.status(500).json({ error: 'Erro ao obter status do bot' });
  }
});

// Pausar bot para uma conversa
app.post('/api/bot-control/:conversationId/pause', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { contactId, reason = 'manual_pause' } = req.body;
    
    if (!contactId) {
      return res.status(400).json({ error: 'ContactId é obrigatório' });
    }
    
    const success = await pauseBotForConversation(conversationId, contactId, reason, req.user?.username || 'admin');
    
    if (success) {
      res.json({ success: true, message: 'Bot pausado com sucesso' });
    } else {
      res.status(500).json({ error: 'Erro ao pausar bot' });
    }
  } catch (error) {
    console.error('Erro ao pausar bot:', error);
    res.status(500).json({ error: 'Erro ao pausar bot' });
  }
});

// Reativar bot para uma conversa
app.post('/api/bot-control/:conversationId/activate', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { contactId } = req.body;
    
    if (!contactId) {
      return res.status(400).json({ error: 'ContactId é obrigatório' });
    }
    
    const success = await reactivateBotForConversation(conversationId, contactId, req.user?.username || 'admin');
    
    if (success) {
      res.json({ success: true, message: 'Bot reativado com sucesso' });
    } else {
      res.status(500).json({ error: 'Erro ao reativar bot' });
    }
  } catch (error) {
    console.error('Erro ao reativar bot:', error);
    res.status(500).json({ error: 'Erro ao reativar bot' });
  }
});

// Listar conversas com status do bot
app.get('/api/bot-conversations', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        bcs.*,
        wc.workflow_name,
        wc.current_block,
        wc.start_time,
        wc.last_activity
      FROM bot_conversation_status bcs
      LEFT JOIN workflow_conversations wc ON bcs.contact_id = wc.contact_id
      WHERE wc.status = 'active'
      ORDER BY bcs.updated_at DESC
      LIMIT 50
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar conversas com bot:', error);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

// Reset de conversa (via API)
app.post('/api/workflow/conversation/:contactId/reset', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { conversationId } = req.body;
    
    console.log(`🔄 Reset via API solicitado para contato ${contactId}`);
    
    // Deletar conversa do workflow
    await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contactId]);
    
    // Limpar registros de debounce para este contato
    await pool.query('DELETE FROM button_debounce WHERE contact_id = $1', [contactId]);
    
    // Remover todos os labels do contato
    await removeAllLabelsFromContact(contactId);
    
    // Remover todos os labels da conversa se fornecido
    if (conversationId) {
      await removeAllLabelsFromConversation(conversationId);
      // Reativar o bot após reset
      await reactivateBotForConversation(conversationId, contactId, req.user?.username || 'admin');
    }
    
    res.json({ 
      success: true, 
      message: 'Conversa resetada com sucesso',
      details: {
        contact_id: contactId,
        conversation_id: conversationId,
        labels_removed: true,
        bot_reactivated: !!conversationId
      }
    });
  } catch (error) {
    console.error('Erro ao resetar conversa:', error);
    res.status(500).json({ error: 'Erro ao resetar conversa' });
  }
});

// ===== ROTAS DE GERENCIAMENTO DE USUÁRIOS (ADMIN ONLY) =====

// Listar usuários
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    
    const result = await pool.query(`
      SELECT id, username, role, assigned_accounts, created_at, updated_at 
      FROM system_users 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Criar usuário
app.post('/api/users', authenticateToken, [
  body('username').notEmpty().withMessage('Username é obrigatório'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('role').isIn(['admin', 'user']).withMessage('Perfil deve ser admin ou user'),
  body('assigned_accounts').isArray().withMessage('Contas atribuídas deve ser um array')
], async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, password, role, assigned_accounts } = req.body;
    
    // Verificar se username já existe
    const existingUser = await pool.query('SELECT id FROM system_users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }
    
    // Criar hash da senha
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO system_users (username, password_hash, role, assigned_accounts) VALUES ($1, $2, $3, $4) RETURNING id, username, role, assigned_accounts, created_at',
      [username, passwordHash, role, JSON.stringify(assigned_accounts)]
    );
    
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Atualizar usuário
app.put('/api/users/:id', authenticateToken, [
  body('username').optional().notEmpty().withMessage('Username não pode ser vazio'),
  body('password').optional().isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('role').optional().isIn(['admin', 'user']).withMessage('Perfil deve ser admin ou user'),
  body('assigned_accounts').optional().isArray().withMessage('Contas atribuídas deve ser um array')
], async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { username, password, role, assigned_accounts } = req.body;
    
    // Verificar se usuário existe
    const existingUser = await pool.query('SELECT id FROM system_users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Construir query dinâmica
    let updateFields = [];
    let updateValues = [];
    let paramCount = 1;
    
    if (username) {
      updateFields.push(`username = $${paramCount++}`);
      updateValues.push(username);
    }
    
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateFields.push(`password_hash = $${paramCount++}`);
      updateValues.push(passwordHash);
    }
    
    if (role) {
      updateFields.push(`role = $${paramCount++}`);
      updateValues.push(role);
    }
    
    if (assigned_accounts !== undefined) {
      updateFields.push(`assigned_accounts = $${paramCount++}`);
      updateValues.push(JSON.stringify(assigned_accounts));
    }
    
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(id);
    
    const query = `UPDATE system_users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, username, role, assigned_accounts, updated_at`;
    
    const result = await pool.query(query, updateValues);
    
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// Excluir usuário
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    
    const { id } = req.params;
    
    // Não permitir que admin exclua a si mesmo
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
    }
    
    const result = await pool.query('DELETE FROM system_users WHERE id = $1 RETURNING username', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    res.json({ success: true, message: `Usuário ${result.rows[0].username} excluído com sucesso` });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

// Listar workflows com auto_followup configurado
app.get('/api/workflows-with-followup', authenticateToken, async (req, res) => {
  try {
    const workflowsWithFollowup = await getWorkflowsWithAutoFollowup();
    
    const detailedWorkflows = [];
    
    for (const workflowInfo of workflowsWithFollowup) {
      try {
        // Carregar workflow completo para obter detalhes
        let workflow = conversationManager.workflows.get(workflowInfo.workflow_name);
        if (!workflow) {
          workflow = await conversationManager.loadWorkflowFromDatabase(workflowInfo.workflow_name);
        }
        
        if (workflow && workflow.auto_followup) {
          const followupDetails = {};
          for (const [blockName, config] of Object.entries(workflow.auto_followup)) {
            const delayMinutes = Math.round(config.delay / 60000);
            const delayHours = Math.round(config.delay / 3600000);
            
            followupDetails[blockName] = {
              ...config,
              delay_formatted: delayMinutes < 60 
                ? `${delayMinutes} minutos` 
                : `${delayHours} horas`,
              block_info: workflow.blocks[blockName] ? {
                name: workflow.blocks[blockName].name,
                message: workflow.blocks[blockName].message.substring(0, 100) + '...'
              } : null
            };
          }
          
          detailedWorkflows.push({
            workflow_name: workflowInfo.workflow_name,
            source: workflowInfo.source,
            total_followup_blocks: Object.keys(workflow.auto_followup).length,
            followup_blocks: followupDetails
          });
        }
      } catch (error) {
        console.error(`❌ Erro ao processar workflow ${workflowInfo.workflow_name}:`, error);
      }
    }
    
    res.json({ 
      total_workflows: detailedWorkflows.length,
      workflows: detailedWorkflows
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar workflows com followup:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// Listar conversas aguardando followup
app.get('/api/pending-followups', authenticateToken, async (req, res) => {
  try {
    const pendingFollowups = await getPendingFollowups();
    res.json(pendingFollowups);
  } catch (error) {
    console.error('❌ Erro ao listar conversas aguardando followup:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// Forçar execução de um followup específico
app.post('/api/force-followup', authenticateToken, async (req, res) => {
  try {
    const { contactId, workflowName, blockName } = req.body;
    
    if (!contactId || !workflowName || !blockName) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    
    const result = await forceFollowupExecution(contactId, workflowName, blockName);
    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao forçar execução de followup:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// Função para forçar execução de followup
async function forceFollowupExecution(contactId, workflowName, blockName) {
  try {
    console.log(`🚀 Forçando execução de followup: ${blockName} para contact ${contactId} no workflow ${workflowName}`);
    
    // 1. Verificar se a conversa existe
    const conversation = await conversationManager.getConversation(contactId);
    if (!conversation) {
      return {
        error: 'Conversa não encontrada',
        contact_id: contactId,
        workflow_name: workflowName
      };
    }
    
    // 2. Carregar workflow
    let workflow = conversationManager.workflows.get(workflowName);
    if (!workflow) {
      workflow = await conversationManager.loadWorkflowFromDatabase(workflowName);
    }
    
    if (!workflow) {
      return {
        error: 'Workflow não encontrado',
        contact_id: contactId,
        workflow_name: workflowName
      };
    }
    
    // 3. Verificar se o bloco existe
    if (!workflow.blocks[blockName]) {
      return {
        error: 'Bloco não encontrado no workflow',
        block_name: blockName,
        workflow_name: workflowName
      };
    }
    
    // 4. Executar followup
    await executeAutoFollowup(conversation.id, contactId, workflow, blockName, conversation.data);
    
    return {
      success: true,
      message: `Followup ${blockName} executado com sucesso`,
      contact_id: contactId,
      workflow_name: workflowName,
      block_name: blockName,
      conversation_id: conversation.id
    };
    
  } catch (error) {
    console.error('❌ Erro ao forçar execução de followup:', error);
    return {
      error: 'Erro interno ao executar followup',
      details: error.message,
      contact_id: contactId,
      workflow_name: workflowName,
      block_name: blockName
    };
  }
}

// Testar funcionalidade de auto followup
app.post('/api/test-auto-followup', authenticateToken, async (req, res) => {
  try {
    const { contactId, workflowName, blockName } = req.body;
    
    if (!contactId || !workflowName || !blockName) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    
    const result = await testAutoFollowup(contactId, workflowName, blockName);
    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao testar auto followup:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// ===== ROTAS DE CAMPANHAS DE WHATSAPP =====

// Função de diagnóstico para investigar problemas com auto followup
async function diagnoseAutoFollowup(contactId, workflowName) {
  try {
    console.log(`🔍 Iniciando diagnóstico de auto followup para contact ${contactId} no workflow ${workflowName}`);
    
    // 1. Verificar se a conversa existe
    const conversation = await conversationManager.getConversation(contactId);
    if (!conversation) {
      return {
        error: 'Conversa não encontrada',
        contact_id: contactId,
        workflow_name: workflowName
      };
    }
    
    console.log(`✅ Conversa encontrada: ID ${conversation.id}, Status: ${conversation.status}, Bloco atual: ${conversation.current_block}`);
    
    // 2. Verificar se o workflow tem auto_followup
    let workflow = conversationManager.workflows.get(workflowName);
    if (!workflow) {
      workflow = await conversationManager.loadWorkflowFromDatabase(workflowName);
    }
    
    if (!workflow) {
      return {
        error: 'Workflow não encontrado',
        contact_id: contactId,
        workflow_name: workflowName
      };
    }
    
    if (!workflow.auto_followup) {
      return {
        error: 'Workflow não possui configuração de auto_followup',
        contact_id: contactId,
        workflow_name: workflowName
      };
    }
    
    console.log(`✅ Workflow encontrado com ${Object.keys(workflow.auto_followup).length} bloco(s) de followup`);
    
    // 3. Calcular tempo de inatividade usando PostgreSQL
    const inactivityResult = await pool.query(`
      SELECT EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
      FROM workflow_conversations 
      WHERE conversation_id = $1
    `, [conversation.id]);
    
    const secondsInactive = Math.floor(parseFloat(inactivityResult.rows[0].seconds_inactive));
    const minutesInactive = Math.floor(secondsInactive / 60);
    
    console.log(`⏰ Última atividade: ${conversation.last_activity}`);
    console.log(`⏰ Tempo inativo (PostgreSQL): ${secondsInactive} segundos (${minutesInactive} minutos)`);
    
    // 4. Verificar cada bloco de followup
    const followupAnalysis = {};
    
    for (const [blockName, followupConfig] of Object.entries(workflow.auto_followup)) {
      const delaySeconds = followupConfig.delay / 1000;
      const isReady = secondsInactive >= delaySeconds;
      const timeRemaining = Math.max(0, delaySeconds - secondsInactive);
      
      console.log(`📋 Bloco ${blockName}: Delay ${delaySeconds}s, Pronto: ${isReady}, Tempo restante: ${timeRemaining}s`);
      
      // Verificar se o bloco existe no workflow
      const blockExists = workflow.blocks[blockName];
      
      // Verificar se já foi executado recentemente
      const alreadyExecuted = await checkIfFollowupAlreadyExecuted(conversation.id, blockName, delaySeconds);
      
      // Verificar se o bot está ativo
      const isBotActive = await isBotActiveForConversation(conversation.id, contactId, CHATWOOT_ACCOUNT_ID);
      
      followupAnalysis[blockName] = {
        delay_seconds: delaySeconds,
        delay_formatted: `${Math.round(delaySeconds / 60)} minutos`,
        is_ready: isReady,
        time_remaining: timeRemaining,
        block_exists: blockExists,
        already_executed: alreadyExecuted,
        bot_active: isBotActive,
        can_execute: isReady && blockExists && !alreadyExecuted && isBotActive,
        issues: []
      };
      
      // Identificar problemas
      if (!isReady) {
        followupAnalysis[blockName].issues.push(`Ainda não atingiu o delay (${timeRemaining}s restantes)`);
      }
      if (!blockExists) {
        followupAnalysis[blockName].issues.push('Bloco não existe no workflow');
      }
      if (alreadyExecuted) {
        followupAnalysis[blockName].issues.push('Já foi executado recentemente');
      }
      if (!isBotActive) {
        followupAnalysis[blockName].issues.push('Bot está pausado para esta conversa');
      }
    }
    
    return {
      success: true,
      contact_id: contactId,
      workflow_name: workflowName,
      conversation_id: conversation.id,
      conversation_status: conversation.status,
      current_block: conversation.current_block,
      last_activity: conversation.last_activity,
      seconds_inactive: secondsInactive,
      minutes_inactive: minutesInactive,
      followup_analysis: followupAnalysis,
      can_execute_any: Object.values(followupAnalysis).some(f => f.can_execute)
    };
    
  } catch (error) {
    console.error('❌ Erro no diagnóstico de auto followup:', error);
    return {
      error: 'Erro interno no diagnóstico',
      details: error.message,
      contact_id: contactId,
      workflow_name: workflowName
    };
  }
}

// Listar conversas aguardando followup
async function getPendingFollowups() {
  try {
    // Buscar workflows com auto_followup
    const workflowsWithFollowup = await getWorkflowsWithAutoFollowup();
    
    if (workflowsWithFollowup.length === 0) {
      return {
        total_conversations: 0,
        conversations: []
      };
    }
    
    const workflowNames = workflowsWithFollowup.map(w => w.workflow_name);
    
    // Buscar conversas ativas nesses workflows
    const activeConversations = await pool.query(`
      SELECT 
        wc.id as conversation_id,
        wc.contact_id,
        wc.workflow_name,
        wc.current_block,
        wc.last_activity,
        EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive
      FROM workflow_conversations wc
      WHERE wc.status = 'active'
        AND wc.last_activity IS NOT NULL
        AND wc.workflow_name = ANY($1)
      ORDER BY wc.last_activity ASC
    `, [workflowNames]);
    
    const pendingConversations = [];
    
    for (const conversation of activeConversations.rows) {
      const workflow = await conversationManager.loadWorkflowFromDatabase(conversation.workflow_name);
      if (!workflow || !workflow.auto_followup) continue;
      
      const secondsInactive = Math.floor(parseFloat(conversation.seconds_inactive));
      
      // Verificar quais followups estão prontos
      const readyFollowups = [];
      for (const [blockName, followupConfig] of Object.entries(workflow.auto_followup)) {
        const delaySeconds = followupConfig.delay / 1000;
        const isReady = secondsInactive >= delaySeconds;
        
        if (isReady) {
          const alreadyExecuted = await checkIfFollowupAlreadyExecuted(conversation.id, blockName, delaySeconds);
          const isBotActive = await isBotActiveForConversation(conversation.conversation_id, conversation.contact_id, CHATWOOT_ACCOUNT_ID);
          
          if (!alreadyExecuted && isBotActive) {
            readyFollowups.push({
              block_name: blockName,
              delay_seconds: delaySeconds,
              delay_formatted: `${Math.round(delaySeconds / 60)} minutos`,
              seconds_inactive: secondsInactive,
              minutes_inactive: Math.floor(secondsInactive / 60)
            });
          }
        }
      }
      
      if (readyFollowups.length > 0) {
        pendingConversations.push({
          conversation_id: conversation.conversation_id,
          contact_id: conversation.contact_id,
          workflow_name: conversation.workflow_name,
          current_block: conversation.current_block,
          last_activity: conversation.last_activity,
          ready_followups: readyFollowups
        });
      }
    }
    
    return {
      total_conversations: pendingConversations.length,
      conversations: pendingConversations
    };
    
  } catch (error) {
    console.error('❌ Erro ao listar followups pendentes:', error);
    throw error;
  }
}

// Endpoint para diagnóstico de auto followup
app.get('/api/diagnose-auto-followup', authenticateToken, async (req, res) => {
  try {
    const { contactId, workflowName } = req.query;
    
    if (!contactId || !workflowName) {
      return res.status(400).json({ 
        error: 'contactId e workflowName são obrigatórios' 
      });
    }
    
    const diagnosis = await diagnoseAutoFollowup(contactId, workflowName);
    res.json(diagnosis);
    
  } catch (error) {
    console.error('❌ Erro no diagnóstico via API:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// Função para processar uma campanha (enviar mensagens via API do WhatsApp)
// ==================== FUNÇÕES PARA AGENTES IA ====================

// Obter modelos disponíveis da API de agentes IA
async function getAvailableAIModels() {
  try {
    const response = await fetch(`${IA_AGENT_URL}/models`);
    if (!response.ok) {
      throw new Error(`Erro na API de agentes: ${response.status}`);
    }
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('Erro ao obter modelos IA:', error);
    return [];
  }
}

// Listar todos os agentes IA
async function getAllAIAgents() {
  try {
    const response = await fetch(`${IA_AGENT_URL}/agents`);
    if (!response.ok) {
      throw new Error(`Erro na API de agentes: ${response.status}`);
    }
    const data = await response.json();
    return data.agents || [];
  } catch (error) {
    console.error('Erro ao listar agentes IA:', error);
    return [];
  }
}

// Obter agente IA por ID
async function getAIAgentById(agentId) {
  try {
    const response = await fetch(`${IA_AGENT_URL}/agents/${agentId}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Erro na API de agentes: ${response.status}`);
    }
    const data = await response.json();
    return data.agent || null;
  } catch (error) {
    console.error('Erro ao obter agente IA:', error);
    return null;
  }
}

// Criar novo agente IA
async function createAIAgent(agentData, userId) {
  try {
    const response = await fetch(`${IA_AGENT_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData)
    });
    
    if (!response.ok) {
      throw new Error(`Erro na API de agentes: ${response.status}`);
    }
    
    const data = await response.json();
    return data.agent;
  } catch (error) {
    console.error('Erro ao criar agente IA:', error);
    throw error;
  }
}

// Atualizar agente IA
async function updateAIAgent(agentId, agentData, userId) {
  try {
    const response = await fetch(`${IA_AGENT_URL}/agents/${agentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData)
    });
    
    if (!response.ok) {
      throw new Error(`Erro na API de agentes: ${response.status}`);
    }
    
    const data = await response.json();
    return data.agent;
  } catch (error) {
    console.error('Erro ao atualizar agente IA:', error);
    throw error;
  }
}

// Deletar agente IA
async function deleteAIAgent(agentId) {
  try {
    // Primeiro, desvincular de workflows
    await pool.query('DELETE FROM workflow_ai_agents WHERE ai_agent_id = $1', [agentId]);
    
    // Depois deletar o agente via API
    const response = await fetch(`${IA_AGENT_URL}/agents/${agentId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Erro na API de agentes: ${response.status}`);
    }
    
    const data = await response.json();
    return data.agent;
  } catch (error) {
    console.error('Erro ao deletar agente IA:', error);
    throw error;
  }
}

// Vincular agente IA a um workflow
async function linkAIAgentToWorkflow(workflowName, agentId) {
  try {
    const result = await pool.query(`
      INSERT INTO workflow_ai_agents (workflow_name, ai_agent_id)
      VALUES ($1, $2)
      ON CONFLICT (workflow_name) 
      DO UPDATE SET ai_agent_id = $2, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [workflowName, agentId]);
    
    return result.rows[0];
  } catch (error) {
    console.error('Erro ao vincular agente IA ao workflow:', error);
    throw error;
  }
}

// Desvincular agente IA de um workflow
async function unlinkAIAgentFromWorkflow(workflowName) {
  try {
    const result = await pool.query(`
      DELETE FROM workflow_ai_agents 
      WHERE workflow_name = $1
      RETURNING *
    `, [workflowName]);
    
    return result.rows[0];
  } catch ( error) {
    console.error('Erro ao desvincular agente IA do workflow:', error);
    throw error;
  }
}

// Obter agente IA vinculado a um workflow
async function getAIAgentByWorkflow(workflowName) {
  try {
    // Primeiro, buscar o agent_id vinculado ao workflow
    const result = await pool.query(`
      SELECT ai_agent_id, is_active as link_active
      FROM workflow_ai_agents
      WHERE workflow_name = $1 AND is_active = true
    `, [workflowName]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const agentId = result.rows[0].ai_agent_id;
    
    // Buscar os dados do agente na API ia-agent
    const agent = await getAIAgentById(agentId);
    
    if (agent) {
      // Adicionar informação do link
      agent.link_active = result.rows[0].link_active;
    }
    
    return agent;
  } catch (error) {
    console.error('Erro ao obter agente IA do workflow:', error);
    return null;
  }
}

// Enviar mensagem para agente IA
function extractWhatsAppFromMessage(message) {
  try {
    // Padrões para WhatsApp: (11) 99999-9999, 11999999999, +55 11 99999-9999, etc.
    const whatsappPatterns = [
      /\(\d{2}\)\s?\d{4,5}-?\d{4}/g,  // (11) 99999-9999 ou (11)99999-9999
      /\d{10,11}/g,  // 11999999999
      /\+55\s?\d{2}\s?\d{4,5}-?\d{4}/g,  // +55 11 99999-9999
      /whatsapp[:\s]*[\d\s\(\)\-\+]+/gi,  // whatsapp: (11) 99999-9999
    ];
    
    for (const pattern of whatsappPatterns) {
      const matches = message.match(pattern);
      if (matches && matches.length > 0) {
        // Limpar e formatar o número
        let number = matches[0].replace(/[^\d]/g, ''); // Remove tudo exceto dígitos
        
        if (number.length >= 10) { // Número válido
          // Formatar como (XX) XXXXX-XXXX se tiver 11 dígitos
          if (number.length === 11) {
            return `(${number.substring(0, 2)}) ${number.substring(2, 7)}-${number.substring(7)}`;
          } else if (number.length === 10) {
            return `(${number.substring(0, 2)}) ${number.substring(2, 6)}-${number.substring(6)}`;
          } else {
            return number;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao extrair WhatsApp da mensagem:', error);
    return null;
  }
}

// Função auxiliar para criar arquivo .ics temporário
function createTempIcsFile(icsContent, filename) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Criar diretório temp se não existir
    const tempDir = '/tmp/ics_files';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Gerar caminho único para o arquivo
    const filePath = path.join(tempDir, filename);
    
    // Escrever conteúdo do arquivo
    fs.writeFileSync(filePath, icsContent, 'utf8');
    
    return {
      path: filePath,
      originalname: filename,
      mimetype: 'text/calendar',
      size: Buffer.byteLength(icsContent, 'utf8')
    };
  } catch (error) {
    console.error('Erro ao criar arquivo .ics temporário:', error);
    return null;
  }
}

async function sendMessageToAIAgent(agentId, message, conversationHistory = [], contactId = null, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    let whatsapp = null;
    let contactName = null;
    
    // Se temos contactId, buscar informações do contato
    if (contactId) {
      try {
        console.log(`🔍 Buscando contato ${contactId} na conta ${accountId}`);
        
        // Verificar se contactId é um número (ID real) ou string (número de telefone)
        const isNumericId = /^\d+$/.test(contactId);
        
        let contactResponse;
        if (isNumericId) {
          // Buscar por ID numérico
          contactResponse = await axios.get(
            `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`,
            { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
          );
        } else {
          // Buscar por número de telefone
          contactResponse = await axios.get(
            `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/search`,
            { 
              headers: { 'api_access_token': CHATWOOT_API_TOKEN },
              params: { q: contactId }
            }
          );
        }
        
        if (contactResponse.data && contactResponse.data.payload) {
          const contact = Array.isArray(contactResponse.data.payload) 
            ? contactResponse.data.payload[0] 
            : contactResponse.data.payload;
            
          const phoneNumber = contact.phone_number || contact.phone || contactId;
          contactName = contact.name || null;
          
          // Formatar o número do Chatwoot para formato brasileiro
          if (phoneNumber) {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            if (cleanNumber.length >= 10) {
              if (cleanNumber.length === 11) {
                whatsapp = `(${cleanNumber.substring(0, 2)}) ${cleanNumber.substring(2, 7)}-${cleanNumber.substring(7)}`;
              } else if (cleanNumber.length === 10) {
                whatsapp = `(${cleanNumber.substring(0, 2)}) ${cleanNumber.substring(2, 6)}-${cleanNumber.substring(6)}`;
              } else {
                whatsapp = cleanNumber;
              }
              console.log(`📱 WhatsApp extraído do contato: ${phoneNumber} → ${whatsapp}`);
            }
          }
          
          if (contactName) {
            console.log(`👤 Nome do contato: ${contactName}`);
          }
        }
      } catch (error) {
        console.error(`⚠️ Erro ao buscar informações do contato ${contactId} na conta ${accountId}:`, error.message);
        if (error.response) {
          console.error(`   Status: ${error.response.status}`);
          console.error(`   Data:`, error.response.data);
        }
        
        // Fallback: se contactId parece ser um número de telefone, usar diretamente
        if (/^[\d\s\(\)\-\+]+$/.test(contactId)) {
          const cleanNumber = contactId.replace(/[^\d]/g, '');
          if (cleanNumber.length >= 10) {
            if (cleanNumber.length === 11) {
              whatsapp = `(${cleanNumber.substring(0, 2)}) ${cleanNumber.substring(2, 7)}-${cleanNumber.substring(7)}`;
            } else if (cleanNumber.length === 10) {
              whatsapp = `(${cleanNumber.substring(0, 2)}) ${cleanNumber.substring(2, 6)}-${cleanNumber.substring(6)}`;
            } else {
              whatsapp = cleanNumber;
            }
            console.log(`📱 WhatsApp extraído como fallback: ${contactId} → ${whatsapp}`);
          }
        }
      }
    }
    
    // Fallback: tentar extrair WhatsApp da mensagem se não tiver do contato
    if (!whatsapp) {
      whatsapp = extractWhatsAppFromMessage(message);
      if (whatsapp) {
        console.log(`📱 WhatsApp extraído da mensagem: ${whatsapp}`);
      }
    }
    
    const response = await fetch(`${IA_AGENT_URL}/agents/${agentId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        chat_history: conversationHistory,
        whatsapp: whatsapp,
        contact_name: contactName
      })
    });
    
    if (!response.ok) {
      throw new Error(`Erro na API de agentes: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro ao enviar mensagem para agente IA:', error);
    throw error;
  }
}

async function processCampaign(campaignId) {
  console.log(`🚀 Iniciando processamento da campanha ${campaignId}...`);
  
  try {
    // Busca dados da campanha
    const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
    if (rows.length === 0) {
      console.error(`❌ Campanha ${campaignId} não encontrada`);
      return;
    }
    
    const campaign = rows[0];
    console.log(`📋 Processando campanha: ${campaign.name} (Tipo: ${campaign.type})`);
    
    let contacts = [];
    
    // Busca contatos conforme tipo da campanha
    if (campaign.type === 'csv') {
      const result = await pool.query('SELECT * FROM campaign_contacts WHERE campaign_id = $1', [campaignId]);
      contacts = result.rows;
      console.log(`📞 Carregados ${contacts.length} contatos do CSV`);
    } else if (campaign.type === 'tag') {
      // Busca contatos via API do Chatwoot pela tag
      const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${campaign.chatwoot_account_id}/contacts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { label: campaign.tag_name }
      });
      
      const chatwootContacts = (response.data.payload || []).map(c => ({ 
        name: c.name, 
        phone: c.phone_number 
      }));
      
      // Inserir contatos na tabela campaign_contacts
      console.log(`📝 Inserindo ${chatwootContacts.length} contatos da tag '${campaign.tag_name}' na tabela...`);
      contacts = [];
      for (const contact of chatwootContacts) {
        if (contact.phone) {
          try {
            const insertResult = await pool.query(
              'INSERT INTO campaign_contacts (campaign_id, name, phone) VALUES ($1, $2, $3) RETURNING *',
              [campaignId, contact.name || 'Cliente', contact.phone]
            );
            contacts.push(insertResult.rows[0]);
          } catch (insertError) {
            console.error(`❌ Erro ao inserir contato ${contact.phone}:`, insertError.message);
          }
        }
      }
      console.log(`✅ ${contacts.length} contatos inseridos na tabela campaign_contacts`);
    }
    
    if (contacts.length === 0) {
      console.log(`⚠️ Nenhum contato encontrado para a campanha ${campaignId}`);
      await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', campaignId]);
      return;
    }
    
    // Buscar credenciais da caixa de entrada
    const inboxDetailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${campaign.chatwoot_account_id}/inboxes/${campaign.chatwoot_inbox_id}`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    
    let inboxDetails = inboxDetailsResponse.data.payload;
    if (!inboxDetails && inboxDetailsResponse.data && inboxDetailsResponse.data.id) {
      inboxDetails = inboxDetailsResponse.data;
    }
    
    if (!inboxDetails) {
      throw new Error('Caixa de entrada não encontrada');
    }
    
    const config = inboxDetails.provider_config;
    if (!config?.business_account_id || !config?.api_key || !config?.phone_number_id) {
      throw new Error('Credenciais da API oficial do WhatsApp não configuradas para esta caixa');
    }
    
    // Buscar template na API oficial do WhatsApp
    let templateLanguage = campaign.template_language || 'pt_BR';
    const whatsappTemplatesResponse = await axios.get(
      `https://graph.facebook.com/v23.0/${config.business_account_id}/message_templates`,
      {
        headers: { 'Authorization': `Bearer ${config.api_key}` },
        params: { fields: 'name,status,category,language,components', limit: 100 }
      }
    );
    
    const templates = (whatsappTemplatesResponse.data.data || []).filter(t => t.status === 'APPROVED');
    const selectedTemplate = templates.find(t => t.name === campaign.template_name);
    
    if (!selectedTemplate) {
      throw new Error(`Template '${campaign.template_name}' não encontrado ou não aprovado`);
    }
    
    templateLanguage = selectedTemplate.language || templateLanguage;
    console.log(`📋 Template encontrado: ${campaign.template_name} (${templateLanguage})`);
    
    // Inserir registros iniciais nas tabelas de controle
    console.log(`📝 Criando registros de controle para ${contacts.length} contatos...`);
    
    for (const contact of contacts) {
      try {
        // Verificar se já existe em campaign_status antes de inserir
        const existingStatus = await pool.query(
          'SELECT id FROM campaign_status WHERE campaign_id = $1 AND contact_id = $2',
          [campaignId, contact.id]
        );
        
        if (existingStatus.rows.length === 0) {
          await pool.query(
            'INSERT INTO campaign_status (campaign_id, contact_id, status, created_at) VALUES ($1, $2, $3, NOW())',
            [campaignId, contact.id, 'pending']
          );
        }
        
        // Verificar se já existe em campaign_executions antes de inserir
        const existingExecution = await pool.query(
          'SELECT id FROM campaign_executions WHERE campaign_id = $1 AND contact_id = $2',
          [campaignId, contact.phone]
        );
        
        if (existingExecution.rows.length === 0) {
          await pool.query(
            'INSERT INTO campaign_executions (campaign_id, contact_id, status, created_at) VALUES ($1, $2, $3, NOW())',
            [campaignId, contact.phone, 'pending']
          );
        }
      } catch (insertError) {
        console.error(`❌ Erro ao inserir registros de controle para ${contact.phone}:`, insertError.message);
      }
    }
    
    console.log(`✅ Registros de controle criados`);
    
    // Processar envio para cada contato
    let successCount = 0;
    let errorCount = 0;
    
    for (const contact of contacts) {
      try {
        // ===== VERIFICAÇÃO DE CONTATO EVOLUTIONAPI =====
        // Verificar se o contato é o EvolutionAPI
        const contactName = contact.name || '';
        const phoneNumber = contact.phone || '';
        
        const isEvolutionAPI = contactName.toLowerCase().includes('evolutionapi') || 
                              phoneNumber.includes('+123456') ||
                              phoneNumber.includes('123456');
        
        if (isEvolutionAPI) {
          console.log(`🚫 Ignorando contato EvolutionAPI na campanha: ${contactName} (${phoneNumber})`);
          continue; // Pular este contato
        }
        
        // Normalizar telefone para formato E.164
        let normalizedPhone = contact.phone.replace(/[^\d+]/g, '');
        if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = '+' + normalizedPhone;
        }
        
        // Buscar conversa existente no Chatwoot (opcional)
        let conversationId = null;
        try {
          const conversationsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${campaign.chatwoot_account_id}/conversations`, {
            headers: { 'api_access_token': CHATWOOT_API_TOKEN },
            params: { 
              status: 'open',
              inbox_id: campaign.chatwoot_inbox_id 
            }
          });
          
          if (conversationsResponse.data?.data?.payload) {
            const existingConversation = conversationsResponse.data.data.payload.find(conv => {
              const senderPhone = conv.meta?.sender?.phone_number;
              return senderPhone && senderPhone.replace(/\D/g, '') === normalizedPhone.replace(/\D/g, '');
            });
            
            if (existingConversation) {
              conversationId = existingConversation.id;
            }
          }
        } catch (convError) {
          // Ignorar erro de busca de conversa, não é crítico
        }
        
        // Montar payload para API oficial do WhatsApp
        const bodyComponent = selectedTemplate.components?.find(c => c.type === 'BODY');
        
        console.log(`[INFO] Template text: ${bodyComponent?.text}`);
        console.log(`[INFO] Template example:`, JSON.stringify(bodyComponent?.example, null, 2));
        
        const paramValues = [contact.name || 'Cliente', contact.phone || '', campaign.name || '', new Date().toLocaleDateString(templateLanguage === 'pt_BR' ? 'pt-BR' : 'en-US')];
        const parameters = [];
        
        // Verificar se template tem parâmetros nomeados ou numerados
        if (bodyComponent && bodyComponent.text) {
          // Primeiro verificar se há parâmetros nomeados na estrutura example
          if (bodyComponent.example && bodyComponent.example.body_text_named_params) {
            // Template com parâmetros nomeados - usar estrutura com parameter_name
            bodyComponent.example.body_text_named_params.forEach((namedParam, index) => {
              parameters.push({
                type: 'text',
                parameter_name: namedParam.param_name,
                text: paramValues[index] || ''
              });
            });
            console.log(`[INFO] Using named parameters structure, count: ${parameters.length}`);
          } else {
            // Template com parâmetros numerados ou sem exemplo específico
            const numberedParams = bodyComponent.text.match(/\{\{\d+\}\}/g) || [];
            const namedParams = bodyComponent.text.match(/\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g) || [];
            const totalParams = Math.max(numberedParams.length, namedParams.length);
            
            for (let i = 0; i < totalParams; i++) {
              parameters.push({ 
                type: 'text', 
                text: paramValues[i] || '' 
              });
            }
            console.log(`[INFO] Using positional parameters, count: ${totalParams}`);
          }
        }
        
        //console.log(`[INFO] Final parameters:`, JSON.stringify(parameters, null, 2));
        
        const bodyComponentObj = { type: 'body' };
        if (parameters.length > 0) {
          bodyComponentObj.parameters = parameters;
        }
        
        const payload = {
          messaging_product: 'whatsapp',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: campaign.template_name,
            language: { code: templateLanguage },
            components: [bodyComponentObj]
          }
        };
        
        // Enviar mensagem via API oficial do WhatsApp
        const sendResponse = await axios.post(
          `https://graph.facebook.com/v23.0/${config.phone_number_id}/messages`,
          payload,
          { headers: { Authorization: `Bearer ${config.api_key}` } }
        );
        
        console.log(`✅ Mensagem enviada para ${normalizedPhone} (${contact.name})`);
        console.log("Resposta da api do whatsapp: ",JSON.stringify(sendResponse.data, null, 2));
        successCount++;
        
        // Atualizar status de sucesso
        await pool.query(
          'UPDATE campaign_status SET status = $1, message_id = $2, error_message = NULL, sent_at = NOW() WHERE campaign_id = $3 AND contact_id = $4',
          ['sent', sendResponse.data.messages?.[0]?.id || null, campaignId, contact.id]
        );
        
        await pool.query(
          'UPDATE campaign_executions SET status = $1, conversation_id = $2, executed_at = NOW(), error_message = NULL WHERE campaign_id = $3 AND contact_id = $4',
          ['sent', conversationId, campaignId, contact.phone]
        );
        
      } catch (sendError) {
        const errorMsg = typeof sendError.response?.data === 'object' 
          ? JSON.stringify(sendError.response.data) 
          : (sendError.response?.data?.error?.message || sendError.message);
          
        console.error(`❌ Erro ao enviar para ${contact.phone} (${contact.name}): ${errorMsg}`);
        errorCount++;
        
        // Atualizar status de erro
        await pool.query(
          'UPDATE campaign_status SET status = $1, error_message = $2 WHERE campaign_id = $3 AND contact_id = $4',
          ['failed', errorMsg, campaignId, contact.id]
        );
        
        await pool.query(
          'UPDATE campaign_executions SET status = $1, executed_at = NOW(), error_message = $2 WHERE campaign_id = $3 AND contact_id = $4',
          ['failed', errorMsg, campaignId, contact.phone]
        );
      }
      
      // Pequena pausa entre envios para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Atualizar status final da campanha
    console.log(`📊 Processamento concluído da campanha ${campaignId}:`);
    console.log(`   ✅ Sucessos: ${successCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log(`   📞 Total: ${contacts.length}`);
    
    await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', campaignId]);
    console.log(`✅ Campanha ${campaignId} marcada como concluída`);
    
  } catch (error) {
    console.error(`❌ Erro geral no processamento da campanha ${campaignId}:`, error);
    
    // Marcar campanha como failed
    try {
      await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', campaignId]);
      console.log(`❌ Campanha ${campaignId} marcada como falha devido ao erro`);
    } catch (updateError) {
      console.error(`❌ Erro ao atualizar status da campanha para failed:`, updateError);
    }
  }
}

// Criar campanha (por tag ou CSV)
app.post('/api/campaigns', authenticateToken, authorizeAccount, async (req, res) => {
  try {
    const { name, type, tag_name, template_name, scheduled_at, chatwoot_account_id, chatwoot_inbox_id } = req.body;
    if (!name || !type || !template_name || !chatwoot_account_id || !chatwoot_inbox_id) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    
    // Log para debug do scheduled_at
    if (scheduled_at) {
      console.log(`📅 Backend recebeu scheduled_at: ${scheduled_at} (tipo: ${typeof scheduled_at})`);
    }
    
    // Processar scheduled_at para timezone do Brasil
    let scheduledAtProcessed = scheduled_at;
    if (scheduled_at) {
      // Se o scheduled_at não tem timezone, assumir que está em horário do Brasil
      if (!scheduled_at.includes('+') && !scheduled_at.includes('-') && !scheduled_at.includes('Z')) {
        // Adicionar timezone do Brasil para garantir interpretação correta
        scheduledAtProcessed = scheduled_at + '-03:00';
        console.log(`📅 Adicionando timezone Brasil ao scheduled_at: ${scheduled_at} -> ${scheduledAtProcessed}`);
      }
    }
    
    // Buscar informações do template selecionado
    let templateLanguage = 'pt_BR'; // padrão
    let templateCategory = 'UTILITY'; // padrão
    
    if (template_name) {
      try {
        console.log(`🔍 Buscando informações do template: ${template_name}`);
        
        // Buscar caixas de entrada WhatsApp
        const inboxesResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${chatwoot_account_id}/inboxes`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN }
        });
        
        const whatsappInboxes = (inboxesResponse.data.payload || []).filter(i => isSupportedInbox(i));
        
        // Buscar templates de cada caixa para encontrar o selecionado
        for (const inbox of whatsappInboxes) {
          try {
            const inboxDetailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${chatwoot_account_id}/inboxes/${inbox.id}`, {
              headers: { 'api_access_token': CHATWOOT_API_TOKEN }
            });
            
            const inboxDetails = inboxDetailsResponse.data.payload;
            
            // Verificar se há configuração WhatsApp
            if (inboxDetails?.provider_config?.business_account_id && inboxDetails?.provider_config?.api_key) {
              const config = inboxDetails.provider_config;
              
              // Buscar templates via API oficial do WhatsApp
              const whatsappResponse = await axios.get(
                `https://graph.facebook.com/v23.0/${config.business_account_id}/message_templates`,
                {
                  headers: { 'Authorization': `Bearer ${config.api_key}` },
                  params: { 
                    fields: 'name,status,category,language,components',
                    limit: 100 
                  }
                }
              );
              console.log('🔍 Resposta da API do WhatsApp:', whatsappResponse.data);
              
              if (whatsappResponse.data?.data) {
                const templates = whatsappResponse.data.data.filter(t => t.status === 'APPROVED');
                const selectedTemplate = templates.find(t => t.name === template_name);
                
                if (selectedTemplate) {
                  templateLanguage = selectedTemplate.language || 'pt_BR';
                  templateCategory = selectedTemplate.category || 'UTILITY';
                  console.log(`✅ Template encontrado: ${template_name} (${templateLanguage}, ${templateCategory})`);
                  break; // Encontrou o template, sair do loop
                }
              }
            }
          } catch (inboxError) {
            console.log(`❌ Erro ao buscar template na caixa ${inbox.name}: ${inboxError.message}`);
            continue;
          }
        }
        
        if (templateLanguage === 'pt_BR' && templateCategory === 'UTILITY') {
          console.log(`⚠️ Template ${template_name} não encontrado via API, usando padrões`);
        }
        
      } catch (templateError) {
        console.log(`❌ Erro ao buscar informações do template: ${templateError.message}, usando padrões`);
      }
    }
    
    // Inserir campanha no banco incluindo informações do template
    const result = await pool.query(
      `INSERT INTO campaigns (name, type, tag_name, template_name, template_language, template_category, scheduled_at, chatwoot_account_id, chatwoot_inbox_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [name, type, tag_name || null, template_name, templateLanguage, templateCategory, scheduledAtProcessed, chatwoot_account_id, chatwoot_inbox_id, req.user.id]
    );
    
    console.log(`🎯 Campanha criada com template: ${template_name} (${templateLanguage}, ${templateCategory})`);
    
    // Log para verificar como o scheduled_at foi salvo
    if (result.rows[0].scheduled_at) {
      console.log(`📅 Campanha salva com scheduled_at: ${result.rows[0].scheduled_at}`);
    }
    
    res.json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar campanha:', error);
    res.status(500).json({ error: 'Erro ao criar campanha' });
  }
});

// Listar campanhas com estatísticas detalhadas
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        c.*,
        c.created_at - INTERVAL '3 hours' as created_at_brasil,
        u.username as username,
        COALESCE(cc.total_contacts, 0) as total_contacts,
        COALESCE(cs.total_sends, 0) as total_sends,
        COALESCE(cs.sent_count, 0) as sent_count,
        COALESCE(cs.delivered_count, 0) as delivered_count,
        COALESCE(cs.failed_count, 0) as failed_count,
        COALESCE(cs.pending_count, 0) as pending_count
      FROM campaigns c
      LEFT JOIN system_users u ON c.created_by = u.id
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) as total_contacts
        FROM campaign_contacts
        GROUP BY campaign_id
      ) cc ON c.id = cc.campaign_id
      LEFT JOIN (
        SELECT 
          campaign_id,
          COUNT(*) as total_sends,
          COUNT(CASE WHEN status IN ('sent', 'delivered', 'read') THEN 1 END) as sent_count,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
          COUNT(CASE WHEN status IN ('failed', 'error') THEN 1 END) as failed_count,
          COUNT(CASE WHEN status IN ('pending', 'queued') THEN 1 END) as pending_count
        FROM campaign_status
        GROUP BY campaign_id
      ) cs ON c.id = cs.campaign_id
    `;
    
    let queryParams = [];
    
    // Se não for admin, filtrar apenas campanhas do próprio usuário
    if (req.user.role !== 'admin') {
      query += ` WHERE c.created_by = $1`;
      queryParams.push(req.user.id);
    }
    
    query += `
      ORDER BY c.created_at DESC
    `;
    
    console.log('📊 Executando query de campanhas com contadores corrigidos...');
    const result = await pool.query(query, queryParams);
    
    // Log para debug
    if (result.rows.length > 0) {
      const sampleCampaign = result.rows.find(row => row.id == 35) || result.rows[0];
      console.log(`📊 Exemplo de campanha (${sampleCampaign.id}):`, {
        name: sampleCampaign.name,
        total_contacts: sampleCampaign.total_contacts,
        total_sends: sampleCampaign.total_sends,
        status: sampleCampaign.status
      });
      
      // DEBUG: Log específico para campanhas com agendamento
      const campanhaComAgendamento = result.rows.find(row => row.scheduled_at);
      // if (campanhaComAgendamento) {
      //   console.log('🔍 DEBUG BACKEND - Campanha com agendamento:');
      //   console.log('   📅 scheduled_at (valor do PG):', campanhaComAgendamento.scheduled_at);
      //   console.log('   📅 tipo:', typeof campanhaComAgendamento.scheduled_at);
      //   console.log('   📅 instanceof Date:', campanhaComAgendamento.scheduled_at instanceof Date);
      //   console.log('   📅 toString():', campanhaComAgendamento.scheduled_at.toString());
      // }
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar campanhas:', error);
    res.status(500).json({ error: 'Erro ao listar campanhas' });
  }
});

// Detalhes de uma campanha com contadores calculados
app.get('/api/campaigns/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar dados básicos da campanha
    const campaignResult = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    
    const campaign = campaignResult.rows[0];
    
    // Calcular total de contatos
    const contactsResult = await pool.query(
      'SELECT COUNT(*) as total_contacts FROM campaign_contacts WHERE campaign_id = $1',
      [id]
    );
    
    // Calcular estatísticas de envio
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_sends,
        COUNT(CASE WHEN status = 'sent' OR status = 'delivered' OR status = 'read' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' OR status = 'error' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'pending' OR status = 'queued' THEN 1 END) as pending_count
      FROM campaign_status 
      WHERE campaign_id = $1
    `, [id]);
    
    // Combinar dados
    const campaignDetails = {
      ...campaign,
      total_contacts: parseInt(contactsResult.rows[0].total_contacts) || 0,
      total_sends: parseInt(statsResult.rows[0].total_sends) || 0,
      sent_count: parseInt(statsResult.rows[0].sent_count) || 0,
      failed_count: parseInt(statsResult.rows[0].failed_count) || 0,
      pending_count: parseInt(statsResult.rows[0].pending_count) || 0
    };
    
    console.log(`📊 Detalhes da campanha ${id}:`, {
      total_contacts: campaignDetails.total_contacts,
      total_sends: campaignDetails.total_sends,
      sent_count: campaignDetails.sent_count,
      failed_count: campaignDetails.failed_count,
      pending_count: campaignDetails.pending_count,
      status: campaign.status
    });
    
    res.json(campaignDetails);
  } catch (error) {
    console.error('Erro ao obter campanha:', error);
    res.status(500).json({ error: 'Erro ao obter campanha' });
  }
});

// Listar contatos de uma campanha
app.get('/api/campaigns/:id/contacts', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se a campanha existe
    const campaignCheck = await pool.query('SELECT id FROM campaigns WHERE id = $1', [id]);
    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    
    // Buscar contatos da campanha
    const result = await pool.query(
      'SELECT * FROM campaign_contacts WHERE campaign_id = $1 ORDER BY created_at',
      [id]
    );
    
    console.log(`📞 Contatos da campanha ${id}: ${result.rows.length} encontrados`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar contatos da campanha:', error);
    res.status(500).json({ error: 'Erro ao listar contatos da campanha' });
  }
});

// Endpoint para verificar status do banco de dados da campanha
app.post('/api/campaigns/check-database', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.body;
    
    console.log(`🔍 Verificando banco de dados para campanha ${campaignId}...`);
    
    const checks = {
      timestamp: new Date().toISOString(),
      campaignId: campaignId,
      database: process.env.DATABASE_URL ? 'Configurado' : 'Não configurado',
      tables: {},
      campaign: null,
      contacts: null,
      status: null
    };
    
    // Verificar se as tabelas existem
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('campaigns', 'campaign_contacts', 'campaign_status')
      ORDER BY table_name
    `);
    
    checks.tables.existing = tablesCheck.rows.map(row => row.table_name);
    checks.tables.missing = ['campaigns', 'campaign_contacts', 'campaign_status']
      .filter(table => !checks.tables.existing.includes(table));
    
    if (campaignId) {
      // Verificar dados específicos da campanha
      try {
        const campaignCheck = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
        checks.campaign = {
          exists: campaignCheck.rows.length > 0,
          data: campaignCheck.rows[0] || null
        };
        
        if (checks.campaign.exists) {
          // Verificar contatos
          const contactsCheck = await pool.query(
            'SELECT COUNT(*) as total, json_agg(json_build_object(\'name\', name, \'phone\', phone)) as sample FROM campaign_contacts WHERE campaign_id = $1',
            [campaignId]
          );
          checks.contacts = {
            total: parseInt(contactsCheck.rows[0].total) || 0,
            sample: contactsCheck.rows[0].sample || []
          };
          
          // Verificar status de envio
          const statusCheck = await pool.query(
            'SELECT COUNT(*) as total, status, COUNT(*) as count FROM campaign_status WHERE campaign_id = $1 GROUP BY status',
            [campaignId]
          );
          checks.status = {
            total_records: statusCheck.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
            by_status: statusCheck.rows.reduce((acc, row) => {
              acc[row.status] = parseInt(row.count);
              return acc;
            }, {})
          };
        }
      } catch (dbError) {
        checks.error = `Erro ao verificar dados da campanha: ${dbError.message}`;
      }
    }
    
    console.log('📊 Resultado da verificação do banco:', checks);
    
    res.json({ success: true, checks });
  } catch (error) {
    console.error('Erro na verificação do banco:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      hint: 'Execute o script create-campaign-tables.sql no PostgreSQL'
    });
  }
});

app.delete('/api/campaigns/:id', authenticateToken, async (req, res) => {
  try {
    // Apenas admins podem excluir campanhas
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem excluir campanhas' });
    }
    
    const { id } = req.params;
    
    // Excluir execuções de campanhas primeiro (devido à foreign key constraint)
    await pool.query('DELETE FROM campaign_executions WHERE campaign_id = $1', [id]);
    
    // Excluir status/envios
    await pool.query('DELETE FROM campaign_status WHERE campaign_id = $1', [id]);
    
    // Excluir contatos da campanha
    await pool.query('DELETE FROM campaign_contacts WHERE campaign_id = $1', [id]);
    
    // Excluir a campanha
    const result = await pool.query('DELETE FROM campaigns WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    res.json({ success: true, message: 'Campanha e registros relacionados excluídos com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir campanha:', error);
    res.status(500).json({ error: 'Erro ao excluir campanha: ' + error.message });
  }
});

// Upload de CSV de contatos para uma campanha
app.post('/api/campaigns/:id/upload-csv', authenticateToken, upload.single('file'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo CSV não enviado' });
  }
  const filePath = req.file.path;
  const imported = [];
  const errors = [];
  const stream = fs.createReadStream(filePath).pipe(csv({ separator: ';', headers: ['name', 'phone'], skipLines: 0 }));
  for await (const row of stream) {
    const name = (row.name || '').trim();
    const phone = (row.phone || '').replace(/\D/g, '');
    // Validar apenas se telefone existe (nome pode estar vazio)
    if (!phone) {
      errors.push({ row, error: 'Telefone inválido ou vazio' });
      continue;
    }
    try {
      await pool.query(
        'INSERT INTO campaign_contacts (campaign_id, name, phone) VALUES ($1, $2, $3)',
        [id, name, phone]
      );
      imported.push({ name, phone });
    } catch (err) {
      errors.push({ row, error: err.message });
    }
  }
  fs.unlink(filePath, () => {}); // Remove arquivo temporário
  res.json({ success: true, imported, errors });
});

// Cancelar campanha
app.post('/api/campaigns/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Atualiza status da campanha para 'cancelled'
    const result = await pool.query(
      `UPDATE campaigns SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status IN ('pending', 'running') RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Campanha não encontrada ou não pode ser cancelada' });
    }
    // Opcional: também atualizar status dos contatos ainda não enviados
    await pool.query(
      `UPDATE campaign_status SET status = 'cancelled' WHERE campaign_id = $1 AND status = 'pending'`,
      [id]
    );
    res.json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    console.error('Erro ao cancelar campanha:', error);
    res.status(500).json({ error: 'Erro ao cancelar campanha' });
  }
});

// Iniciar/executar campanha manualmente
app.post('/api/campaigns/:id/start', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🚀 Solicitação para iniciar campanha ${id} manualmente...`);
    
    // Verifica se a campanha existe e pode ser iniciada
    const result = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    
    const campaign = result.rows[0];
    
    // Verificar se a campanha pode ser iniciada
    if (['running', 'completed'].includes(campaign.status)) {
      return res.status(400).json({ 
        error: 'Campanha já foi iniciada ou finalizada',
        current_status: campaign.status 
      });
    }
    
    // Verificar se é uma campanha cancelada
    if (campaign.status === 'cancelled') {
      return res.status(400).json({ 
        error: 'Campanha foi cancelada e não pode ser iniciada',
        current_status: campaign.status 
      });
    }
    
    console.log(`📋 Iniciando campanha: ${campaign.name} (Status atual: ${campaign.status})`);
    
    // Atualiza status para 'running'
    await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['running', id]);
    
    // Inicia processamento em background
    processCampaign(id).catch(err => {
      console.error(`❌ Erro no processamento da campanha ${id}:`, err);
      // Marcar como falha em caso de erro crítico
      pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', id])
        .catch(updateErr => console.error(`❌ Erro ao atualizar status para failed:`, updateErr));
    });
    
    console.log(`✅ Campanha ${id} (${campaign.name}) iniciada com sucesso`);
    
    res.json({ 
      success: true, 
      message: 'Campanha iniciada com sucesso',
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: 'running',
        type: campaign.type,
        template_name: campaign.template_name
      }
    });
    
  } catch (error) {
    console.error(`❌ Erro ao iniciar campanha ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Erro interno ao iniciar campanha',
      details: error.message 
    });
  }
});

// Reenviar campanhas com erro
app.post('/api/campaigns/:id/retry', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar campanha
    const campaignResult = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    
    const campaign = campaignResult.rows[0];
    
    // Resetar status dos contatos com falha para 'pending'
    const retryResult = await pool.query(
      'UPDATE campaign_status SET status = $1, error_message = NULL WHERE campaign_id = $2 AND status = $3',
      ['pending', id, 'failed']
    );
    
    // Resetar também executions com falha
    await pool.query(
      'UPDATE campaign_executions SET status = $1, error_message = NULL WHERE campaign_id = $2 AND status = $3',
      ['pending', id, 'failed']
    );
    
    const retryCount = retryResult.rowCount;
    
    if (retryCount === 0) {
      return res.json({ success: false, message: 'Nenhum contato com erro encontrado para reenvio' });
    }
    
    // Atualizar status da campanha para 'running'
    await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['running', id]);
    
    // Processar campanha em background (apenas os pendentes)
    processCampaign(id).catch(err => console.error('Erro no reenvio da campanha:', err));
    
    res.json({ 
      success: true, 
      message: `Reenvio iniciado para ${retryCount} contato(s) com erro`,
      retryCount: retryCount
    });
  } catch (error) {
    console.error('Erro ao reenviar campanha:', error);
    res.status(500).json({ error: 'Erro ao reenviar campanha' });
  }
});

// Obter detalhes de erros de uma campanha
app.get('/api/campaigns/:id/errors', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cs.contact_id,
        cs.status,
        cs.error_message,
        cs.created_at,
        cc.name,
        cc.phone,
        ce.error_message as execution_error
      FROM campaign_status cs
      LEFT JOIN campaign_contacts cc ON cs.contact_id = cc.id AND cs.campaign_id = cc.campaign_id
      LEFT JOIN campaign_executions ce ON cs.campaign_id = ce.campaign_id AND cc.phone = ce.contact_id
      WHERE cs.campaign_id = $1 AND cs.status = 'failed'
      ORDER BY cs.created_at DESC
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar erros da campanha:', error);
    res.status(500).json({ error: 'Erro ao buscar erros da campanha' });
  }
});

// Verificar e corrigir campanhas presas no status "running"
app.post('/api/campaigns/fix-stuck', authenticateToken, async (req, res) => {
  try {
    console.log('🔧 Verificando campanhas presas no status "running"...');
    
    // Buscar campanhas que estão "running" há mais de 30 minutos
    const stuckCampaigns = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.status,
        c.updated_at,
        COUNT(cs.id) as total_contacts,
        COUNT(CASE WHEN cs.status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN cs.status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN cs.status = 'pending' THEN 1 END) as pending_count
      FROM campaigns c
      LEFT JOIN campaign_status cs ON c.id = cs.campaign_id
      WHERE c.status = 'running' 
        AND c.updated_at < NOW() - INTERVAL '30 minutes'
      GROUP BY c.id, c.name, c.status, c.updated_at
      ORDER BY c.updated_at ASC
    `);
    
    if (stuckCampaigns.rows.length === 0) {
      return res.json({ 
        success: true, 
        message: 'Nenhuma campanha presa encontrada',
        fixed: 0
      });
    }
    
    let fixedCount = 0;
    const fixedCampaigns = [];
    
    for (const campaign of stuckCampaigns.rows) {
      const { id, name, total_contacts, sent_count, failed_count, pending_count } = campaign;
      
      console.log(`🔍 Analisando campanha ${id} (${name}): ${sent_count}/${total_contacts} enviadas, ${pending_count} pendentes`);
      
      // Se não há contatos pendentes, marcar como completed
      if (pending_count === 0) {
        await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', id]);
        console.log(`✅ Campanha ${id} marcada como 'completed'`);
        fixedCampaigns.push({ id, name, status: 'completed', reason: 'Todos os contatos foram processados' });
        fixedCount++;
      }
      // Se há muitos erros e poucos enviados, marcar como failed
      else if (failed_count > sent_count && failed_count > total_contacts * 0.5) {
        await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', id]);
        console.log(`❌ Campanha ${id} marcada como 'failed' devido a muitos erros`);
        fixedCampaigns.push({ id, name, status: 'failed', reason: 'Muitos erros de envio detectados' });
        fixedCount++;
      }
      // Se ainda há pendentes, tentar reprocessar
      else if (pending_count > 0) {
        console.log(`🔄 Reprocessando campanha ${id} com ${pending_count} contatos pendentes...`);
        processCampaign(id).catch(err => console.error(`Erro ao reprocessar campanha ${id}:`, err));
        fixedCampaigns.push({ id, name, status: 'reprocessing', reason: `Reprocessando ${pending_count} contatos pendentes` });
        fixedCount++;
      }
    }
    
    res.json({
      success: true,
      message: `${fixedCount} campanha(s) corrigida(s)`,
      fixed: fixedCount,
      campaigns: fixedCampaigns
    });
    
  } catch (error) {
    console.error('Erro ao corrigir campanhas presas:', error);
    res.status(500).json({ error: 'Erro ao corrigir campanhas presas' });
  }
});

// Buscar tags disponíveis via API do Chatwoot
app.get('/api/chatwoot/tags', authenticateToken, async (req, res) => {
  try {
    const accountId = req.query.accountId || CHATWOOT_ACCOUNT_ID;
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/labels`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    res.json(response.data.payload || []);
  } catch (error) {
    console.error('Erro ao buscar tags do Chatwoot:', error);
    res.status(500).json({ error: 'Erro ao buscar tags' });
  }
});

// Buscar agentes disponíveis via API do Chatwoot
app.get('/api/chatwoot/agents', authenticateToken, async (req, res) => {
  try {
    const accountId = req.query.accountId || CHATWOOT_ACCOUNT_ID;
    const agents = await getChatwootAgents(accountId);
    res.json(agents);
  } catch (error) {
    console.error('Erro ao buscar agentes do Chatwoot:', error);
    res.status(500).json({ error: 'Erro ao buscar agentes' });
  }
});

// Buscar times disponíveis via API do Chatwoot
app.get('/api/chatwoot/teams', authenticateToken, async (req, res) => {
  try {
    const accountId = req.query.accountId || CHATWOOT_ACCOUNT_ID;
    const teams = await getChatwootTeams(accountId);
    res.json(teams);
  } catch (error) {
    console.error('Erro ao buscar times do Chatwoot:', error);
    res.status(500).json({ error: 'Erro ao buscar times' });
  }
});

// Criar um novo label
app.post('/api/chatwoot/labels', authenticateToken, [
  body('title').notEmpty().withMessage('Título do label é obrigatório'),
  body('description').optional(),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Cor deve estar no formato hexadecimal #RRGGBB')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, color } = req.body;
    
    const accountId = req.query.accountId || CHATWOOT_ACCOUNT_ID;
    
    // Verificar se o label já existe
    const existingLabelsResponse = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/labels`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    const existingLabels = existingLabelsResponse.data.payload || [];
    const labelExists = existingLabels.some(label => label.title === title);
    
    if (labelExists) {
      return res.status(409).json({ error: 'Label já existe' });
    }
    
    // Criar o label
    const response = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/labels`,
      { 
        title,
        description: description || `Label criado via API: ${title}`,
        color: color || '#1f2937'
      },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    res.json({ 
      success: true, 
      label: response.data.payload,
      message: `Label "${title}" criado com sucesso` 
    });
  } catch (error) {
    console.error('Erro ao criar label:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao criar label' });
  }
});

// Buscar modelos/templates disponíveis via API oficial do WhatsApp
app.get('/api/whatsapp/templates', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Buscando templates via API oficial do WhatsApp...');
    
    // Obter parâmetros da requisição (conta e caixa selecionadas)
    const { accountId, inboxId } = req.query;
    
    console.log(`📋 Parâmetros recebidos: Account ID: ${accountId}, Inbox ID: ${inboxId}`);
    
    // Primeira prioridade: Usar credenciais da caixa de entrada selecionada
    if (accountId && inboxId) {
      try {
        console.log(`🔍 Buscando configurações da caixa de entrada selecionada (Account: ${accountId}, Inbox: ${inboxId})`);
        
        const inboxDetailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN }
        });
        
        let inboxDetails = inboxDetailsResponse.data.payload;
        // Se não houver payload, mas data tem 'id' e 'name', usar data diretamente
        if (!inboxDetails && inboxDetailsResponse.data && inboxDetailsResponse.data.id && inboxDetailsResponse.data.name) {
          inboxDetails = inboxDetailsResponse.data;
        }
        if (!inboxDetails) {
          console.error('❌ Caixa de entrada não encontrada ou resposta inválida:', JSON.stringify(inboxDetailsResponse.data, null, 2));
          return res.status(404).json({ error: 'Caixa de entrada não encontrada ou resposta inválida da API' });
        }
        const config = inboxDetails.provider_config;
        
        console.log(`📱 Caixa de entrada: ${inboxDetails.name}`);
        console.log(`🔑 Configurações disponíveis:`, {
          hasBusinessAccountId: !!config?.business_account_id,
          hasApiKey: !!config?.api_key,
          hasPhoneNumberId: !!config?.phone_number_id
        });
        
        // Se a caixa tem credenciais próprias do WhatsApp, usar API oficial
        if (config?.business_account_id && config?.api_key) {
          try {
            console.log(`🚀 Usando credenciais da caixa '${inboxDetails.name}' para API oficial...`);
            console.log(`📋 Business Account ID: ${config.business_account_id}`);
            
            const whatsappResponse = await axios.get(
              `https://graph.facebook.com/v23.0/${config.business_account_id}/message_templates`,
              {
                headers: { 'Authorization': `Bearer ${config.api_key}` },
                params: { 
                  fields: 'name,status,category,language,components',
                  limit: 100 
                }
              }
            );
            
            if (whatsappResponse.data?.data) {
              const apiTemplates = whatsappResponse.data.data;
              const approvedTemplates = apiTemplates.filter(t => t.status === 'APPROVED');
              
              console.log(`🎉 ${approvedTemplates.length} templates APROVADOS encontrados via API oficial!`);
              console.log(`📊 Total de templates: ${apiTemplates.length}, Aprovados: ${approvedTemplates.length}`);
              
              // Formatar templates para o frontend
              const formattedTemplates = approvedTemplates.map(template => ({
                name: template.name,
                displayName: template.name.replace(/_/g, ' ').toUpperCase(),
                status: template.status,
                category: template.category || 'UTILITY',
                language: template.language || 'pt_BR',
                components: template.components || [],
                source: `whatsapp_api_inbox_${inboxId}`,
                inboxId: inboxId,
                inboxName: inboxDetails.name
              }));
              
              // Ordenar por categoria e nome
              formattedTemplates.sort((a, b) => {
                const categoryOrder = { 'MARKETING': 0, 'UTILITY': 1, 'AUTHENTICATION': 2 };
                const aCategoryOrder = categoryOrder[a.category] ?? 3;
                const bCategoryOrder = categoryOrder[b.category] ?? 3;
                
                if (aCategoryOrder !== bCategoryOrder) {
                  return aCategoryOrder - bCategoryOrder;
                }
                return a.displayName.localeCompare(b.displayName);
              });
              
              console.log(`📋 Retornando ${formattedTemplates.length} templates da caixa '${inboxDetails.name}'`);
              return res.json(formattedTemplates);
            }
          } catch (whatsappError) {
            console.error(`❌ Erro ao buscar templates via API oficial para caixa '${inboxDetails.name}':`, whatsappError.response?.data?.error || whatsappError.message);
            // Se for erro de autenticação, mostrar detalhes
            if (whatsappError.response?.status === 401) {
              console.log('🔑 Erro de autenticação - token da caixa pode estar expirado');
            }
            return res.status(400).json({
              error: 'Erro ao buscar templates via API oficial para a caixa',
              details: whatsappError.response?.data?.error || whatsappError.message
            });
          }
        } else {
          console.log(`⚠️ Caixa '${inboxDetails.name}' não possui credenciais completas da API do WhatsApp`);
          return res.status(400).json({
            error: 'Caixa de entrada não possui credenciais completas da API do WhatsApp'
          });
        }
      } catch (inboxError) {
        console.error(`❌ Erro ao buscar detalhes da caixa de entrada:`, inboxError.response?.data || inboxError.message);
        return res.status(400).json({
          error: 'Erro ao buscar detalhes da caixa de entrada',
          details: inboxError.response?.data || inboxError.message
        });
      }
    }
    
    // Segunda prioridade: Usar configurações globais como fallback
    if (WHATSAPP_BUSINESS_ACCOUNT_ID && WHATSAPP_API_TOKEN) {
      try {
        console.log(`🔄 Tentando com configurações globais (Business Account: ${WHATSAPP_BUSINESS_ACCOUNT_ID})`);
        
        const whatsappResponse = await axios.get(
          `https://graph.facebook.com/v23.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
          {
            headers: { 'Authorization': `Bearer ${WHATSAPP_API_TOKEN}` },
            params: { 
              fields: 'name,status,category,language,components',
              limit: 100 
            }
          }
        );
        
        if (whatsappResponse.data?.data) {
          const apiTemplates = whatsappResponse.data.data;
          const approvedTemplates = apiTemplates.filter(t => t.status === 'APPROVED');
          
          console.log(`🎉 ${approvedTemplates.length} templates encontrados via configurações globais`);
          
          const formattedTemplates = approvedTemplates.map(template => ({
            name: template.name,
            displayName: template.name.replace(/_/g, ' ').toUpperCase(),
            status: template.status,
            category: template.category || 'UTILITY',
            language: template.language || 'pt_BR',
            components: template.components || [],
            source: 'whatsapp_api_global'
          }));
          
          formattedTemplates.sort((a, b) => a.displayName.localeCompare(b.displayName));
          
          console.log(`📋 Retornando ${formattedTemplates.length} templates globais`);
          return res.json(formattedTemplates);
        }
      } catch (whatsappError) {
        console.error('❌ Erro ao buscar templates via configurações globais:', whatsappError.response?.data || whatsappError.message);
        return res.status(400).json({
          error: 'Erro ao buscar templates via API oficial global',
          details: whatsappError.response?.data || whatsappError.message
        });
      }
    }
    
    // Se não encontrou credenciais válidas
    return res.status(400).json({
      error: 'Nenhuma credencial válida da API oficial do WhatsApp encontrada para buscar templates.'
    });
  } catch (error) {
    console.error('❌ Erro geral ao buscar templates:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Erro ao buscar templates',
      details: error.message
    });
  }
});

// Listar status/envios por campanha
app.get('/api/campaigns/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📊 Buscando status detalhado da campanha ${id}...`);
    
    const result = await pool.query(`
      SELECT 
        cs.id,
        cs.campaign_id,
        cs.contact_id,
        cs.status,
        cs.message_id,
        cs.error_message,
        cs.sent_at,
        cs.sent_at - INTERVAL '3 hours' as sent_at_br,
        cs.created_at,
        cc.name as contact_name,
        cc.phone as contact_phone
      FROM campaign_status cs
      LEFT JOIN campaign_contacts cc ON cs.contact_id = cc.id AND cs.campaign_id = cc.campaign_id
      WHERE cs.campaign_id = $1
      ORDER BY cs.created_at DESC
    `, [id]);
    
    console.log(`📊 Encontrados ${result.rows.length} registros de status para campanha ${id}`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar status da campanha:', error);
    res.status(500).json({ error: 'Erro ao listar status da campanha' });
  }
});

// 🆕 NOVO: Listar execuções por campanha
app.get('/api/campaigns/:id/executions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📊 Buscando execuções detalhadas da campanha ${id}...`);
    
    const result = await pool.query(`
      SELECT 
        ce.id,
        ce.campaign_id,
        ce.contact_id,
        ce.conversation_id,
        ce.status,
        ce.executed_at,
        ce.error_message,
        ce.created_at,
        cc.name as contact_name,
        cc.phone as contact_phone
      FROM campaign_executions ce
      LEFT JOIN campaign_contacts cc ON ce.contact_id = cc.phone AND ce.campaign_id = cc.campaign_id
      WHERE ce.campaign_id = $1
      ORDER BY ce.created_at DESC
    `, [id]);
    
    console.log(`📊 Encontradas ${result.rows.length} execuções para campanha ${id}`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar execuções da campanha:', error);
    res.status(500).json({ error: 'Erro ao listar execuções da campanha' });
  }
});

// 🆕 NOVO: Estatísticas detalhadas de execuções por campanha
app.get('/api/campaigns/:id/execution-stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📊 Calculando estatísticas de execução da campanha ${id}...`);
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_executions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN conversation_id IS NOT NULL THEN 1 END) as with_conversation_count,
        COUNT(CASE WHEN executed_at IS NOT NULL THEN 1 END) as executed_count,
        MIN(executed_at) as first_execution,
        MAX(executed_at) as last_execution,
        AVG(EXTRACT(EPOCH FROM (executed_at - created_at))) as avg_execution_time_seconds
      FROM campaign_executions
      WHERE campaign_id = $1
    `, [id]);
    
    const stats = result.rows[0];
    
    // Calcular porcentagens
    const totalExecutions = parseInt(stats.total_executions) || 0;
    const enrichedStats = {
      ...stats,
      total_executions: totalExecutions,
      pending_count: parseInt(stats.pending_count) || 0,
      sent_count: parseInt(stats.sent_count) || 0,
      failed_count: parseInt(stats.failed_count) || 0,
      with_conversation_count: parseInt(stats.with_conversation_count) || 0,
      executed_count: parseInt(stats.executed_count) || 0,
      avg_execution_time_seconds: parseFloat(stats.avg_execution_time_seconds) || 0,
      // Porcentagens
      pending_percentage: totalExecutions > 0 ? ((parseInt(stats.pending_count) || 0) / totalExecutions * 100).toFixed(1) : '0.0',
      sent_percentage: totalExecutions > 0 ? ((parseInt(stats.sent_count) || 0) / totalExecutions * 100).toFixed(1) : '0.0',
      failed_percentage: totalExecutions > 0 ? ((parseInt(stats.failed_count) || 0) / totalExecutions * 100).toFixed(1) : '0.0',
      with_conversation_percentage: totalExecutions > 0 ? ((parseInt(stats.with_conversation_count) || 0) / totalExecutions * 100).toFixed(1) : '0.0'
    };
    
    console.log(`📊 Estatísticas de execução da campanha ${id}:`, {
      total: enrichedStats.total_executions,
      sent: enrichedStats.sent_count,
      failed: enrichedStats.failed_count,
      with_conversation: enrichedStats.with_conversation_count
    });
    
    res.json(enrichedStats);
  } catch (error) {
    console.error('Erro ao calcular estatísticas de execução:', error);
    res.status(500).json({ error: 'Erro ao calcular estatísticas de execução' });
  }
});

// 🆕 NOVO: Comparar dados entre campaign_status e campaign_executions
app.get('/api/campaigns/:id/data-comparison', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔍 Comparando dados entre tabelas para campanha ${id}...`);
    
    // Buscar dados das duas tabelas
    const statusResult = await pool.query(`
      SELECT 
        COUNT(*) as total_status,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as status_pending,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as status_sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as status_failed
      FROM campaign_status 
      WHERE campaign_id = $1
    `, [id]);
    
    const executionResult = await pool.query(`
      SELECT 
        COUNT(*) as total_executions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as exec_pending,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as exec_sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as exec_failed,
        COUNT(CASE WHEN conversation_id IS NOT NULL THEN 1 END) as exec_with_conversation
      FROM campaign_executions 
      WHERE campaign_id = $1
    `, [id]);
    
    const contactsResult = await pool.query(`
      SELECT COUNT(*) as total_contacts 
      FROM campaign_contacts 
      WHERE campaign_id = $1
    `, [id]);
    
    const comparison = {
      campaign_id: parseInt(id),
      contacts: {
        total: parseInt(contactsResult.rows[0]?.total_contacts) || 0
      },
      campaign_status: {
        total: parseInt(statusResult.rows[0]?.total_status) || 0,
        pending: parseInt(statusResult.rows[0]?.status_pending) || 0,
        sent: parseInt(statusResult.rows[0]?.status_sent) || 0,
        failed: parseInt(statusResult.rows[0]?.status_failed) || 0
      },
      campaign_executions: {
        total: parseInt(executionResult.rows[0]?.total_executions) || 0,
        pending: parseInt(executionResult.rows[0]?.exec_pending) || 0,
        sent: parseInt(executionResult.rows[0]?.exec_sent) || 0,
        failed: parseInt(executionResult.rows[0]?.exec_failed) || 0,
        with_conversation: parseInt(executionResult.rows[0]?.exec_with_conversation) || 0
      },
      // Verificações de consistência
      consistency_checks: {
        contacts_vs_status: (contactsResult.rows[0]?.total_contacts || 0) === (statusResult.rows[0]?.total_status || 0),
        contacts_vs_executions: (contactsResult.rows[0]?.total_contacts || 0) === (executionResult.rows[0]?.total_executions || 0),
        status_vs_executions: (statusResult.rows[0]?.total_status || 0) === (executionResult.rows[0]?.total_executions || 0)
      }
    };
    
    console.log(`🔍 Comparação de dados da campanha ${id}:`, comparison);
    
    res.json(comparison);
  } catch (error) {
    console.error('Erro ao comparar dados da campanha:', error);
    res.status(500).json({ error: 'Erro ao comparar dados da campanha' });
  }
});

// ===== ROTAS DE ANEXOS E MÍDIA =====

// Upload de mídia para workflows
app.post('/api/upload-media', authenticateToken, mediaUpload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    
    const fileInfo = {
      id: Date.now().toString(),
      originalname: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      upload_date: new Date().toISOString()
    };
    
    // Salvar informações do arquivo no banco (opcional)
    await pool.query(
      'INSERT INTO media_files (id, original_name, filename, file_path, mimetype, size, upload_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [fileInfo.id, fileInfo.originalname, fileInfo.filename, fileInfo.path, fileInfo.mimetype, fileInfo.size, fileInfo.upload_date]
    );
    
    console.log(`📁 Arquivo carregado: ${fileInfo.originalname} (${fileInfo.size} bytes)`);
    
    res.json({
      success: true,
      file: fileInfo,
      message: 'Arquivo carregado com sucesso!'
    });
    
  } catch (error) {
    console.error('❌ Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno no upload' });
  }
});

// Listar arquivos de mídia carregados
app.get('/api/media-files', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM media_files ORDER BY upload_date DESC LIMIT 50'
    );
    
    res.json({
      success: true,
      files: result.rows
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar arquivos:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Deletar arquivo de mídia
app.delete('/api/media-files/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar arquivo no banco
    const result = await pool.query('SELECT * FROM media_files WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    const file = result.rows[0];
    
    // Deletar arquivo físico
    fs.unlink(file.file_path, (err) => {
      if (err) console.error('Erro ao deletar arquivo físico:', err);
    });
    
    // Deletar do banco
    await pool.query('DELETE FROM media_files WHERE id = $1', [id]);
    
    console.log(`🗑️ Arquivo deletado: ${file.original_name}`);
    
        res.json({
      success: true,
      message: 'Arquivo deletado com sucesso!'
    });
    
  } catch (error) {
    console.error('❌ Erro ao deletar arquivo:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota para servir preview/miniatura de imagens
app.get('/api/media-preview/:id', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.id;
    
    // Buscar arquivo no banco
    const result = await pool.query(
      'SELECT file_path, mimetype, original_name FROM media_files WHERE id = $1',
      [fileId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    const file = result.rows[0];
    
    // Verificar se é uma imagem
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Apenas imagens suportam preview' });
    }
    
    // Verificar se arquivo existe no sistema
    const fullPath = path.resolve(file.file_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo físico não encontrado' });
    }
    
    // Definir headers apropriados
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 24h
    res.setHeader('Content-Disposition', 'inline'); // Mostrar inline, não download
    
    // Enviar arquivo diretamente
    res.sendFile(fullPath);
    
  } catch (error) {
    console.error('❌ Erro ao servir preview:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// 🖼️ ROTA PÚBLICA PARA SERVIR PREVIEWS DE IMAGENS (SEM AUTENTICAÇÃO)
app.get('/public-preview/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    
    // Buscar arquivo no banco
    const result = await pool.query(
      'SELECT file_path, mimetype, original_name FROM media_files WHERE id = $1 AND is_active = true',
      [fileId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send('Arquivo não encontrado');
    }
    
    const file = result.rows[0];
    
    // Verificar se é uma imagem ou vídeo
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return res.status(400).send('Apenas imagens e vídeos são suportados nesta rota');
    }
    
    // Verificar se arquivo existe no sistema
    const fullPath = path.resolve(file.file_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send('Arquivo físico não encontrado');
    }
    
    // Definir headers apropriados
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache 1h
    res.setHeader('Content-Disposition', 'inline');
    
    // Servir arquivo
    res.sendFile(fullPath);
    
  } catch (error) {
    console.error('❌ Erro ao servir preview público:', error);
    res.status(500).send('Erro interno');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    polling_active: isPolling,
    last_message_id: lastMessageId
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    polling_active: isPolling,
    last_message_id: lastMessageId
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;

// Inicializar sistema antes de iniciar o servidor
initializeSystem().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor de workflows rodando na porta ${PORT}`);
  });
}).catch(error => {
  console.error('❌ Erro ao inicializar sistema:', error);
  process.exit(1);
});

module.exports = { ConversationManager }; 