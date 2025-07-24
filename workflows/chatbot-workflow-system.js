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
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const csv = require('csv-parser');
const FormData = require('form-data');

// ===== SISTEMA DE LOGS DUPLO =====
// Logs aparecem tanto no console (docker logs) quanto em arquivos
const logDir = path.join(__dirname, 'logs');

// Criar diretório de logs se não existir
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
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

// Log de inicialização
log.info('🚀 Sistema de logs duplo inicializado');
log.info('📁 Logs salvos em:', logDir);
log.info('🐳 Logs visíveis via: docker logs chatwoot-chatbot-workflows-1');
log.info('🧹 Limpeza automática de logs antigos (>30 dias) ativada');

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
      connectSrc: ["'self'"],
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
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1';

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

// Carregar workflow personalizado como padrão
const workflowPath = path.join(__dirname, 'wizard-bh-buritis-workflow.json');
const wizardWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

const defaultWorkflows = {
  [wizardWorkflow.name]: wizardWorkflow.config
};

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
        conversation_id INTEGER NOT NULL,
        contact_id VARCHAR(255) NOT NULL,
        block_name VARCHAR(255) NOT NULL,
        user_response TEXT,
        bot_message TEXT,
        buttons JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    // Criar tabela de campanhas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        workflow_name VARCHAR(255) NOT NULL,
        target_contacts JSONB,
        schedule_type VARCHAR(50) DEFAULT 'immediate',
        scheduled_time TIMESTAMP,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de execuções de campanhas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_executions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id),
        contact_id VARCHAR(255) NOT NULL,
        conversation_id INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        executed_at TIMESTAMP,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        agent_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar índices para performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bot_status_conversation 
      ON bot_conversation_status(conversation_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bot_status_contact 
      ON bot_conversation_status(contact_id);
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

// Função para adicionar labels ao contato no Chatwoot
async function addLabelsToContact(contactId, labels) {
  try {
    // Garantir que todos os labels existem antes de adicioná-los
    for (const label of labels) {
      await createLabelIfNotExists(label);
    }
    
    // Buscar o ID interno do contato se necessário
    let internalId = contactId;
    if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
      console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
      const foundId = await getContactIdByPhone(contactId);
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
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${internalId}/labels`,
      { labels },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    console.log(`✅ Labels [${labels.join(', ')}] adicionadas ao contato ${internalId}`);
  } catch (error) {
    console.error('❌ Erro ao adicionar labels ao contato:', error.response?.data || error.message);
    
    // Log adicional para debug
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   URL: ${error.config?.url}`);
      console.error(`   ContactId original: ${contactId}`);
    }
  }
}

