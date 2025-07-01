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
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de 100 requests por IP
});
app.use(limiter);

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
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
    console.log('🔎 Tentando conectar ao PostgreSQL com as seguintes configurações:');
    console.log('  HOST:', process.env.POSTGRES_HOST);
    console.log('  PORT:', process.env.POSTGRES_PORT);
    console.log('  DB:', process.env.POSTGRES_DB);
    console.log('  USER:', process.env.POSTGRES_USER);
    // Não logar a senha por segurança

    // Teste de conexão explícito
    await pool.query('SELECT 1');
    console.log('✅ Conexão com PostgreSQL estabelecida com sucesso.');

    // Tabela para conversas ativas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_conversations (
        id SERIAL PRIMARY KEY,
        contact_id VARCHAR(255) NOT NULL,
        conversation_id INTEGER,
        workflow_name VARCHAR(100) NOT NULL,
        current_block VARCHAR(100) NOT NULL,
        data JSONB DEFAULT '{}',
        history JSONB DEFAULT '[]',
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela para histórico de interações
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_interactions (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES workflow_conversations(id) ON DELETE CASCADE,
        contact_id VARCHAR(255) NOT NULL,
        block_name VARCHAR(100) NOT NULL,
        user_response TEXT,
        bot_message TEXT,
        buttons JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela para configurações de workflows
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_configs (
        id SERIAL PRIMARY KEY,
        workflow_name VARCHAR(100) UNIQUE NOT NULL,
        config JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela para controle de mensagens processadas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        id SERIAL PRIMARY KEY,
        message_id INTEGER UNIQUE NOT NULL,
        contact_id VARCHAR(255) NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela para fluxos por conta e caixa de entrada
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inbox_workflows (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL,
        inbox_id INTEGER NOT NULL,
        workflow_name VARCHAR(100) NOT NULL,
        workflow_config JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(account_id, inbox_id)
      )
    `);

    // Tabela para usuários do sistema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_conversations_contact_id 
      ON workflow_conversations(contact_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_conversations_status 
      ON workflow_conversations(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_processed_messages_message_id 
      ON processed_messages(message_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inbox_workflows_account_inbox 
      ON inbox_workflows(account_id, inbox_id)
    `);

    console.log('✅ Banco de dados inicializado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
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

// Classe para gerenciar conversas com PostgreSQL
class ConversationManager {
  constructor() {
    this.workflows = new Map();
    this.loadWorkflows();
  }

  // Carregar workflows do banco de dados
  async loadWorkflows() {
    try {
      // Sempre carregar apenas do arquivo JSON
      for (const [name, config] of Object.entries(defaultWorkflows)) {
        this.workflows.set(name, config);
      }
    } catch (error) {
      console.error('Erro ao carregar workflows:', error);
    }
  }

  // Salvar workflow no banco
  async saveWorkflow(name, config) {
    try {
      await pool.query(
        'INSERT INTO workflow_configs (workflow_name, config) VALUES ($1, $2) ON CONFLICT (workflow_name) DO UPDATE SET config = $2, updated_at = CURRENT_TIMESTAMP',
        [name, config]
      );
      this.workflows.set(name, config);
    } catch (error) {
      console.error('Erro ao salvar workflow:', error);
    }
  }

  // Iniciar nova conversa
  async startConversation(contactId, workflowName, initialData = {}) {
    try {
      const workflow = this.workflows.get(workflowName);
      if (!workflow) {
        throw new Error(`Workflow ${workflowName} não encontrado`);
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

      const workflow = this.workflows.get(conversation.workflow_name);
      if (!workflow) return null;

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
        }

        // Mover para próximo bloco
        if (button.next_block === 'finalizar') {
          await this.finalizeConversation(contactId);
          return { type: 'finalized', message: 'Conversa finalizada. Obrigado!' };
        } else {
          const nextBlock = workflow.blocks[button.next_block];
          if (nextBlock) {
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
        }
        // Avançar para o next_block se existir
        if (currentBlock.next_block) {
          const nextBlock = workflow.blocks[currentBlock.next_block];
          if (nextBlock) {
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
      // Primeiro, obter labels existentes
      const existingLabelsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/labels`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN
        }
      });
      
      const existingLabels = existingLabelsResponse.data.payload || [];
      
      // Adicionar nova label se não existir
      if (!existingLabels.includes(tag)) {
        const updatedLabels = [...existingLabels, tag];
        
        await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/labels`, {
          labels: updatedLabels
        }, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`✅ Tag "${tag}" aplicada ao contato ${contactId}`);
      } else {
        console.log(`ℹ️ Tag "${tag}" já existe no contato ${contactId}`);
      }
    } catch (error) {
      console.error('❌ Erro ao aplicar tag:', error);
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
        status: 'open',
        inbox_id: 3 // Ajuste conforme necessário
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
    if (!contactId) {
      console.error('❌ Não foi possível extrair o contactId da conversa:', conversation);
      return;
    }
    
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
        await processUserMessage(contactId, conversationId, message.content);
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
async function processUserMessage(contactId, conversationId, userMessage) {
  try {
    console.log(`📨 Processando mensagem de ${contactId}: ${userMessage}`);
    
    // Se o usuário digitar !reset, zera o fluxo
    if (userMessage.trim().toLowerCase() === '!reset') {
      await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contactId]);
      await sendChatwootMessage(conversationId, 'Fluxo reiniciado com sucesso. Agora você pode iniciar a conversa novamente. Tente dar um "oi".');
      return;
    }
    
    // Verificar se é uma conversa existente
    let conversation = await conversationManager.getConversation(contactId);
    
    if (!conversation) {
      // Iniciar nova conversa se for uma mensagem de trigger
      if (isTriggerMessage(userMessage)) {
        // Buscar o fluxo configurado para esta caixa de entrada
        const inboxWorkflow = await inboxWorkflowManager.getInboxWorkflow(CHATWOOT_ACCOUNT_ID, 3); // inbox_id 3
        
        if (inboxWorkflow) {
          console.log(`🔍 Usando fluxo do banco: ${inboxWorkflow.workflow_name}`);
          
          // Adicionar o fluxo do banco ao conversationManager temporariamente
          conversationManager.workflows.set(inboxWorkflow.workflow_name, inboxWorkflow.workflow_config);
          
          conversation = await conversationManager.startConversation(contactId, inboxWorkflow.workflow_name, {
            conversation_id: conversationId,
            nome: await getContactName(contactId)
          });
          
          const workflow = inboxWorkflow.workflow_config;
          const firstBlock = workflow.blocks.bloco_1;
          await sendChatwootMessage(
            conversationId,
            conversationManager.processMessage(firstBlock.message, conversation.data),
            firstBlock.buttons
          );
        } else {
          console.log('⚠️ Nenhum fluxo configurado para esta caixa de entrada, usando fluxo padrão');
          // Fallback para o fluxo padrão
          conversation = await conversationManager.startConversation(contactId, 'wizard_bh_buritis', {
            conversation_id: conversationId,
            nome: await getContactName(contactId)
          });
          
          const workflow = conversationManager.workflows.get('wizard_bh_buritis');
          const firstBlock = workflow.blocks.bloco_1;
          await sendChatwootMessage(
            conversationId,
            conversationManager.processMessage(firstBlock.message, conversation.data),
            firstBlock.buttons
          );
        }
      }
    } else {
      // Processar resposta na conversa existente
      const result = await conversationManager.processResponse(contactId, userMessage);
      
      if (result.type === 'next_block') {
        await sendChatwootMessage(conversationId, result.message, result.block.buttons);
      } else if (result.type === 'finalized') {
        await sendChatwootMessage(conversationId, result.message);
        await conversationManager.finalizeConversation(contactId);
      } else if (result.type === 'invalid_response') {
        const workflow = conversationManager.workflows.get(conversation.workflow_name);
        const currentBlock = workflow.blocks[conversation.current_block];
        await sendChatwootMessage(conversationId, result.message, currentBlock.buttons);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem do usuário:', error);
  }
}

// Enviar mensagem para o Chatwoot
async function sendChatwootMessage(conversationId, message, buttons = []) {
  try {
    const payload = {
      content: message,
      message_type: 1  // 1 = outgoing, 0 = incoming
    };
    
    // Se houver botões, criar mensagem com botões
    if (buttons && buttons.length > 0) {
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
    
    console.log(`✅ Mensagem enviada para conversa ${conversationId}: ${message}`);
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem para Chatwoot:', error);
  }
}

// Verificar se é mensagem de trigger
function isTriggerMessage(message) {
  const triggers = ['oi', 'olá', 'hello', 'start', 'iniciar'];
  return triggers.some(trigger => 
    message.toLowerCase().includes(trigger)
  );
}

// Buscar contato pelo telefone para obter o ID interno
async function getContactIdByPhone(phoneNumber) {
  try {
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
      {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { q: phoneNumber }
      }
    );
    const contact = response.data.payload.find(
      c => c.phone_number === phoneNumber
    );
    console.log('ID do contato encontrado:', contact ? contact.id : null);
    return contact ? contact.id : null;
  } catch (error) {
    console.error('❌ Erro ao buscar ID do contato pelo telefone:', error);
    return null;
  }
}

// Obter nome do contato
async function getContactName(contactId) {
  try {
    // Se contactId for um número de telefone, buscar o ID interno
    let internalId = contactId;
    if (typeof contactId === 'string' && contactId.startsWith('+')) {
      const foundId = await getContactIdByPhone(contactId);
      if (foundId) internalId = foundId;
    }
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${internalId}`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    console.log("Dados do contato:", response.data.payload);
    const fullName = response.data.payload.name || 'Cliente';
    const firstName = fullName.split(' ')[0];
    return firstName;
  } catch (error) {
    console.error('❌ Erro ao obter nome do contato:', error);
    return 'Cliente';
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

// ===== ROTAS DO FRONTEND (PROTEGIDAS) =====

// Obter contas do Chatwoot
app.get('/api/accounts', authenticateToken, async (req, res) => {
  try {
    // Buscar o nome real da conta via API do Chatwoot
    const accountId = CHATWOOT_ACCOUNT_ID;
    let accountName = `Conta ${accountId}`;
    try {
      const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN
        }
      });
      if (response.data && response.data.name) {
        accountName = response.data.name;
      }
    } catch (err) {
      console.warn('Não foi possível buscar o nome real da conta, usando nome padrão.');
    }
    const accounts = [
      {
        id: parseInt(accountId),
        name: accountName,
        domain: CHATWOOT_BASE_URL.replace(/^https?:\/\//, ''),
        status: 'active'
      }
    ];
    res.json(accounts);
  } catch (error) {
    console.error('❌ Erro ao obter contas:', error.message);
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
      await sendChatwootMessage(initialData.conversation_id, firstBlock.message, firstBlock.buttons);
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
    await pool.query('DELETE FROM workflow_conversations WHERE contact_id = $1', [contactId]);
    res.json({ success: true, message: 'Fluxo zerado para o contato.' });
  } catch (error) {
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