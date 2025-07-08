const axios = require('axios');
const { Pool } = require('pg');

// Configurações do Chatwoot (usando as mesmas do sistema)
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1';

// Configuração do PostgreSQL
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825',
});

async function checkInboxesAndWorkflows() {
  try {
    console.log('🔍 VERIFICANDO CAIXAS DE ENTRADA E FLUXOS\n');
    
    // 1. Buscar todas as caixas de entrada
    console.log('📋 Caixas de entrada disponíveis:');
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    
    const inboxes = response.data.payload || [];
    
    if (inboxes.length === 0) {
      console.log('❌ Nenhuma caixa de entrada encontrada!');
      return;
    }
    
    // 2. Buscar fluxos configurados
    const workflowsResult = await pool.query('SELECT * FROM inbox_workflows WHERE is_active = true');
    const configuredWorkflows = workflowsResult.rows;
    
    // 3. Mostrar status de cada caixa de entrada
    console.log('\n📊 Status das caixas de entrada:\n');
    
    for (const inbox of inboxes) {
      const hasWorkflow = configuredWorkflows.find(w => w.inbox_id == inbox.id);
      
      console.log(`📦 ID: ${inbox.id}`);
      console.log(`   Nome: ${inbox.name}`);
      console.log(`   Tipo: ${inbox.channel_type}`);
      console.log(`   Status: ${inbox.status || 'N/A'}`);
      
      if (hasWorkflow) {
        console.log(`   ✅ Fluxo: ${hasWorkflow.workflow_name}`);
        console.log(`   📅 Criado em: ${new Date(hasWorkflow.created_at).toLocaleString('pt-BR')}`);
      } else {
        console.log(`   ❌ Fluxo: Não configurado`);
      }
      console.log('');
    }
    
    // 4. Mostrar conversas ativas recentes
    console.log('💬 Conversas ativas recentes:\n');
    const conversationsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      },
      params: {
        status: 'open'
      }
    });
    
    const conversations = conversationsResponse.data.data.payload || [];
    
    if (conversations.length === 0) {
      console.log('📭 Nenhuma conversa ativa encontrada');
    } else {
      for (const conv of conversations.slice(0, 5)) { // Mostrar apenas as 5 mais recentes
        const inbox = inboxes.find(i => i.id === conv.inbox_id);
        const contactName = conv.meta?.sender?.name || 'N/A';
        const phone = conv.meta?.sender?.phone_number || 'N/A';
        
        console.log(`🗣️  Conversa ID: ${conv.id}`);
        console.log(`    Caixa de entrada: ${inbox ? inbox.name : 'N/A'} (ID: ${conv.inbox_id})`);
        console.log(`    Contato: ${contactName} (${phone})`);
        console.log(`    Criada em: ${new Date(conv.created_at).toLocaleString('pt-BR')}`);
        console.log('');
      }
    }
    
    // 5. Mostrar fluxos disponíveis
    console.log('🎯 Fluxos disponíveis no sistema:\n');
    const templatesResult = await pool.query('SELECT workflow_name FROM workflow_configs WHERE is_active = true');
    const availableWorkflows = templatesResult.rows;
    
    if (availableWorkflows.length === 0) {
      console.log('❌ Nenhum fluxo encontrado no sistema');
    } else {
      availableWorkflows.forEach(w => {
        console.log(`   📋 ${w.workflow_name}`);
      });
    }
    
    // 6. Sugestões
    console.log('\n💡 AÇÕES SUGERIDAS:\n');
    
    const inboxesWithoutWorkflow = inboxes.filter(inbox => 
      !configuredWorkflows.find(w => w.inbox_id == inbox.id)
    );
    
    if (inboxesWithoutWorkflow.length > 0) {
      console.log('🔧 Caixas de entrada sem fluxo configurado:');
      inboxesWithoutWorkflow.forEach(inbox => {
        console.log(`   • ${inbox.name} (ID: ${inbox.id}) - ${inbox.channel_type}`);
      });
      
      console.log('\n📝 Para configurar um fluxo para uma caixa de entrada:');
      console.log('1. Acesse a interface web em: http://localhost:3001');
      console.log('2. Selecione a conta e a caixa de entrada');
      console.log('3. Clique em "Configurar Fluxo" e escolha um template');
      console.log('4. Salve a configuração');
      
      if (inboxesWithoutWorkflow.length === 1) {
        const inbox = inboxesWithoutWorkflow[0];
        console.log(`\n🚀 SOLUÇÃO RÁPIDA para a caixa "${inbox.name}":`);
        console.log(`node configure-workflow.js ${CHATWOOT_ACCOUNT_ID} ${inbox.id} wizard_bh_buritis`);
      }
    } else {
      console.log('✅ Todas as caixas de entrada têm fluxos configurados!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('Detalhes:', error.response.data);
    }
  } finally {
    await pool.end();
  }
}

// Executar verificação
checkInboxesAndWorkflows(); 