const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function fixConversation18() {
  console.log('🔧 Corrigindo conversa 18...');
  console.log('=' .repeat(60));

  try {
    // 1. Verificar status atual da conversa 18
    console.log('\n1️⃣ Status atual da conversa 18:');
    const botStatusResult = await pool.query(`
      SELECT 
        conversation_id,
        contact_id,
        bot_active,
        auto_followup_disabled,
        last_interaction_at
      FROM bot_conversation_status 
      WHERE conversation_id = 18
    `);
    
    if (botStatusResult.rows.length === 0) {
      console.log('❌ Conversa 18 não encontrada em bot_conversation_status');
      return;
    }
    
    const botStatus = botStatusResult.rows[0];
    console.log(`✅ Status encontrado:`);
    console.log(`   Contact: ${botStatus.contact_id}`);
    console.log(`   Bot ativo: ${botStatus.bot_active}`);
    console.log(`   Auto_followup desativado: ${botStatus.auto_followup_disabled}`);
    console.log(`   Última interação: ${botStatus.last_interaction_at}`);

    // 2. Verificar se já existe na workflow_conversations
    console.log('\n2️⃣ Verificando se já existe em workflow_conversations:');
    const existingResult = await pool.query(`
      SELECT id, workflow_name, current_block, status
      FROM workflow_conversations 
      WHERE id = 18
    `);
    
    if (existingResult.rows.length > 0) {
      console.log('✅ Conversa 18 já existe em workflow_conversations');
      return;
    }

    // 3. Criar entrada na workflow_conversations
    console.log('\n3️⃣ Criando entrada na workflow_conversations:');
    
    // Usar o mesmo workflow da conversa 375 (que é do mesmo contact)
    const workflowResult = await pool.query(`
      SELECT workflow_name, current_block
      FROM workflow_conversations 
      WHERE contact_id = $1
      ORDER BY last_activity DESC
      LIMIT 1
    `, [botStatus.contact_id]);
    
    let workflowName = 'teste disable auto follow up';
    let currentBlock = 'bloco_1';
    
    if (workflowResult.rows.length > 0) {
      workflowName = workflowResult.rows[0].workflow_name;
      currentBlock = workflowResult.rows[0].current_block;
      console.log(`   Usando workflow: ${workflowName}`);
      console.log(`   Bloco atual: ${currentBlock}`);
    }
    
    const insertResult = await pool.query(`
      INSERT INTO workflow_conversations 
      (id, contact_id, workflow_name, current_block, status, start_time, last_activity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [18, botStatus.contact_id, workflowName, currentBlock, botStatus.last_interaction_at]);
    
    console.log(`✅ Conversa 18 criada em workflow_conversations:`);
    console.log(`   ID: ${insertResult.rows[0].id}`);
    console.log(`   Workflow: ${insertResult.rows[0].workflow_name}`);
    console.log(`   Status: ${insertResult.rows[0].status}`);

    // 4. Verificar se o workflow tem auto_followup
    console.log('\n4️⃣ Verificando auto_followup do workflow:');
    const workflowConfigResult = await pool.query(`
      SELECT config 
      FROM workflow_configs 
      WHERE workflow_name = $1
    `, [workflowName]);
    
    if (workflowConfigResult.rows.length > 0) {
      const config = workflowConfigResult.rows[0].config;
      if (config.auto_followup) {
        console.log(`✅ Workflow tem auto_followup configurado:`);
        for (const [blockName, followup] of Object.entries(config.auto_followup)) {
          console.log(`   ${blockName}: ${followup.delay}s - ${followup.condition}`);
        }
      } else {
        console.log(`❌ Workflow não tem auto_followup configurado`);
      }
    } else {
      console.log(`❌ Workflow '${workflowName}' não encontrado no banco`);
    }

    // 5. Testar se agora seria processada pelo auto_followup
    console.log('\n5️⃣ Testando se seria processada pelo auto_followup:');
    const testQuery = await pool.query(`
      SELECT 
        wc.id,
        wc.contact_id,
        wc.workflow_name,
        wc.current_block,
        EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive
      FROM workflow_conversations wc
      WHERE wc.status = 'active'
        AND wc.last_activity IS NOT NULL
        AND wc.id = 18
    `);
    
    if (testQuery.rows.length > 0) {
      const conv = testQuery.rows[0];
      const minutesInactive = Math.round(conv.seconds_inactive / 60);
      console.log(`✅ Conversa 18 agora seria encontrada pelo auto_followup:`);
      console.log(`   Inativo há: ${minutesInactive} minutos`);
    } else {
      console.log(`❌ Conversa 18 ainda não seria encontrada`);
    }

    console.log('\n✅ Correção concluída!');

  } catch (error) {
    console.error('❌ Erro durante a correção:', error);
  } finally {
    await pool.end();
  }
}

fixConversation18();