// Função para remover todos os labels do contato no Chatwoot
async function removeAllLabelsFromContact(contactId) {
  try {
    console.log(`🧹 Iniciando remoção de labels para contactId: ${contactId}`);
    
    // Buscar o ID interno do contato se necessário
    let internalId = contactId;
    
    // Se contactId parece ser um número de telefone, buscar o ID interno
    if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
      console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
      const foundId = await getContactIdByPhone(contactId);
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
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${internalId}/labels`,
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
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${internalId}/labels`,
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
async function assignConversationToAgent(conversationId, agentId) {
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
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      { assignee_id: agentId },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    console.log(`✅ Conversa ${conversationId} atribuída ao agente ${agentId}`);
  } catch (error) {
    console.error(`❌ Erro ao atribuir conversa ${conversationId} ao agente ${agentId}:`, error.response?.data || error.message);
  }
}

// Função para atribuir conversa a um time
async function assignConversationToTeam(conversationId, teamId) {
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
    
    console.log(`🔍 Tentando atribuir conversa ${conversationId} ao time ${teamId}`);
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando atribuição de time`);
      return;
    }
    
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      { team_id: teamId },
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    console.log(`✅ Conversa ${conversationId} atribuída ao time ${teamId}`);
  } catch (error) {
    console.error(`❌ Erro ao atribuir conversa ${conversationId} ao time ${teamId}:`, error.response?.data || error.message);
  }
}

// Cache de labels para evitar muitas consultas à API
let labelsCache = new Map();
let labelsCacheExpiry = 0;
const LABELS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Função para obter labels existentes (com cache)
async function getExistingLabels() {
  const now = Date.now();
  
  // Verificar se o cache ainda é válido
  if (labelsCache.size > 0 && now < labelsCacheExpiry) {
    return labelsCache;
  }
  
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/labels`,
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
async function createLabelIfNotExists(labelName) {
  try {
    // Verificar cache primeiro
    const existingLabels = await getExistingLabels();
    
    if (!existingLabels.has(labelName)) {
      // Criar o label se não existir
      const response = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/labels`,
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
async function conversationExists(conversationId) {
  try {
    if (!conversationId) {
      console.log('❌ ConversationId é inválido (null/undefined)');
      return false;
    }
    
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    return response.status === 200;
  } catch (error) {
    console.log(`❌ Conversa ${conversationId} não encontrada: ${error.response?.status}`);
    return false;
  }
}

// Função para adicionar etiquetas à conversa
async function addLabelsToConversation(conversationId, labels) {
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
    const exists = await conversationExists(conversationId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando adição de etiquetas`);
      return;
    }
    
    // Garantir que todos os labels existem antes de adicioná-los
    for (const label of labels) {
      await createLabelIfNotExists(label);
    }
    
    await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/labels`,
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
async function removeAllLabelsFromConversation(conversationId) {
  try {
    console.log(`🧹 Iniciando remoção de labels da conversa: ${conversationId}`);
    
    // Validar parâmetros
    if (!conversationId) {
      console.log('⚠️ ConversationId inválido, pulando remoção de etiquetas da conversa');
      return;
    }
    
    // Verificar se a conversa existe
    const exists = await conversationExists(conversationId);
    if (!exists) {
      console.log(`⚠️ Conversa ${conversationId} não existe, pulando remoção de etiquetas`);
      return;
    }
    
    console.log(`📋 Buscando labels atuais da conversa: ${conversationId}`);
    
    // Primeiro, buscar dados da conversa para ver os labels atuais
    let currentLabels = [];
    try {
      const conversationResponse = await axios.get(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}`,
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
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/labels`,
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

// Função para buscar agentes disponíveis
async function getChatwootAgents() {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/agents`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    return response.data.payload || [];
  } catch (error) {
    console.error('Erro ao buscar agentes:', error.response?.data || error.message);
    return [];
  }
}

// Função para buscar times disponíveis
async function getChatwootTeams() {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/teams`,
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
      // Carregar workflows do arquivo JSON
      for (const [name, config] of Object.entries(defaultWorkflows)) {
        this.workflows.set(name, config);
      }
      
      // Carregar também workflows salvos no banco
      await this.loadWorkflowsFromDatabase();
    } catch (error) {
      console.error('Erro ao carregar workflows:', error);
    }
  }

  // Carregar todos os workflows do banco de dados
  async loadWorkflowsFromDatabase() {
    try {
      console.log('🔍 Carregando workflows salvos no banco de dados...');
      
      // Buscar em workflow_configs
      const configResult = await pool.query('SELECT workflow_name, config FROM workflow_configs');
      
      // Buscar em inbox_workflows
      const inboxResult = await pool.query('SELECT DISTINCT workflow_name, workflow_config FROM inbox_workflows');
      
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
      
      // Primeiro tentar buscar por nome exato
      let result = await pool.query(
        'SELECT * FROM workflow_configs WHERE workflow_name = $1',
        [workflowName]
      );
      
      // Se não encontrar, tentar buscar em inbox_workflows
      if (result.rows.length === 0) {
        console.log(`🔍 Não encontrado em workflow_configs, buscando em inbox_workflows...`);
        result = await pool.query(
          'SELECT workflow_name, workflow_config as config FROM inbox_workflows WHERE workflow_name = $1',
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
  async startConversation(contactId, workflowName, initialData = {}) {
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
        initialData.nome = await getContactName(contactId);
      }
      console.log("Nome do contato:", initialData.nome);

      // Verificar se já existe uma conversa ativa
      const existingResult = await pool.query(
        'SELECT * FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
        [contactId, 'active']
      );

      if (existingResult.rows.length > 0) {
        // Atualizar conversa existente
        await pool.query(
          'UPDATE workflow_conversations SET workflow_name = $1, current_block = $2, data = $3, last_activity = CURRENT_TIMESTAMP WHERE id = $4',
          [workflowName, 'bloco_1', JSON.stringify(initialData), existingResult.rows[0].id]
        );
        return existingResult.rows[0];
      }

      // Criar nova conversa
      const result = await pool.query(
        'INSERT INTO workflow_conversations (contact_id, workflow_name, current_block, data) VALUES ($1, $2, $3, $4) RETURNING *',
        [contactId, workflowName, 'bloco_1', JSON.stringify(initialData)]
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
  async processResponse(contactId, userResponse) {
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
        data.nome = await getContactName(contactId);
      }

      const button = Array.isArray(currentBlock.buttons)
        ? currentBlock.buttons.find(btn => 
            btn.text.toLowerCase() === userResponse.toLowerCase() ||
            btn.text.includes(userResponse)
          )
        : null;

      if (button) {
        // Salvar interação no histórico
        await this.saveInteraction(conversation.id, contactId, conversation.current_block, userResponse, currentBlock.message, currentBlock.buttons);

        // Aplicar tag se especificada
        if (button.tag) {
          await this.applyTag(contactId, button.tag);
          // Adicionar label: tag - texto do botão
          await addLabelsToContact(contactId, [`${button.tag} - ${button.text}`]);
        }

        // Aplicar atribuições do botão
        console.log(`🔍 Debug - conversation.conversation_id: ${conversation.conversation_id}, conversation.data.conversation_id: ${conversation.data?.conversation_id}, usando: ${conversationId}`);
        await this.processButtonActions(button, conversationId, contactId);

        // Mover para próximo bloco
        if (button.next_block === 'finalizar') {
          await this.finalizeConversation(contactId);
          return { type: 'finalized', message: 'Conversa finalizada. Obrigado!' };
        } else {
          const nextBlock = workflow.blocks[button.next_block];
          if (nextBlock) {
            // NOVA LÓGICA: Verificar se é bloco de atendimento humano
            if (nextBlock.id === 'atendimento_humano' || nextBlock.name?.toLowerCase().includes('atendimento')) {
              console.log(`👤 Bloco de atendimento humano detectado: ${nextBlock.name || nextBlock.id}`);
              // Pausar o bot automaticamente
              await pauseBotForConversation(conversationId, contactId, 'human_handoff', 'system');
            }
            
            // Aplicar ações do próximo bloco
            await this.processBlockActions(nextBlock, conversationId, contactId);
            
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
          await this.applyTag(contactId, currentBlock.tag);
          // Adicionar label: tag - resposta do usuário
          await addLabelsToContact(contactId, [`${currentBlock.tag} - ${userResponse}`]);
        }
        
        // Aplicar ações do bloco atual
        await this.processBlockActions(currentBlock, conversationId, contactId);
        
        // Avançar para o next_block se existir
        if (currentBlock.next_block) {
          const nextBlock = workflow.blocks[currentBlock.next_block];
          if (nextBlock) {
            // Aplicar ações do próximo bloco
            await this.processBlockActions(nextBlock, conversationId, contactId);
            
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
        'INSERT INTO workflow_interactions (conversation_id, contact_id, block_name, user_response, bot_message, buttons) VALUES ($1, $2, $3, $4, $5, $6)',
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
    console.log('Processando mensagem:', message, 'com data:', data);
    return message.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  // Aplicar tag ao contato
  async applyTag(contactId, tag) {
    try {
      console.log(`🏷️ Aplicando tag "${tag}" ao contactId: ${contactId}`);
      
      // Garantir que o label existe antes de aplicá-lo
      await createLabelIfNotExists(tag);
      
      // Buscar o ID interno do contato se necessário
      let internalId = contactId;
      if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
        console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
        const foundId = await getContactIdByPhone(contactId);
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
      const existingLabelsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${internalId}/labels`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN
        }
      });
      
      const existingLabels = existingLabelsResponse.data.payload || [];
      
      // Adicionar nova label se não existir
      if (!existingLabels.includes(tag)) {
        const updatedLabels = [...existingLabels, tag];
        
        await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${internalId}/labels`, {
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
  async processButtonActions(button, conversationId, contactId) {
    try {
      console.log(`🔧 Processando ações do botão "${button.text}" - ConversationId: ${conversationId}, ContactId: ${contactId}`);
      
      // Atribuir agente se especificado
      if (button.assign_agent) {
        console.log(`🔧 Botão solicita atribuição de agente: ${button.assign_agent}`);
        await assignConversationToAgent(conversationId, button.assign_agent);
      }

      // Atribuir time se especificado
      if (button.assign_team) {
        console.log(`🔧 Botão solicita atribuição de time: ${button.assign_team}`);
        await assignConversationToTeam(conversationId, button.assign_team);
      }

      // Adicionar etiquetas se especificadas
      if (button.assign_labels && Array.isArray(button.assign_labels)) {
        console.log(`🔧 Botão solicita etiquetas na conversa: [${button.assign_labels.join(', ')}]`);
        await addLabelsToConversation(conversationId, button.assign_labels);
      }

      // Adicionar etiquetas ao contato se especificadas
      if (button.contact_labels && Array.isArray(button.contact_labels)) {
        console.log(`🔧 Botão solicita etiquetas no contato: [${button.contact_labels.join(', ')}]`);
        await addLabelsToContact(contactId, button.contact_labels);
      }

      // Pausar bot se solicitado no botão
      if (button.pause_bot === true) {
        console.log(`⏸️ Botão "${button.text}" solicita pausa do bot - pausando automaticamente`);
        await pauseBotForConversation(conversationId, contactId, 'button_action', 'system');
      }
    } catch (error) {
      console.error(`❌ Erro ao processar ações do botão "${button.text}":`, error);
    }
  }

  // Processar ações do bloco (atribuições, etiquetas, etc.)
  async processBlockActions(block, conversationId, contactId) {
    try {
      console.log(`🔧 Processando ações do bloco "${block.name || block.id}" - ConversationId: ${conversationId}, ContactId: ${contactId}`);
      
      // Atribuir agente se especificado
      if (block.assign_agent) {
        console.log(`🔧 Bloco solicita atribuição de agente: ${block.assign_agent}`);
        await assignConversationToAgent(conversationId, block.assign_agent);
      }

      // Atribuir time se especificado
      if (block.assign_team) {
        console.log(`🔧 Bloco solicita atribuição de time: ${block.assign_team}`);
        await assignConversationToTeam(conversationId, block.assign_team);
      }

      // Adicionar etiquetas se especificadas
      if (block.assign_labels && Array.isArray(block.assign_labels)) {
        console.log(`🔧 Bloco solicita etiquetas na conversa: [${block.assign_labels.join(', ')}]`);
        await addLabelsToConversation(conversationId, block.assign_labels);
      }

      // Adicionar etiquetas ao contato se especificadas
      if (block.contact_labels && Array.isArray(block.contact_labels)) {
        console.log(`🔧 Bloco solicita etiquetas no contato: [${block.contact_labels.join(', ')}]`);
        await addLabelsToContact(contactId, block.contact_labels);
      }

      // Pausar bot se solicitado no bloco
      if (block.pause_bot === true) {
        console.log(`⏸️ Bloco "${block.name || block.id}" solicita pausa do bot - pausando automaticamente`);
        await pauseBotForConversation(conversationId, contactId, 'sector_transfer', 'system');
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
  
  // Executar verificação a cada 5 minutos
  setInterval(async () => {
    try {
      await checkAndExecuteScheduledCampaigns();
    } catch (error) {
      console.error('❌ Erro na verificação de campanhas agendadas:', error);
    }
  }, 5 * 60 * 1000); // 5 minutos
  
  console.log('✅ Verificador de campanhas agendadas configurado (verificação a cada 5 minutos)');
}

// Verificar e executar campanhas agendadas
async function checkAndExecuteScheduledCampaigns() {
  try {
    // Usar timestamp atual direto (PostgreSQL irá comparar com o fuso horário correto)
    const now = new Date();
    
    console.log(`📅 Verificando campanhas agendadas... Horário atual (Brasil): ${getTimestamp()}`);
    
    // Buscar campanhas agendadas que devem ser executadas agora
    // PostgreSQL irá interpretar o scheduled_at considerando o fuso horário
    const scheduledCampaigns = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.scheduled_at,
        c.status,
        c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' as scheduled_at_local
      FROM campaigns c
      WHERE c.status = 'pending' 
        AND c.scheduled_at IS NOT NULL 
        AND c.scheduled_at <= NOW()
      ORDER BY c.scheduled_at ASC
    `);
    
    if (scheduledCampaigns.rows.length === 0) {
      console.log(`📅 Nenhuma campanha agendada para execução encontrada`);
      return;
    }
    
    console.log(`🚀 Encontradas ${scheduledCampaigns.rows.length} campanha(s) agendada(s) para execução:`);
    
    for (const campaign of scheduledCampaigns.rows) {
      const { id, name, scheduled_at, scheduled_at_local } = campaign;
      
      console.log(`📤 Executando campanha agendada: ${name} (ID: ${id})`);
      console.log(`   📅 Agendada para: ${scheduled_at_local || scheduled_at} (Brasil)`);
      
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
    console.log('🔍 Verificando novas mensagens no Chatwoot...');
    
    // Obter conversas ativas do Chatwoot
    const conversations = await getChatwootConversations();
    console.log(`📋 Encontradas ${conversations.length} conversas ativas`);
    
    for (const conversation of conversations) {
      await processChatwootConversation(conversation);
    }
    
    console.log('✅ Polling concluído, agendando próximo...');
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
async function getChatwootConversations() {
  try {
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
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
    console.error('❌ Erro ao obter conversas do Chatwoot:', error);
    return [];
  }
}

// Processar conversa do Chatwoot
async function processChatwootConversation(conversation) {
  try {
    // Novo formato: pegar o número do contato de conversation.meta.sender.phone_number
    const contactId = conversation.meta && conversation.meta.sender && conversation.meta.sender.phone_number
      ? conversation.meta.sender.phone_number
      : null;
    const conversationId = conversation.id;
    const inboxId = conversation.inbox_id; // Detectar automaticamente o inbox_id
    
    if (!contactId) {
      console.error('❌ Não foi possível extrair o contactId da conversa:', conversation);
      return;
    }
    
    console.log(`🔍 Processando conversa - ID: ${conversationId}, Inbox: ${inboxId}, Contato: ${contactId}`);
    
    // Verificar se já existe uma conversa de workflow ativa
    let workflowConversation = await conversationManager.getConversation(contactId);
    
    // Obter mensagens recentes da conversa
    const messages = await getChatwootMessages(conversationId);
    
    for (const message of messages) {
      // Verificar se a mensagem já foi processada
      const isProcessed = await isMessageProcessed(message.id);
      if (isProcessed) continue;
      
      // Marcar mensagem como processada
      await markMessageAsProcessed(message.id, contactId);
      
      // Processar apenas mensagens do usuário (não do bot)
      if (message.message_type === 0 && message.content) {  // 0 = incoming, 1 = outgoing
        await processUserMessage(contactId, conversationId, message.content, inboxId);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao processar conversa do Chatwoot:', error);
  }
}

// Obter mensagens de uma conversa do Chatwoot
async function getChatwootMessages(conversationId) {
  try {
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
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
    console.error('❌ Erro ao obter mensagens do Chatwoot:', error);
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

// Processar mensagem do usuário
async function processUserMessage(contactId, conversationId, userMessage, inboxId) {
  try {
    console.log(`📨 Processando mensagem de ${contactId} (Inbox: ${inboxId}): ${userMessage}`);
    
    // ===== COMANDOS QUE SEMPRE FUNCIONAM (mesmo com bot pausado) =====
    
    // Se o usuário digitar !reset, zera o fluxo
    if (userMessage.trim().toLowerCase() === '!reset') {
      console.log(`🔄 Reset solicitado por ${contactId}`);
      await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contactId]);
      // Remover todos os labels do contato
      await removeAllLabelsFromContact(contactId);
      // Remover todos os labels da conversa
      await removeAllLabelsFromConversation(conversationId);
      // Reativar o bot após reset
      await reactivateBotForConversation(conversationId, contactId, 'user_reset');
      await sendChatwootMessage(conversationId, 'Fluxo reiniciado com sucesso e todos os labels removidos (contato e conversa). Agora você pode iniciar a conversa novamente. Tente dar um "oi".');
      return;
    }
    
    // Reativar bot - DEVE FUNCIONAR MESMO COM BOT PAUSADO
    if (userMessage.trim().toLowerCase() === '!activebot') {
      console.log(`▶️ Comando de reativação do bot solicitado por ${contactId}`);
      const success = await reactivateBotForConversation(conversationId, contactId, contactId);
      if (success) {
        await sendChatwootMessage(conversationId, '▶️ Bot reativado com sucesso! O bot voltará a responder normalmente nesta conversa.');
      } else {
        await sendChatwootMessage(conversationId, '❌ Erro ao reativar bot. Tente novamente.');
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
        await sendChatwootMessage(conversationId, message);
      } catch (error) {
        console.error('❌ Erro ao obter status do bot:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao obter status do bot.');
      }
      return;
    }
    
    // Se o usuário digitar !reload, recarrega workflows do banco
    if (userMessage.trim().toLowerCase() === '!reload') {
      console.log(`🔄 Reload de workflows solicitado por ${contactId}`);
      try {
        await conversationManager.loadWorkflowsFromDatabase();
        const totalWorkflows = conversationManager.workflows.size;
        await sendChatwootMessage(conversationId, `✅ Workflows recarregados com sucesso! Total de workflows no cache: ${totalWorkflows}`);
      } catch (error) {
        console.error('❌ Erro ao recarregar workflows:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao recarregar workflows. Verifique os logs do sistema.');
      }
      return;
    }
    
    // Se o usuário digitar !workflows, lista workflows disponíveis
    if (userMessage.trim().toLowerCase() === '!workflows') {
      console.log(`🔍 Lista de workflows solicitada por ${contactId}`);
      try {
        const workflowNames = Array.from(conversationManager.workflows.keys());
        const message = `📋 Workflows disponíveis (${workflowNames.length}):\n${workflowNames.map(name => `• ${name}`).join('\n')}`;
        await sendChatwootMessage(conversationId, message);
      } catch (error) {
        console.error('❌ Erro ao listar workflows:', error);
        await sendChatwootMessage(conversationId, '❌ Erro ao listar workflows. Verifique os logs do sistema.');
      }
      return;
    }
    
    // Pausar bot
    if (userMessage.trim().toLowerCase() === '!pausebot') {
      console.log(`⏸️ Comando de pausa do bot solicitado por ${contactId}`);
      const success = await pauseBotForConversation(conversationId, contactId, 'manual_pause', contactId);
      if (success) {
        await sendChatwootMessage(conversationId, '⏸️ Bot pausado com sucesso! O bot não responderá mais nesta conversa até ser reativado com !activebot');
      } else {
        await sendChatwootMessage(conversationId, '❌ Erro ao pausar bot. Tente novamente.');
      }
      return;
    }
    
    // ===== VERIFICAÇÃO DE STATUS DO BOT (apenas para mensagens normais) =====
    // NOVA VERIFICAÇÃO: Verificar se o bot deve estar ativo para esta conversa
    const botShouldBeActive = await isBotActiveForConversation(conversationId, contactId);
    
    if (!botShouldBeActive) {
      console.log(`🚫 Bot desativado para conversa ${conversationId}, ignorando mensagem: ${userMessage}`);
      return;
    }
    
    // Verificar se é uma conversa existente
    let conversation = await conversationManager.getConversation(contactId);
    
    if (!conversation) {
      // Iniciar nova conversa se for uma mensagem de trigger
      if (await isTriggerMessage(userMessage, inboxId)) {
        // Buscar o fluxo configurado para esta caixa de entrada específica
        const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(CHATWOOT_ACCOUNT_ID, inboxId);
        
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
            nome: await getContactName(contactId)
          });
            
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
          const firstBlock = workflow.blocks.bloco_1;
          
          if (!firstBlock) {
            console.error(`❌ Bloco 'bloco_1' não encontrado no workflow`, Object.keys(workflow.blocks));
            return;
          }
          
          // Aplicar ações do primeiro bloco
          await conversationManager.processBlockActions(firstBlock, conversationId, contactId);
          
          await sendChatwootMessage(
            conversationId,
            conversationManager.processMessage(firstBlock.message, conversation.data),
            firstBlock.buttons,
            firstBlock.media
          );
        } else {
          console.log(`⚠️ Nenhum fluxo configurado para a caixa de entrada ${inboxId}, usando fluxo padrão`);
          
          // Verificar se o workflow padrão existe
          const defaultWorkflow = conversationManager.workflows.get('wizard_bh_buritis');
          if (!defaultWorkflow) {
            console.error(`❌ Workflow padrão 'wizard_bh_buritis' não encontrado! Workflows disponíveis:`, 
              Array.from(conversationManager.workflows.keys()));
            return;
          }
          
          // Fallback para o fluxo padrão
          try {
          conversation = await conversationManager.startConversation(contactId, 'wizard_bh_buritis', {
            conversation_id: conversationId,
            nome: await getContactName(contactId)
          });
            
            if (!conversation) {
              console.error(`❌ Falha ao criar conversa padrão para contato ${contactId}`);
              return;
            }
          } catch (startError) {
            console.error(`❌ Erro ao iniciar conversa padrão:`, startError.message);
            return;
          }
          
          const workflow = conversationManager.workflows.get('wizard_bh_buritis');
          const firstBlock = workflow.blocks.bloco_1;
          
          if (!firstBlock) {
            console.error(`❌ Bloco 'bloco_1' não encontrado no workflow padrão`, Object.keys(workflow.blocks));
            return;
          }
          
          // Aplicar ações do primeiro bloco
          await conversationManager.processBlockActions(firstBlock, conversationId, contactId);
          
          await sendChatwootMessage(
            conversationId,
            conversationManager.processMessage(firstBlock.message, conversation.data),
            firstBlock.buttons,
            firstBlock.media
          );
        }
      }
    } else {
      // Processar resposta na conversa existente
      const result = await conversationManager.processResponse(contactId, userMessage);
      
      if (result && result.type) {
      if (result.type === 'next_block') {
        await sendChatwootMessage(conversationId, result.message, result.block.buttons, result.block.media);
      } else if (result.type === 'finalized') {
        await sendChatwootMessage(conversationId, result.message);
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
          await sendChatwootMessage(conversationId, result.message, currentBlock.buttons, currentBlock.media);
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
async function sendChatwootMessage(conversationId, message, buttons = [], mediaContent = null) {
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
        return await sendChatwootMessageWithFileDownload(conversationId, message, buttons, file, customDelay);
      } else {
        console.error(`❌ Arquivo não encontrado: ${mediaContent.attachment.file_id}`);
        // Continuar com envio normal da mensagem
      }
    }
    
    // Se houver anexo direto (arquivo local), enviar como anexo
    if (mediaContent && mediaContent.attachment && mediaContent.attachment.path) {
      return await sendChatwootMessageWithAttachment(conversationId, message, buttons, mediaContent.attachment);
    }
    
    // ESPECIAL: Vídeo do YouTube - enviar thumbnail + link para melhor visualização no WhatsApp
    if (mediaContent && mediaContent.type === 'video' && mediaContent.url) {
      const videoId = extractYouTubeVideoId(mediaContent.url);
      if (videoId) {
        console.log(`🎬 Detectado vídeo do YouTube: ${videoId}, enviando com thumbnail otimizado para WhatsApp`);
        return await sendYouTubeVideoWithThumbnail(conversationId, message, buttons, mediaContent, videoId);
      }
    }
    
    const payload = {
      content: message,
      message_type: 'outgoing'  // outgoing message
    };
    
    // Se houver conteúdo de mídia (vídeo, imagem), criar card com mídia
    if (mediaContent && mediaContent.type && mediaContent.url) {
      payload.content_type = 'cards';
      payload.content_attributes = {
        items: [{
          media_url: mediaContent.url,
          title: mediaContent.title || 'Mídia',
          description: mediaContent.description || message,
          actions: buttons && buttons.length > 0 ? buttons.map(button => ({
            type: 'postback',
            text: button.text,
            payload: button.text
          })) : []
        }]
    };
    } 
    // Se houver botões mas sem mídia, criar mensagem com botões
    else if (buttons && buttons.length > 0) {
      payload.content_type = 'input_select';
      payload.content_attributes = {
        items: buttons.map((button, index) => ({
          title: button.text,
          value: button.text
        }))
      };
    }
    
    await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, payload, {
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
      console.error('   Response data:', error.response.data);
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
async function sendYouTubeVideoWithThumbnail(conversationId, message, buttons, mediaContent, videoId) {
  try {
    // 1. Enviar mensagem de texto primeiro
    if (message) {
      const textPayload = {
        content: message,
        message_type: 'outgoing'
      };
      
      await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, textPayload, {
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
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
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
    
    await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, linkPayload, {
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
      
      await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, buttonPayload, {
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
    
    await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, fallbackPayload, {
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
async function sendChatwootMessageWithFileDownload(conversationId, message, buttons = [], file, buttonDelay = 1000) {
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
    const result = await sendChatwootMessageWithAttachment(conversationId, message, buttons, attachment, buttonDelay);
    
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
async function sendChatwootMessageWithAttachment(conversationId, message, buttons = [], attachment, buttonDelay = 1000) {
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
    console.log(`🚀 Enviando para: ${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`);
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
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
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
      
      await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, buttonPayload, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Botões enviados para conversa ${conversationId}`);
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
async function sendChatwootMessageWithAttachmentUrl(conversationId, message, buttons = [], attachmentInfo) {
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
    
    console.log(`🚀 Enviando card com mídia para: ${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`);
    
    const response = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
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
          return await sendChatwootMessageWithAttachment(conversationId, message, buttons, attachment);
        }
      }
    }
    
    throw error;
  }
}

// Verificar se é mensagem de trigger baseada no workflow da caixa de entrada
async function isTriggerMessage(message, inboxId = null) {
  try {
    // Se não temos inbox específico, usar triggers padrão
    if (!inboxId) {
      const defaultTriggers = ['oi', 'ola', 'olá', 'hello', 'start', 'iniciar'];
      return defaultTriggers.some(trigger => 
        message.toLowerCase().includes(trigger)
      );
    }
    
    // Buscar workflow específico da caixa de entrada
    const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(CHATWOOT_ACCOUNT_ID, inboxId);
    
    if (inboxWorkflow && inboxWorkflow.workflow_config && inboxWorkflow.workflow_config.triggers) {
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
    
    // Fallback para triggers padrão se não encontrar workflow
    console.log(`⚠️ Workflow não encontrado para inbox ${inboxId}, usando triggers padrão`);
    const defaultTriggers = ['oi', 'ola', 'olá', 'hello', 'start', 'iniciar'];
    return defaultTriggers.some(trigger => 
      message.toLowerCase().includes(trigger)
    );
    
  } catch (error) {
    console.error(`❌ Erro ao verificar trigger para inbox ${inboxId}:`, error);
    // Em caso de erro, usar triggers padrão
    const defaultTriggers = ['oi', 'ola', 'olá', 'hello', 'start', 'iniciar'];
    return defaultTriggers.some(trigger => 
      message.toLowerCase().includes(trigger)
    );
  }
}

// Buscar contato pelo telefone para obter o ID interno
async function getContactIdByPhone(phoneNumber) {
  try {
    console.log(`🔍 Buscando contato por telefone: ${phoneNumber}`);
    
    // Tentar diferentes formatos do número
    const phoneVariations = [
      phoneNumber,
      phoneNumber.replace(/\D/g, ''), // apenas números
      phoneNumber.startsWith('+') ? phoneNumber.substring(1) : '+' + phoneNumber,
      phoneNumber.replace(/^\+55/, ''), // remover código do país
      phoneNumber.replace(/^\+/, ''), // remover apenas o +
    ];
    
    // Remover duplicatas
    const uniquePhones = [...new Set(phoneVariations)];
    console.log(`📱 Tentando formatos de telefone:`, uniquePhones);
    
    for (const phone of uniquePhones) {
      try {
        const response = await axios.get(
          `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
          {
            headers: { 'api_access_token': CHATWOOT_API_TOKEN },
            params: { q: phone }
          }
        );
        
        if (response.data.payload && response.data.payload.length > 0) {
          // Procurar contato que tenha o telefone correspondente
          const contact = response.data.payload.find(c => {
            if (!c.phone_number) return false;
            
            // Comparar removendo caracteres especiais
            const contactPhone = c.phone_number.replace(/\D/g, '');
            const searchPhone = phone.replace(/\D/g, '');
            
            return contactPhone === searchPhone || 
                   contactPhone.endsWith(searchPhone) || 
                   searchPhone.endsWith(contactPhone);
          });
          
          if (contact && contact.id) {
            console.log(`✅ Contato encontrado! ID: ${contact.id}, Telefone: ${contact.phone_number}`);
            return contact.id;
          }
        }
      } catch (searchError) {
        console.log(`⚠️ Erro ao buscar com formato ${phone}:`, searchError.response?.status);
        continue;
      }
    }
    
    console.log(`❌ Contato não encontrado para nenhum formato de: ${phoneNumber}`);
    return null;
  } catch (error) {
    console.error('❌ Erro geral ao buscar ID do contato pelo telefone:', error.response?.data || error.message);
    return null;
  }
}

// Obter nome do contato
async function getContactName(contactId) {
  try {
    console.log(`👤 Buscando nome para contactId: ${contactId}`);
    
    // Se contactId for um número de telefone, buscar o ID interno
    let internalId = contactId;
    if (typeof contactId === 'string' && (contactId.startsWith('+') || contactId.length > 8)) {
      console.log(`🔍 ContactId parece ser telefone, buscando ID interno...`);
      const foundId = await getContactIdByPhone(contactId);
      if (foundId) {
        internalId = foundId;
        console.log(`🔄 Convertido telefone ${contactId} para ID interno: ${internalId}`);
      } else {
        console.error(`❌ Não foi possível encontrar contato para telefone: ${contactId}`);
        return 'Cliente';
      }
    }
    
    // Validar se temos um ID válido
    if (!internalId || internalId === contactId && typeof contactId === 'string' && contactId.startsWith('+')) {
      console.error(`❌ ID de contato inválido: ${internalId}`);
      return 'Cliente';
    }
    
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${internalId}`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    console.log("Dados do contato:", response.data.payload);
    const fullName = response.data.payload.name || 'Cliente';
    const firstName = fullName.split(' ')[0];
    console.log(`✅ Nome encontrado: ${firstName}`);
    return firstName;
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
async function isBotActiveForConversation(conversationId, contactId) {
  try {
    console.log(`🤖 Verificando status do bot para conversa ${conversationId}`);
    
    // Buscar status do bot no banco
    const botStatus = await getBotConversationStatus(conversationId, contactId);
    
    if (!botStatus.bot_active) {
      console.log(`🚫 Bot desativado para conversa ${conversationId}: ${botStatus.paused_reason}`);
      return false;
    }
    
    // Verificar se há atendente humano ativo no Chatwoot
    const hasHumanAgent = await checkHumanAgentActive(conversationId);
    
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

// Obter ou criar status do bot para uma conversa
async function getBotConversationStatus(conversationId, contactId) {
  try {
    // Tentar buscar status existente
    let result = await pool.query(
      'SELECT * FROM bot_conversation_status WHERE conversation_id = $1',
      [conversationId]
    );
    
    if (result.rows.length === 0) {
      // Criar novo status se não existir
      console.log(`📝 Criando novo status de bot para conversa ${conversationId}`);
      result = await pool.query(`
        INSERT INTO bot_conversation_status 
        (conversation_id, contact_id, bot_active, created_at, updated_at) 
        VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
        RETURNING *
      `, [conversationId, contactId]);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error(`❌ Erro ao obter status do bot para conversa ${conversationId}:`, error);
    // Retornar status padrão ativo em caso de erro
    return {
      conversation_id: conversationId,
      contact_id: contactId,
      bot_active: true,
      paused_reason: null,
      paused_by: null,
      has_human_agent: false
    };
  }
}

// Verificar se há atendente humano ativo no Chatwoot
async function checkHumanAgentActive(conversationId) {
  try {
    console.log(`🔍 Verificando atendente humano para conversa ${conversationId}`);
    
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}`,
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
    
    // Verificar se há mensagens recentes de agentes humanos
    const hasRecentAgentActivity = await checkRecentAgentActivity(conversationId);
    
    const hasHumanAgent = hasAssignedAgent && isHumanStatus;
    
    console.log(`👤 Conversa ${conversationId} - Agente: ${hasAssignedAgent ? conversation.assignee_id : 'Nenhum'}, Status: ${conversation.status}, Atividade Recente: ${hasRecentAgentActivity}`);
    
    // Atualizar status no banco
    await updateBotAgentStatus(conversationId, hasHumanAgent, conversation.assignee_id);
    
    return hasHumanAgent || hasRecentAgentActivity;
  } catch (error) {
    console.error(`❌ Erro ao verificar atendente humano para conversa ${conversationId}:`, error.response?.status, error.response?.data);
    // Em caso de erro, assumir que não há atendente (permitir bot)
    return false;
  }
}

// Verificar atividade recente de agente humano
async function checkRecentAgentActivity(conversationId) {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { page: 1, per_page: 5 }
      }
    );
    
    const messages = response.data.payload || [];
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    
    // Verificar se há mensagens de agentes humanos nos últimos 30 minutos
    const recentAgentMessages = messages.filter(msg => {
      const messageTime = new Date(msg.created_at);
      return (
        msg.message_type === 1 && // outgoing message
        msg.sender && 
        msg.sender.type === 'AgentBot' === false && // não é bot
        messageTime > thirtyMinutesAgo
      );
    });
    
    return recentAgentMessages.length > 0;
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
      (conversation_id, contact_id, bot_active, paused_reason, paused_by, paused_at, updated_at) 
      VALUES ($1, $2, false, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

// Reativar bot para uma conversa específica
async function reactivateBotForConversation(conversationId, contactId, reactivatedBy = 'system') {
  try {
    console.log(`▶️ Reativando bot para conversa ${conversationId}`);
    
    await pool.query(`
      INSERT INTO bot_conversation_status 
      (conversation_id, contact_id, bot_active, paused_reason, paused_by, reactivated_at, updated_at) 
      VALUES ($1, $2, true, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id) 
      DO UPDATE SET 
        bot_active = true, 
        paused_reason = NULL, 
        paused_by = NULL, 
        reactivated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [conversationId, contactId]);
    
    console.log(`✅ Bot reativado com sucesso para conversa ${conversationId}`);
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
        AND paused_reason IN ('human_handoff', 'sector_transfer', 'human_agent_active')
    `);
    
    if (result.rows.length > 0) {
      console.log(`🔄 Encontradas ${result.rows.length} conversas para reativação automática após 24h`);
      
      for (const row of result.rows) {
        const { conversation_id, contact_id, paused_reason, paused_at } = row;
        
        // Verificar se ainda há agente humano ativo
        const hasActiveAgent = await checkHumanAgentActive(conversation_id);
        
        if (!hasActiveAgent) {
          console.log(`🔄 Reativando bot para conversa ${conversation_id} após 24h de inatividade (pausado em: ${paused_at})`);
          
          // Reativar o bot
          await reactivateBotForConversation(conversation_id, contact_id, 'auto_24h_reactivation');
          
          // Enviar mensagem informativa opcional (pode comentar se não quiser)
          try {
            await sendChatwootMessage(conversation_id, 
              '🤖 *Bot reativado automaticamente*\n\n' +
              'Como não detectei atividade de atendimento humano nas últimas 24 horas, ' +
              'reativei o assistente virtual para te ajudar.\n\n' +
              'Se precisar falar com nossa equipe, é só dizer "atendimento humano" ou usar !pausebot para pausar o bot.'
            );
          } catch (msgError) {
            console.log(`⚠️ Não foi possível enviar mensagem de reativação para conversa ${conversation_id}:`, msgError.message);
          }
        } else {
          console.log(`👤 Conversa ${conversation_id} ainda tem agente ativo, mantendo bot pausado`);
        }
      }
    } else {
      console.log(`✅ Nenhuma conversa encontrada para reativação automática`);
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

// Obter contas do Chatwoot
app.get('/api/accounts', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Buscando todas as contas disponíveis para o token...');
    
    // Buscar perfil do usuário para obter todas as contas que ele tem acesso
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/profile`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    
    if (response.data && response.data.accounts && Array.isArray(response.data.accounts)) {
      const accounts = response.data.accounts.map(account => ({
        id: account.id,
        name: account.name,
        domain: CHATWOOT_BASE_URL.replace(/^https?:\/\//, ''),
        status: account.status || 'active',
        role: account.role,
        permissions: account.permissions
      }));
      
      console.log(`✅ Encontradas ${accounts.length} conta(s):`, accounts.map(a => `${a.name} (ID: ${a.id})`).join(', '));
      res.json(accounts);
    } else {
      console.warn('⚠️ Nenhuma conta encontrada no perfil, usando conta padrão...');
      
      // Fallback para conta padrão se não encontrar no perfil
      const accountId = CHATWOOT_ACCOUNT_ID;
      let accountName = `Conta ${accountId}`;
      
      try {
        const fallbackResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}`, {
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
      
      const accounts = [{
        id: parseInt(accountId),
        name: accountName,
        domain: CHATWOOT_BASE_URL.replace(/^https?:\/\//, ''),
        status: 'active'
      }];
      
      res.json(accounts);
    }
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
  body('workflowConfig').isObject().withMessage('Configuração do workflow é obrigatória')
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

// Listar todos os fluxos de caixas de entrada
app.get('/api/inbox-workflows', authenticateToken, async (req, res) => {
  try {
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

// Obter templates de workflows disponíveis
app.get('/api/workflow-templates', authenticateToken, async (req, res) => {
  try {
    const templates = [
      {
        name: 'wizard_bh_buritis',
        displayName: 'Wizard BH Buritis - Fluxo Completo',
        description: 'Fluxo completo de automação para escola de inglês',
        config: wizardWorkflow.config
      }
    ];
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

// ===== ROTAS DE CAMPANHAS DE WHATSAPP =====

// Criar campanha (por tag ou CSV)
app.post('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const { name, type, tag_name, template_name, scheduled_at, chatwoot_account_id, chatwoot_inbox_id } = req.body;
    if (!name || !type || !template_name || !chatwoot_account_id || !chatwoot_inbox_id) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }
    
    // Buscar informações do template selecionado
    let templateLanguage = 'pt_BR'; // padrão
    let templateCategory = 'UTILITY'; // padrão
    
    if (template_name) {
      try {
        console.log(`🔍 Buscando informações do template: ${template_name}`);
        
        // Buscar caixas de entrada WhatsApp
        const inboxesResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN }
        });
        
        const whatsappInboxes = (inboxesResponse.data.payload || []).filter(i => 
          i.channel_type === 'Channel::Whatsapp'
        );
        
        // Buscar templates de cada caixa para encontrar o selecionado
        for (const inbox of whatsappInboxes) {
          try {
            const inboxDetailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${inbox.id}`, {
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
      `INSERT INTO campaigns (name, type, tag_name, template_name, template_language, template_category, scheduled_at, chatwoot_account_id, chatwoot_inbox_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, type, tag_name || null, template_name, templateLanguage, templateCategory, scheduled_at, chatwoot_account_id, chatwoot_inbox_id]
    );
    
    console.log(`🎯 Campanha criada com template: ${template_name} (${templateLanguage}, ${templateCategory})`);
    res.json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar campanha:', error);
    res.status(500).json({ error: 'Erro ao criar campanha' });
  }
});

// Listar campanhas com estatísticas detalhadas
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(cs.id) as total_contacts,
        COUNT(CASE WHEN cs.status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN cs.status = 'delivered' THEN 1 END) as delivered_count,
        COUNT(CASE WHEN cs.status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN cs.status = 'pending' THEN 1 END) as pending_count
      FROM campaigns c
      LEFT JOIN campaign_status cs ON c.id = cs.campaign_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar campanhas:', error);
    res.status(500).json({ error: 'Erro ao listar campanhas' });
  }
});

// Detalhes de uma campanha
app.get('/api/campaigns/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao obter campanha:', error);
    res.status(500).json({ error: 'Erro ao obter campanha' });
  }
});

app.delete('/api/campaigns/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
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
    res.status(500).json({ error: 'Erro ao excluir campanha' });
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
    if (!name || !phone) {
      errors.push({ row, error: 'Nome ou telefone inválido' });
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

// Buscar tags disponíveis via API do Chatwoot
app.get('/api/chatwoot/tags', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/labels`, {
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
    const agents = await getChatwootAgents();
    res.json(agents);
  } catch (error) {
    console.error('Erro ao buscar agentes do Chatwoot:', error);
    res.status(500).json({ error: 'Erro ao buscar agentes' });
  }
});

// Buscar times disponíveis via API do Chatwoot
app.get('/api/chatwoot/teams', authenticateToken, async (req, res) => {
  try {
    const teams = await getChatwootTeams();
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
    
    // Verificar se o label já existe
    const existingLabelsResponse = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/labels`,
      { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
    );
    
    const existingLabels = existingLabelsResponse.data.payload || [];
    const labelExists = existingLabels.some(label => label.title === title);
    
    if (labelExists) {
      return res.status(409).json({ error: 'Label já existe' });
    }
    
    // Criar o label
    const response = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/labels`,
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
    const result = await pool.query('SELECT * FROM campaign_status WHERE campaign_id = $1', [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar status da campanha:', error);
    res.status(500).json({ error: 'Erro ao listar status da campanha' });
  }
});

// Observação: No processo de envio de mensagens, checar status da campanha antes de cada envio:
// const status = await pool.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
// if (status.rows[0].status === 'cancelled') { interromper envio }

// Forçar sincronização de templates WhatsApp
app.post('/api/whatsapp/templates/sync', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Iniciando sincronização forçada de templates WhatsApp...');
    
    // Obter parâmetros da requisição (conta e caixa selecionadas)
    const { accountId, inboxId } = req.query;
    console.log(`📋 Sincronização para Account ID: ${accountId}, Inbox ID: ${inboxId}`);
    
    let syncResults = [];
    let found = false;
    
    // Primeira prioridade: Usar credenciais da caixa de entrada selecionada
    if (accountId && inboxId) {
      try {
        console.log(`🔍 Buscando configurações da caixa de entrada para sincronização (Account: ${accountId}, Inbox: ${inboxId})`);
        
        const inboxDetailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN }
        });
        
        const inboxDetails = inboxDetailsResponse.data.payload;
        const config = inboxDetails?.provider_config;
        
        console.log(`📱 Sincronizando caixa: ${inboxDetails.name}`);
        
        if (config?.business_account_id && config?.api_key) {
          try {
            console.log('🚀 Sincronizando via API oficial usando credenciais da caixa...');
            
            const whatsappResponse = await axios.get(
              `https://graph.facebook.com/v23.0/${config.business_account_id}/message_templates`,
              {
                headers: { 'Authorization': `Bearer ${config.api_key}` },
                params: { 
                  fields: 'name,status,category,language,components',
                  limit: 1000
                }
              }
            );
            
            if (whatsappResponse.data?.data) {
              const allTemplates = whatsappResponse.data.data;
              const approvedTemplates = allTemplates.filter(t => t.status === 'APPROVED');
              
              console.log(`📊 Caixa '${inboxDetails.name}': ${allTemplates.length} templates total, ${approvedTemplates.length} aprovados`);
              
              syncResults.push({
                method: `whatsapp_official_api_inbox_${inboxId}`,
                inboxId: inboxId,
                inboxName: inboxDetails.name,
                status: 'success',
                templatesCount: allTemplates.length,
                approvedCount: approvedTemplates.length,
                message: `Templates verificados via API oficial para caixa '${inboxDetails.name}'`
              });
              found = true;
              // Se funcionou, retornar sucesso
              return res.json({
                success: true,
                message: `✅ Sincronização via API oficial: ${approvedTemplates.length} templates aprovados na caixa '${inboxDetails.name}'`,
                results: syncResults,
                source: 'whatsapp_official_api_inbox',
                nextStep: 'Templates atualizados! Recarregue a lista de templates'
              });
            }
          } catch (whatsappError) {
            console.error(`❌ Erro na API oficial para caixa '${inboxDetails.name}':`, whatsappError.response?.data || whatsappError.message);
            syncResults.push({
              method: `whatsapp_official_api_inbox_${inboxId}`,
              inboxId: inboxId,
              inboxName: inboxDetails.name,
              status: 'failed',
              error: whatsappError.response?.data?.error?.message || whatsappError.message
            });
          }
        } else {
          console.log(`⚠️ Caixa '${inboxDetails.name}' não possui credenciais completas da API do WhatsApp`);
          syncResults.push({
            method: `whatsapp_official_api_inbox_${inboxId}`,
            inboxId: inboxId,
            inboxName: inboxDetails.name,
            status: 'skipped',
            message: 'Credenciais da API oficial não configuradas para esta caixa'
          });
        }
      } catch (inboxError) {
        console.error(`❌ Erro ao buscar detalhes da caixa de entrada:`, inboxError.response?.data || inboxError.message);
        syncResults.push({
          method: 'inbox_details',
          status: 'failed',
          error: inboxError.message
        });
      }
    }
    
    // Segunda prioridade: Verificar se a API oficial global está configurada
    if (!found && WHATSAPP_BUSINESS_ACCOUNT_ID && WHATSAPP_API_TOKEN) {
      try {
        console.log('🚀 Verificando templates via API oficial do WhatsApp...');
        
        const whatsappResponse = await axios.get(
          `https://graph.facebook.com/v23.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
          {
            headers: { 'Authorization': `Bearer ${WHATSAPP_API_TOKEN}` },
            params: { 
              fields: 'name,status,category,language,components',
              limit: 1000 // Aumentar limite para sincronização
            }
          }
        );
        
        if (whatsappResponse.data?.data) {
          const allTemplates = whatsappResponse.data.data;
          const approvedTemplates = allTemplates.filter(t => t.status === 'APPROVED');
          
          console.log(`📊 API oficial: ${allTemplates.length} templates total, ${approvedTemplates.length} aprovados`);
          
          syncResults.push({
            method: 'whatsapp_official_api',
            status: 'success',
            templatesCount: allTemplates.length,
            approvedCount: approvedTemplates.length,
            message: `Templates verificados via API oficial do WhatsApp`
          });
          found = true;
          // Se a API oficial funcionou, retornar sucesso
          return res.json({
            success: true,
            message: `✅ Sincronização via API oficial: ${approvedTemplates.length} templates aprovados encontrados`,
            results: syncResults,
            source: 'whatsapp_official_api',
            nextStep: 'Templates atualizados! Recarregue a lista de templates'
          });
        }
      } catch (whatsappError) {
        console.error('❌ Erro na API oficial do WhatsApp:', whatsappError.response?.data || whatsappError.message);
        syncResults.push({
          method: 'whatsapp_official_api',
          status: 'failed',
          error: whatsappError.response?.data?.error?.message || whatsappError.message
        });
      }
    }
    
    // Se não encontrou credenciais válidas
    if (!found) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma credencial válida da API oficial do WhatsApp encontrada para sincronização.',
        results: syncResults
      });
    }
  } catch (error) {
    console.error('❌ Erro na sincronização forçada:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Erro ao sincronizar templates',
      details: error.message
    });
  }
});

// Iniciar/agendar envio de campanha
app.post('/api/campaigns/:id/start', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Verifica se a campanha existe e pode ser iniciada
    const result = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Campanha não encontrada' });
    const campaign = result.rows[0];
    if (['running', 'completed'].includes(campaign.status)) {
      return res.status(400).json({ error: 'Campanha já foi iniciada ou finalizada' });
    }
    // Atualiza status para 'running'
    await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['running', id]);
    // Inicia processamento em background
    processCampaign(id).catch(err => console.error('Erro no processamento da campanha:', err));
    res.json({ success: true, message: 'Envio iniciado' });
  } catch (error) {
    console.error('Erro ao iniciar campanha:', error);
    res.status(500).json({ error: 'Erro ao iniciar campanha' });
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
        cc.phone
      FROM campaign_status cs
      LEFT JOIN campaign_contacts cc ON cs.contact_id = cc.phone AND cs.campaign_id = cc.campaign_id
      WHERE cs.campaign_id = $1 AND cs.status = 'failed'
      ORDER BY cs.created_at DESC
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar erros da campanha:', error);
    res.status(500).json({ error: 'Erro ao buscar erros da campanha' });
  }
});

// Listar campanhas agendadas
app.get('/api/campaigns/scheduled', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.scheduled_at,
        c.status,
        c.created_at,
        COUNT(cs.id) as total_contacts
      FROM campaigns c
      LEFT JOIN campaign_status cs ON c.id = cs.campaign_id
      WHERE c.scheduled_at IS NOT NULL 
        AND c.status = 'pending'
      GROUP BY c.id, c.name, c.scheduled_at, c.status, c.created_at
      ORDER BY c.scheduled_at ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar campanhas agendadas:', error);
    res.status(500).json({ error: 'Erro ao listar campanhas agendadas' });
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

// Backup da função antiga
async function processCampaign_legacy(campaignId) {
  // ... (copiar todo o conteúdo da função processCampaign atual aqui) ...
   // Busca dados da campanha
   const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
   if (rows.length === 0) return;
   const campaign = rows[0];
   let contacts = [];
   try {
     // Busca contatos conforme tipo
     if (campaign.type === 'csv') {
       const result = await pool.query('SELECT * FROM campaign_contacts WHERE campaign_id = $1', [campaignId]);
       contacts = result.rows;
     } else if (campaign.type === 'tag') {
       // Busca contatos via API do Chatwoot pela tag
       const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${campaign.chatwoot_account_id}/contacts`, {
         headers: { 'api_access_token': CHATWOOT_API_TOKEN },
         params: { label: campaign.tag_name }
       });
       contacts = (response.data.payload || []).map(c => ({ name: c.name, phone: c.phone_number }));
     }
     // Buscar credenciais da caixa de entrada
     const inboxDetailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${campaign.chatwoot_account_id}/inboxes/${campaign.chatwoot_inbox_id}`, {
       headers: { 'api_access_token': CHATWOOT_API_TOKEN }
     });
     let inboxDetails = inboxDetailsResponse.data.payload;
     if (!inboxDetails && inboxDetailsResponse.data && inboxDetailsResponse.data.id && inboxDetailsResponse.data.name) {
       inboxDetails = inboxDetailsResponse.data;
     }
     if (!inboxDetails) {
       throw new Error('Caixa de entrada não encontrada ou resposta inválida da API');
     }
     const config = inboxDetails.provider_config;
     if (!config?.business_account_id || !config?.api_key || !config?.phone_number_id) {
       throw new Error('Credenciais da API oficial do WhatsApp não configuradas para esta caixa');
     }
     // Buscar informações do template
     let templateLanguage = campaign.template_language || 'pt_BR';
     let templateCategory = campaign.template_category || 'UTILITY';
     // Buscar template na API oficial para garantir que existe
     const whatsappTemplatesResponse = await axios.get(
       `https://graph.facebook.com/v17.0/${config.business_account_id}/message_templates`,
       {
         headers: { 'Authorization': `Bearer ${config.api_key}` },
         params: { fields: 'name,status,category,language,components', limit: 100 }
       }
     );
     const templates = (whatsappTemplatesResponse.data.data || []).filter(t => t.status === 'APPROVED');
     const selectedTemplate = templates.find(t => t.name === campaign.template_name);
     if (!selectedTemplate) {
       throw new Error('Template não encontrado ou não aprovado na API oficial do WhatsApp');
     }
     templateLanguage = selectedTemplate.language || templateLanguage;
     templateCategory = selectedTemplate.category || templateCategory;
     // Enviar mensagem para cada contato
     for (const contact of contacts) {
       const normalizedPhone = contact.phone.replace(/[^\d]/g, '');
       // Montar payload para API oficial do WhatsApp
       const payload = {
         messaging_product: 'whatsapp',
         to: normalizedPhone,
         type: 'template',
         template: {
           name: campaign.template_name,
           language: { code: templateLanguage },
           components: [
             {
               type: 'body',
               parameters: [
                 { type: 'text', text: contact.name || 'Cliente' }
                 // Adicione mais parâmetros conforme o template
               ]
             }
           ]
         }
       };
       try {
         const sendResponse = await axios.post(
           `https://graph.facebook.com/v17.0/${config.phone_number_id}/messages`,
           payload,
           { headers: { Authorization: `Bearer ${config.api_key}` } }
         );
         console.log(`[Campanha ${campaignId}] ✅ Mensagem enviada para ${normalizedPhone}:`, sendResponse.data);
         await pool.query(
           'UPDATE campaign_status SET status = $1, message_id = $2, error_message = NULL WHERE campaign_id = $3 AND contact_id = $4',
           ['sent', sendResponse.data.messages?.[0]?.id || null, campaignId, contact.id || contact.phone]
         );
       } catch (err) {
         console.error(`[Campanha ${campaignId}] ❌ Erro ao enviar mensagem para ${normalizedPhone}:`, err.response?.data || err.message);
         await pool.query(
           'UPDATE campaign_status SET status = $1, error_message = $2 WHERE campaign_id = $3 AND contact_id = $4',
           ['failed', err.response?.data?.error?.message || err.message, campaignId, contact.id || contact.phone]
         );
       }
     }
   } catch (error) {
     console.error('Erro ao processar campanha:', error);
   }
}

// Nova função usando API oficial do WhatsApp
async function processCampaign(campaignId) {
  // Busca dados da campanha
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (rows.length === 0) return;
  const campaign = rows[0];
  let contacts = [];
  try {
    // Busca contatos conforme tipo
    if (campaign.type === 'csv') {
      const result = await pool.query('SELECT * FROM campaign_contacts WHERE campaign_id = $1', [campaignId]);
      contacts = result.rows;
    } else if (campaign.type === 'tag') {
      // Busca contatos via API do Chatwoot pela tag
      const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${campaign.chatwoot_account_id}/contacts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { label: campaign.tag_name }
      });
      contacts = (response.data.payload || []).map(c => ({ name: c.name, phone: c.phone_number }));
    }
    // Buscar credenciais da caixa de entrada
    const inboxDetailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${campaign.chatwoot_account_id}/inboxes/${campaign.chatwoot_inbox_id}`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    let inboxDetails = inboxDetailsResponse.data.payload;
    if (!inboxDetails && inboxDetailsResponse.data && inboxDetailsResponse.data.id && inboxDetailsResponse.data.name) {
      inboxDetails = inboxDetailsResponse.data;
    }
    if (!inboxDetails) {
      throw new Error('Caixa de entrada não encontrada ou resposta inválida da API');
    }
    const config = inboxDetails.provider_config;
    if (!config?.business_account_id || !config?.api_key || !config?.phone_number_id) {
      throw new Error('Credenciais da API oficial do WhatsApp não configuradas para esta caixa');
    }
    // Buscar informações do template
    let templateLanguage = campaign.template_language || 'pt_BR';
    let templateCategory = campaign.template_category || 'UTILITY';
    // Buscar template na API oficial para garantir que existe
    const whatsappTemplatesResponse = await axios.get(
      `https://graph.facebook.com/v17.0/${config.business_account_id}/message_templates`,
      {
        headers: { 'Authorization': `Bearer ${config.api_key}` },
        params: { fields: 'name,status,category,language,components', limit: 100 }
      }
    );
    const templates = (whatsappTemplatesResponse.data.data || []).filter(t => t.status === 'APPROVED');
    const selectedTemplate = templates.find(t => t.name === campaign.template_name);
    if (!selectedTemplate) {
      throw new Error('Template não encontrado ou não aprovado na API oficial do WhatsApp');
    }
    console.log("selectedTemplate", JSON.stringify(selectedTemplate, null, 2));
    templateLanguage = selectedTemplate.language || templateLanguage;
    templateCategory = selectedTemplate.category || templateCategory;
    // Enviar mensagem para cada contato
    for (const contact of contacts) {
      // Garantir formato E.164 com +
      let normalizedPhone = contact.phone.replace(/[^\d+]/g, '');
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+' + normalizedPhone;
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
      
      console.log(`[INFO] Final parameters:`, JSON.stringify(parameters, null, 2));
      
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
      try {
        console.log("payload", JSON.stringify(payload, null, 2));
        const sendResponse = await axios.post(
          `https://graph.facebook.com/v23.0/${config.phone_number_id}/messages`,
          payload,
          { headers: { Authorization: `Bearer ${config.api_key}` } }
        );
        console.log(`[Campanha ${campaignId}] ✅ Mensagem enviada para ${normalizedPhone}:`, sendResponse.data);
        await pool.query(
          'UPDATE campaign_status SET status = $1, message_id = $2, error_message = NULL WHERE campaign_id = $3 AND contact_id = $4',
          ['sent', sendResponse.data.messages?.[0]?.id || null, campaignId, contact.id || contact.phone]
        );
      } catch (err) {
        const errorMsg = typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : (err.response?.data?.error?.message || err.message);
        console.error(`[Campanha ${campaignId}] ❌ Erro ao enviar mensagem para ${normalizedPhone}:`, errorMsg);
        await pool.query(
          'UPDATE campaign_status SET status = $1, error_message = $2 WHERE campaign_id = $3 AND contact_id = $4',
          ['failed', errorMsg, campaignId, contact.id || contact.phone]
        );
      }
    }
    
    // Atualizar status geral da campanha após processar todos os contatos
    console.log(`[Campanha ${campaignId}] 📊 Processamento concluído. Atualizando status da campanha...`);
    await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', campaignId]);
    console.log(`[Campanha ${campaignId}] ✅ Status da campanha atualizado para 'completed'`);
    
  } catch (error) {
    console.error(`[Campanha ${campaignId}] ❌ Erro ao processar campanha:`, error);
    
    // Atualizar status da campanha para 'failed' em caso de erro
    try {
      await pool.query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', campaignId]);
      console.log(`[Campanha ${campaignId}] ❌ Status da campanha atualizado para 'failed'`);
    } catch (updateError) {
      console.error(`[Campanha ${campaignId}] ❌ Erro ao atualizar status da campanha para 'failed':`, updateError);
    }
  }
}

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

// Testar envio de anexo via API
app.post('/api/test-attachment', authenticateToken, async (req, res) => {
  try {
    const { conversationId, message, fileId } = req.body;
    
    if (!conversationId || !fileId) {
      return res.status(400).json({ error: 'conversationId e fileId são obrigatórios' });
    }
    
    // Buscar arquivo no banco
    const result = await pool.query('SELECT * FROM media_files WHERE id = $1', [fileId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    const file = result.rows[0];
    
    // Criar objeto de anexo
    const attachment = {
      path: file.file_path,
      originalname: file.original_name,
      mimetype: file.mimetype
    };
    
    // Enviar mensagem com anexo
    await sendChatwootMessageWithAttachment(conversationId, message || 'Aqui está o arquivo:', [], attachment);
    
    res.json({
      success: true,
      message: 'Anexo enviado com sucesso!'
    });
    
  } catch (error) {
    console.error('❌ Erro ao testar anexo:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ===== ROTAS EXISTENTES =====

// API para iniciar workflow manualmente
app.post('/apiworkflow/workflow/start', async (req, res) => {
  try {
    const { contactId, workflowName, initialData } = req.body;
    
    const conversation = await conversationManager.startConversation(contactId, workflowName, initialData);
    const workflow = conversationManager.workflows.get(workflowName);
    const firstBlock = workflow.blocks.bloco_1;
    
    // Enviar mensagem inicial via Chatwoot se conversation_id estiver disponível
    if (initialData.conversation_id) {
      await sendChatwootMessage(initialData.conversation_id, firstBlock.message, firstBlock.buttons, firstBlock.media);
    }
    
    res.json({ success: true, conversation });
  } catch (error) {
    console.error('Erro ao iniciar workflow:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para obter status da conversa
app.get('/apiworkflow/conversation/:contactId', async (req, res) => {
  try {
    const conversation = await conversationManager.getConversation(req.params.contactId);
    res.json(conversation || { error: 'Conversa não encontrada' });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para obter estatísticas
app.get('/apiworkflow/stats', async (req, res) => {
  try {
    const stats = await conversationManager.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para gerenciar workflows
app.post('/apiworkflow/workflows', async (req, res) => {
  try {
    const { name, config } = req.body;
    await conversationManager.saveWorkflow(name, config);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para obter lista de workflows
app.get('/apiworkflow/workflows', async (req, res) => {
  try {
    const result = await pool.query('SELECT workflow_name, config, is_active FROM workflow_configs');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para ativar/desativar workflow
app.put('/apiworkflow/workflows/:name/toggle', async (req, res) => {
  try {
    const { name } = req.params;
    const { is_active } = req.body;
    
    await pool.query(
      'UPDATE workflow_configs SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE workflow_name = $2',
      [is_active, name]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Endpoint para zerar o fluxo de uma conversa
app.post('/apiworkflow/conversation/:contactId/reset', async (req, res) => {
  try {
    const { contactId } = req.params;
    console.log(`🔄 Reset via API solicitado para ${contactId}`);
    
    // Buscar conversationId ativo antes de deletar
    let conversationId = null;
    try {
      const activeConversation = await pool.query(
        'SELECT * FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
        [contactId, 'active']
      );
      
      if (activeConversation.rows.length > 0) {
        const data = activeConversation.rows[0].data;
        if (typeof data === 'string') {
          const parsedData = JSON.parse(data);
          conversationId = parsedData.conversation_id;
        } else if (data && data.conversation_id) {
          conversationId = data.conversation_id;
        }
        console.log(`📋 ConversationId encontrado: ${conversationId}`);
      }
    } catch (dbError) {
      console.log(`⚠️ Erro ao buscar conversation_id: ${dbError.message}`);
    }
    
    await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contactId]);
    
    // Remover todos os labels do contato
    await removeAllLabelsFromContact(contactId);
    
    // Remover todos os labels da conversa se encontramos o ID
    if (conversationId) {
      await removeAllLabelsFromConversation(conversationId);
      res.json({ success: true, message: 'Fluxo zerado e todos os labels removidos (contato e conversa).' });
    } else {
      res.json({ success: true, message: 'Fluxo zerado e labels do contato removidos. ConversationId não encontrado para remover labels da conversa.' });
    }
    
  } catch (error) {
    console.error('Erro ao executar reset via API:', error);
    res.status(500).json({ error: 'Erro ao zerar fluxo.' });
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

module.exports = { ConversationManager, defaultWorkflows }; 