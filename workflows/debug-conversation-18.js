const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function debugConversation18() {
  console.log('🔍 Debugando conversa 18 especificamente...');
  console.log('=' .repeat(60));

  try {
    // 1. Verificar conversa 18 na tabela workflow_conversations
    console.log('\n1️⃣ Conversa 18 na tabela workflow_conversations:');
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
      WHERE id = 18
    `);
    
    if (conv18Result.rows.length > 0) {
      const conv18 = conv18Result.rows[0];
      const minutesInactive = Math.round(conv18.seconds_inactive / 60);
      console.log(`✅ Conversa 18 encontrada:`);
      console.log(`   ID: ${conv18.id}`);
      console.log(`   Contact: ${conv18.contact_id}`);
      console.log(`   Workflow: ${conv18.workflow_name}`);
      console.log(`   Bloco atual: ${conv18.current_block}`);
      console.log(`   Status: ${conv18.status}`);
      console.log(`   Última atividade: ${conv18.last_activity}`);
      console.log(`   Inativo há: ${minutesInactive} minutos`);
    } else {
      console.log('❌ Conversa 18 não encontrada na tabela workflow_conversations');
    }

    // 2. Verificar status do bot para conversa 18
    console.log('\n2️⃣ Status do bot para conversa 18:');
    const botStatusResult = await pool.query(`
      SELECT 
        conversation_id,
        contact_id,
        bot_active,
        auto_followup_disabled,
        has_human_agent,
        last_interaction_at
      FROM bot_conversation_status 
      WHERE conversation_id = 18
    `);
    
    if (botStatusResult.rows.length > 0) {
      const botStatus = botStatusResult.rows[0];
      console.log(`✅ Status do bot encontrado:`);
      console.log(`   Bot ativo: ${botStatus.bot_active}`);
      console.log(`   Auto_followup desativado: ${botStatus.auto_followup_disabled}`);
      console.log(`   Tem agente humano: ${botStatus.has_human_agent}`);
      console.log(`   Última interação: ${botStatus.last_interaction_at}`);
    } else {
      console.log('❌ Status do bot não encontrado para conversa 18');
    }

    // 3. Verificar se o workflow da conversa 18 tem auto_followup
    console.log('\n3️⃣ Verificando workflow da conversa 18:');
    if (conv18Result.rows.length > 0) {
      const workflowName = conv18Result.rows[0].workflow_name;
      const workflowResult = await pool.query(`
        SELECT workflow_name, config 
        FROM workflow_configs 
        WHERE workflow_name = $1
      `, [workflowName]);
      
      if (workflowResult.rows.length > 0) {
        const workflow = workflowResult.rows[0];
        console.log(`✅ Workflow encontrado: ${workflow.workflow_name}`);
        console.log(`   Tem auto_followup: ${!!workflow.config.auto_followup}`);
        
        if (workflow.config.auto_followup) {
          console.log(`   Auto_followup configurado:`);
          for (const [blockName, followup] of Object.entries(workflow.config.auto_followup)) {
            console.log(`     ${blockName}: ${followup.delay}s - ${followup.condition}`);
          }
        }
      } else {
        console.log(`❌ Workflow '${workflowName}' não encontrado no banco`);
      }
    }

    // 4. Simular a query do auto_followup para conversa 18
    console.log('\n4️⃣ Simulando query do auto_followup:');
    const autoFollowupQuery = await pool.query(`
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
        AND wc.id = 18
    `);
    
    if (autoFollowupQuery.rows.length > 0) {
      const conv = autoFollowupQuery.rows[0];
      const minutesInactive = Math.round(conv.seconds_inactive / 60);
      console.log(`✅ Conversa 18 seria encontrada pela query do auto_followup:`);
      console.log(`   Segundos inativos: ${conv.seconds_inactive}`);
      console.log(`   Minutos inativos: ${minutesInactive}`);
    } else {
      console.log('❌ Conversa 18 NÃO seria encontrada pela query do auto_followup');
    }

    // 5. Verificar se há interações recentes
    console.log('\n5️⃣ Verificando interações recentes da conversa 18:');
    const interactionsResult = await pool.query(`
      SELECT 
        block_name,
        timestamp,
        EXTRACT(EPOCH FROM (NOW() - timestamp)) as seconds_ago
      FROM workflow_interactions 
      WHERE conversation_id = 18
      ORDER BY timestamp DESC
      LIMIT 5
    `);
    
    if (interactionsResult.rows.length > 0) {
      console.log(`✅ Interações encontradas:`);
      for (const interaction of interactionsResult.rows) {
        const minutesAgo = Math.round(interaction.seconds_ago / 60);
        console.log(`   ${interaction.block_name}: ${minutesAgo} minutos atrás`);
      }
    } else {
      console.log('❌ Nenhuma interação encontrada para conversa 18');
    }

    console.log('\n✅ Debug da conversa 18 concluído!');

  } catch (error) {
    console.error('❌ Erro durante o debug:', error);
  } finally {
    await pool.end();
  }
}

debugConversation18();
