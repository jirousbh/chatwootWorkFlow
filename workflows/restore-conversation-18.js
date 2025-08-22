const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function restoreConversation18() {
  console.log('🔧 Restaurando conversa 18 na tabela workflow_conversations...');
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
        followup_disabled_by,
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
    console.log(`   Desativado por: ${botStatus.followup_disabled_by || 'padrão'}`);
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

    // 3. Verificar interações da conversa 18 para determinar o bloco atual
    console.log('\n3️⃣ Verificando interações para determinar bloco atual:');
    const interactionsResult = await pool.query(`
      SELECT 
        block_name,
        timestamp,
        user_response,
        bot_message
      FROM workflow_interactions 
      WHERE conversation_id = 18
      ORDER BY timestamp DESC
      LIMIT 5
    `);
    
    let currentBlock = 'bloco_1'; // padrão
    let workflowName = 'teste disable auto follow up'; // padrão
    
    if (interactionsResult.rows.length > 0) {
      console.log(`✅ Encontradas ${interactionsResult.rows.length} interações:`);
      for (const interaction of interactionsResult.rows) {
        console.log(`   📝 ${interaction.block_name}: ${interaction.timestamp}`);
      }
      
      // Usar o bloco da última interação
      currentBlock = interactionsResult.rows[0].block_name;
      console.log(`   🎯 Bloco atual determinado: ${currentBlock}`);
    } else {
      console.log('⚠️ Nenhuma interação encontrada, usando bloco padrão');
    }

    // 4. Verificar qual workflow usar (baseado em outras conversas do mesmo contact)
    console.log('\n4️⃣ Determinando workflow:');
    const workflowResult = await pool.query(`
      SELECT workflow_name
      FROM workflow_conversations 
      WHERE contact_id = $1 AND status = 'active'
      ORDER BY last_activity DESC
      LIMIT 1
    `, [botStatus.contact_id]);
    
    if (workflowResult.rows.length > 0) {
      workflowName = workflowResult.rows[0].workflow_name;
      console.log(`   📋 Workflow determinado: ${workflowName}`);
    } else {
      console.log(`   📋 Usando workflow padrão: ${workflowName}`);
    }

    // 5. Restaurar conversa 18
    console.log('\n5️⃣ Restaurando conversa 18:');
    const restoreResult = await pool.query(`
      INSERT INTO workflow_conversations 
      (id, contact_id, workflow_name, current_block, status, start_time, last_activity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [18, botStatus.contact_id, workflowName, currentBlock, botStatus.last_interaction_at]);
    
    console.log(`✅ Conversa 18 restaurada:`);
    console.log(`   ID: ${restoreResult.rows[0].id}`);
    console.log(`   Contact: ${restoreResult.rows[0].contact_id}`);
    console.log(`   Workflow: ${restoreResult.rows[0].workflow_name}`);
    console.log(`   Bloco atual: ${restoreResult.rows[0].current_block}`);
    console.log(`   Status: ${restoreResult.rows[0].status}`);

    // 6. Verificar se agora seria processada pelo auto_followup
    console.log('\n6️⃣ Verificando se seria processada pelo auto_followup:');
    const autoFollowupQuery = await pool.query(`
      SELECT 
        wc.id,
        wc.contact_id,
        wc.workflow_name,
        wc.current_block,
        EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive,
        bcs.auto_followup_disabled
      FROM workflow_conversations wc
      LEFT JOIN bot_conversation_status bcs ON wc.id = bcs.conversation_id
      WHERE wc.status = 'active'
        AND wc.last_activity IS NOT NULL
        AND wc.id = 18
    `);
    
    if (autoFollowupQuery.rows.length > 0) {
      const conv = autoFollowupQuery.rows[0];
      const minutesInactive = Math.round(conv.seconds_inactive / 60);
      console.log(`✅ Conversa 18 agora seria processada pelo auto_followup:`);
      console.log(`   Inativo há: ${minutesInactive} minutos`);
      console.log(`   Auto_followup: ${conv.auto_followup_disabled ? 'Desativado' : 'Ativado'}`);
      
      if (!conv.auto_followup_disabled) {
        console.log(`   🎯 Auto_followup ATIVADO - será processada!`);
      } else {
        console.log(`   🚫 Auto_followup DESATIVADO - não será processada`);
      }
    } else {
      console.log('❌ Conversa 18 ainda não seria processada pelo auto_followup');
    }

    // 7. Verificar todas as conversas do contact
    console.log('\n7️⃣ Status final das conversas do contact:');
    const finalResult = await pool.query(`
      SELECT 
        wc.id,
        wc.workflow_name,
        wc.current_block,
        wc.status,
        bcs.auto_followup_disabled
      FROM workflow_conversations wc
      LEFT JOIN bot_conversation_status bcs ON wc.id = bcs.conversation_id
      WHERE wc.contact_id = $1
      ORDER BY wc.id
    `, [botStatus.contact_id]);
    
    console.log(`✅ Conversas ativas do contact ${botStatus.contact_id}:`);
    for (const conv of finalResult.rows) {
      console.log(`   💬 ID ${conv.id}: ${conv.workflow_name} - ${conv.current_block} - Status: ${conv.status}`);
      console.log(`      Auto_followup: ${conv.auto_followup_disabled ? 'Desativado' : 'Ativado'}`);
    }

    console.log('\n✅ Restauração concluída!');

  } catch (error) {
    console.error('❌ Erro durante a restauração:', error);
  } finally {
    await pool.end();
  }
}

restoreConversation18();
