const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function checkContactConversations() {
  const contactId = '+553175012310';
  console.log(`🔍 Verificando todas as conversas do contact: ${contactId}`);
  console.log('=' .repeat(60));

  try {
    // 1. Verificar na tabela workflow_conversations
    console.log('\n1️⃣ Conversas na tabela workflow_conversations:');
    const workflowConvResult = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        status,
        last_activity
      FROM workflow_conversations 
      WHERE contact_id = $1
      ORDER BY last_activity DESC
    `, [contactId]);
    
    if (workflowConvResult.rows.length > 0) {
      console.log(`✅ Encontradas ${workflowConvResult.rows.length} conversa(s):`);
      for (const conv of workflowConvResult.rows) {
        console.log(`   💬 ID ${conv.id}: ${conv.workflow_name} - ${conv.current_block} - Status: ${conv.status}`);
      }
    } else {
      console.log('❌ Nenhuma conversa encontrada na tabela workflow_conversations');
    }

    // 2. Verificar na tabela bot_conversation_status
    console.log('\n2️⃣ Status na tabela bot_conversation_status:');
    const botStatusResult = await pool.query(`
      SELECT 
        conversation_id,
        contact_id,
        bot_active,
        auto_followup_disabled,
        has_human_agent
      FROM bot_conversation_status 
      WHERE contact_id = $1
      ORDER BY conversation_id
    `, [contactId]);
    
    if (botStatusResult.rows.length > 0) {
      console.log(`✅ Encontrados ${botStatusResult.rows.length} status(es):`);
      for (const status of botStatusResult.rows) {
        console.log(`   🤖 Conversation ${status.conversation_id}: Bot ativo: ${status.bot_active}, Auto_followup: ${!status.auto_followup_disabled}`);
      }
    } else {
      console.log('❌ Nenhum status encontrado na tabela bot_conversation_status');
    }

    // 3. Verificar interações
    console.log('\n3️⃣ Interações na tabela workflow_interactions:');
    const interactionsResult = await pool.query(`
      SELECT 
        conversation_id,
        block_name,
        timestamp
      FROM workflow_interactions 
      WHERE contact_id = $1
      ORDER BY timestamp DESC
      LIMIT 10
    `, [contactId]);
    
    if (interactionsResult.rows.length > 0) {
      console.log(`✅ Encontradas ${interactionsResult.rows.length} interação(ões):`);
      for (const interaction of interactionsResult.rows) {
        console.log(`   📝 Conversation ${interaction.conversation_id}: ${interaction.block_name} - ${interaction.timestamp}`);
      }
    } else {
      console.log('❌ Nenhuma interação encontrada');
    }

    // 4. Verificar se há inconsistência
    console.log('\n4️⃣ Análise de inconsistência:');
    const workflowIds = workflowConvResult.rows.map(r => r.id);
    const botIds = botStatusResult.rows.map(r => r.conversation_id);
    
    console.log(`   IDs em workflow_conversations: [${workflowIds.join(', ')}]`);
    console.log(`   IDs em bot_conversation_status: [${botIds.join(', ')}]`);
    
    const missingInWorkflow = botIds.filter(id => !workflowIds.includes(id));
    const missingInBot = workflowIds.filter(id => !botIds.includes(id));
    
    if (missingInWorkflow.length > 0) {
      console.log(`   ⚠️ Conversas em bot_conversation_status mas não em workflow_conversations: [${missingInWorkflow.join(', ')}]`);
    }
    
    if (missingInBot.length > 0) {
      console.log(`   ⚠️ Conversas em workflow_conversations mas não em bot_conversation_status: [${missingInBot.join(', ')}]`);
    }

    console.log('\n✅ Análise concluída!');

  } catch (error) {
    console.error('❌ Erro durante a análise:', error);
  } finally {
    await pool.end();
  }
}

checkContactConversations();
