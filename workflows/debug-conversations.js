const { Pool } = require('pg');

// Configuração do banco de dados
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

async function debugConversations() {
  console.log('🔍 Debugando conversas ativas...');
  console.log('=' .repeat(60));

  try {
    // 1. Verificar todas as conversas ativas
    console.log('\n1️⃣ Todas as conversas ativas:');
    const allActiveResult = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        last_activity,
        status,
        EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
      FROM workflow_conversations 
      WHERE status = 'active'
      ORDER BY last_activity ASC
    `);
    
    console.log(`✅ Total de conversas ativas: ${allActiveResult.rows.length}`);
    
    for (const conv of allActiveResult.rows) {
      const minutesInactive = Math.round(conv.seconds_inactive / 60);
      console.log(`   💬 Conversa ${conv.id}: ${conv.contact_id} - ${conv.workflow_name} - Bloco: ${conv.current_block} - Inativo: ${minutesInactive}min`);
    }

    // 2. Verificar workflows com auto_followup
    console.log('\n2️⃣ Workflows com auto_followup:');
    const workflowsResult = await pool.query(`
      SELECT workflow_name, config 
      FROM workflow_configs 
      WHERE config::text LIKE '%auto_followup%'
    `);
    
    const workflowNames = workflowsResult.rows.map(w => w.workflow_name);
    console.log(`✅ Workflows com auto_followup: ${workflowNames.join(', ')}`);
    
    for (const workflow of workflowsResult.rows) {
      const config = workflow.config;
      const followupCount = config.auto_followup ? Object.keys(config.auto_followup).length : 0;
      console.log(`   📋 ${workflow.workflow_name}: ${followupCount} followups`);
      
      if (config.auto_followup) {
        for (const [blockName, followup] of Object.entries(config.auto_followup)) {
          console.log(`      ⏰ ${blockName}: ${followup.delay}s - ${followup.condition}`);
        }
      }
    }

    // 3. Verificar conversas dos workflows com auto_followup
    console.log('\n3️⃣ Conversas dos workflows com auto_followup:');
    const workflowConversationsResult = await pool.query(`
      SELECT 
        wc.id,
        wc.contact_id,
        wc.workflow_name,
        wc.current_block,
        wc.last_activity,
        wc.status,
        EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive
      FROM workflow_conversations wc
      WHERE wc.status = 'active'
        AND wc.last_activity IS NOT NULL
        AND wc.workflow_name = ANY($1)
      ORDER BY wc.last_activity ASC
    `, [workflowNames]);
    
    console.log(`✅ Conversas em workflows com auto_followup: ${workflowConversationsResult.rows.length}`);
    
    for (const conv of workflowConversationsResult.rows) {
      const minutesInactive = Math.round(conv.seconds_inactive / 60);
      console.log(`   💬 Conversa ${conv.id}: ${conv.contact_id} - ${conv.workflow_name} - Bloco: ${conv.current_block} - Inativo: ${minutesInactive}min`);
    }

    // 4. Verificar conversa específica 18
    console.log('\n4️⃣ Verificando conversa 18 especificamente:');
    const conv18Result = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        last_activity,
        status,
        EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
      FROM workflow_conversations 
      WHERE conversation_id = 18
    `);
    
    if (conv18Result.rows.length > 0) {
      const conv18 = conv18Result.rows[0];
      const minutesInactive = Math.round(conv18.seconds_inactive / 60);
      console.log(`   💬 Conversa 18: ${conv18.contact_id} - ${conv18.workflow_name} - Bloco: ${conv18.current_block} - Status: ${conv18.status} - Inativo: ${minutesInactive}min`);
      
      // Verificar se tem auto_followup
      if (workflowNames.includes(conv18.workflow_name)) {
        console.log(`   ✅ Conversa 18 está em workflow com auto_followup: ${conv18.workflow_name}`);
      } else {
        console.log(`   ❌ Conversa 18 NÃO está em workflow com auto_followup: ${conv18.workflow_name}`);
      }
    } else {
      console.log(`   ❌ Conversa 18 não encontrada`);
    }

    // 5. Verificar conversa 375
    console.log('\n5️⃣ Verificando conversa 375 especificamente:');
    const conv375Result = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        last_activity,
        status,
        EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
      FROM workflow_conversations 
      WHERE conversation_id = 375
    `);
    
    if (conv375Result.rows.length > 0) {
      const conv375 = conv375Result.rows[0];
      const minutesInactive = Math.round(conv375.seconds_inactive / 60);
      console.log(`   💬 Conversa 375: ${conv375.contact_id} - ${conv375.workflow_name} - Bloco: ${conv375.current_block} - Status: ${conv375.status} - Inativo: ${minutesInactive}min`);
      
      // Verificar se tem auto_followup
      if (workflowNames.includes(conv375.workflow_name)) {
        console.log(`   ✅ Conversa 375 está em workflow com auto_followup: ${conv375.workflow_name}`);
      } else {
        console.log(`   ❌ Conversa 375 NÃO está em workflow com auto_followup: ${conv375.workflow_name}`);
      }
    } else {
      console.log(`   ❌ Conversa 375 não encontrada`);
    }

    console.log('\n✅ Debug concluído!');

  } catch (error) {
    console.error('❌ Erro durante o debug:', error);
  } finally {
    await pool.end();
  }
}

// Executar debug
debugConversations();
