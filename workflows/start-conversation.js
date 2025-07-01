const { Pool } = require('pg');
const axios = require('axios');

// Configurações
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;

const pool = new Pool({
  host: 'postgres',
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function listConversations() {
  try {
    console.log('🔍 LISTANDO CONVERSAS ATIVAS NO CHATWOOT...\n');
    
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/conversations`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    
    console.log('📋 CONVERSAS ATIVAS:');
    response.data.forEach((conv, index) => {
      console.log(`${index + 1}. ID: ${conv.id} | Contato: ${conv.contact?.name || 'Sem nome'} | Status: ${conv.status} | Última mensagem: ${conv.last_activity_at}`);
    });
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro ao listar conversas:', error.response?.data || error.message);
    return [];
  }
}

async function startWorkflow(conversationId, contactId, contactName) {
  try {
    console.log(`\n🚀 INICIANDO WORKFLOW PARA CONVERSA ${conversationId}...`);
    
    // Verificar se já existe uma conversa ativa
    const existingConv = await pool.query(
      'SELECT * FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
      [contactId, 'active']
    );
    
    if (existingConv.rows.length > 0) {
      console.log('⚠️ Já existe uma conversa ativa para este contato. Finalizando...');
      await pool.query(
        'UPDATE workflow_conversations SET status = $1 WHERE contact_id = $2 AND status = $3',
        ['completed', contactId, 'active']
      );
    }
    
    // Iniciar nova conversa
    const result = await pool.query(`
      INSERT INTO workflow_conversations 
      (contact_id, conversation_id, workflow_name, current_block, data, status) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING id
    `, [
      contactId,
      conversationId,
      'wizard_bh_buritis',
      'bloco_1',
      JSON.stringify({ nome: contactName }),
      'active'
    ]);
    
    console.log(`✅ Workflow iniciado! ID da conversa: ${result.rows[0].id}`);
    
    // Buscar configuração do workflow
    const workflowResult = await pool.query(
      'SELECT config FROM workflow_configs WHERE workflow_name = $1',
      ['wizard_bh_buritis']
    );
    
    if (workflowResult.rows.length === 0) {
      throw new Error('Workflow wizard_bh_buritis não encontrado!');
    }
    
    const workflow = workflowResult.rows[0].config;
    const firstBlock = workflow.blocks.bloco_1;
    
    // Processar mensagem com variáveis
    let message = firstBlock.message;
    if (contactName) {
      message = message.replace('{{nome}}', contactName);
    }
    
    console.log(`\n📨 MENSAGEM A SER ENVIADA:`);
    console.log(`Para: ${contactId}`);
    console.log(`Mensagem: ${message}`);
    console.log(`Botões: ${JSON.stringify(firstBlock.buttons)}`);
    
    // Salvar interação
    await pool.query(`
      INSERT INTO workflow_interactions 
      (conversation_id, contact_id, block_name, bot_message, buttons) 
      VALUES ($1, $2, $3, $4, $5)
    `, [
      result.rows[0].id,
      contactId,
      'bloco_1',
      message,
      JSON.stringify(firstBlock.buttons)
    ]);
    
    console.log('\n✅ Workflow iniciado com sucesso!');
    console.log('📝 A mensagem será enviada automaticamente pelo sistema de workflows.');
    
    return result.rows[0].id;
    
  } catch (error) {
    console.error('❌ Erro ao iniciar workflow:', error.message);
    throw error;
  }
}

async function main() {
  try {
    // Listar conversas
    const conversations = await listConversations();
    
    if (conversations.length === 0) {
      console.log('❌ Nenhuma conversa ativa encontrada.');
      return;
    }
    
    // Se passou argumentos, usar eles
    const args = process.argv.slice(2);
    if (args.length >= 2) {
      const conversationId = args[0];
      const contactId = args[1];
      const contactName = args[2] || 'Cliente';
      
      await startWorkflow(conversationId, contactId, contactName);
    } else {
      console.log('\n💡 Para iniciar um workflow, use:');
      console.log('node start-conversation.js <conversation_id> <contact_id> [contact_name]');
      console.log('\nExemplo:');
      console.log('node start-conversation.js 123 456 "João Silva"');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

main(); 