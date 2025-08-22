const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function testResetBehavior() {
  const contactId = '+553175012310';
  console.log(`🔍 Testando comportamento após !reset para contact: ${contactId}`);
  console.log('=' .repeat(60));

  try {
    // 1. Verificar conversas atuais
    console.log('\n1️⃣ Conversas atuais:');
    const conversationsResult = await pool.query(`
      SELECT 
        wc.id,
        wc.contact_id,
        wc.workflow_name,
        wc.current_block,
        wc.status,
        wc.last_activity,
        bcs.auto_followup_disabled,
        bcs.bot_active
      FROM workflow_conversations wc
      LEFT JOIN bot_conversation_status bcs ON wc.id = bcs.conversation_id
      WHERE wc.contact_id = $1
      ORDER BY wc.id
    `, [contactId]);
    
    if (conversationsResult.rows.length > 0) {
      console.log(`✅ Encontradas ${conversationsResult.rows.length} conversa(s):`);
      for (const conv of conversationsResult.rows) {
        console.log(`   💬 ID ${conv.id}: ${conv.workflow_name} - ${conv.current_block} - Status: ${conv.status}`);
        console.log(`      Bot ativo: ${conv.bot_active}, Auto_followup: ${conv.auto_followup_disabled ? 'Desativado' : 'Ativado'}`);
      }
    } else {
      console.log('❌ Nenhuma conversa encontrada');
    }

    // 2. Verificar status do bot
    console.log('\n2️⃣ Status do bot:');
    const botStatusResult = await pool.query(`
      SELECT 
        conversation_id,
        contact_id,
        bot_active,
        auto_followup_disabled,
        followup_disabled_by,
        last_interaction_at
      FROM bot_conversation_status 
      WHERE contact_id = $1
      ORDER BY conversation_id
    `, [contactId]);
    
    if (botStatusResult.rows.length > 0) {
      console.log(`✅ Encontrados ${botStatusResult.rows.length} status(es):`);
      for (const status of botStatusResult.rows) {
        console.log(`   🤖 Conversation ${status.conversation_id}:`);
        console.log(`      Bot ativo: ${status.bot_active}`);
        console.log(`      Auto_followup desativado: ${status.auto_followup_disabled}`);
        console.log(`      Desativado por: ${status.followup_disabled_by || 'padrão'}`);
        console.log(`      Última interação: ${status.last_interaction_at}`);
      }
    } else {
      console.log('❌ Nenhum status encontrado');
    }

    // 3. Simular o que acontece após !reset
    console.log('\n3️⃣ Simulando comportamento após !reset:');
    console.log('   O comando !reset faz:');
    console.log('   1. DELETE FROM workflow_conversations WHERE contact_id = $1');
    console.log('   2. Remove todos os labels');
    console.log('   3. reactivateBotForConversation() - que define auto_followup_disabled = true');
    
    // 4. Verificar se há conversas órfãs (em bot_conversation_status mas não em workflow_conversations)
    console.log('\n4️⃣ Verificando conversas órfãs:');
    const orphanResult = await pool.query(`
      SELECT 
        bcs.conversation_id,
        bcs.contact_id,
        bcs.auto_followup_disabled,
        bcs.bot_active,
        CASE WHEN wc.id IS NULL THEN 'ÓRFÃ' ELSE 'OK' END as status
      FROM bot_conversation_status bcs
      LEFT JOIN workflow_conversations wc ON bcs.conversation_id = wc.id
      WHERE bcs.contact_id = $1
      ORDER BY bcs.conversation_id
    `, [contactId]);
    
    if (orphanResult.rows.length > 0) {
      console.log(`✅ Encontradas ${orphanResult.rows.length} entrada(s) em bot_conversation_status:`);
      for (const orphan of orphanResult.rows) {
        console.log(`   🤖 Conversation ${orphan.conversation_id}: ${orphan.status}`);
        console.log(`      Bot ativo: ${orphan.bot_active}, Auto_followup: ${orphan.auto_followup_disabled ? 'Desativado' : 'Ativado'}`);
      }
    }

    // 5. Verificar qual conversa seria processada pelo auto_followup
    console.log('\n5️⃣ Verificando qual conversa seria processada pelo auto_followup:');
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
        AND wc.contact_id = $1
      ORDER BY wc.last_activity ASC
    `, [contactId]);
    
    if (autoFollowupQuery.rows.length > 0) {
      console.log(`✅ Conversas que seriam processadas pelo auto_followup:`);
      for (const conv of autoFollowupQuery.rows) {
        const minutesInactive = Math.round(conv.seconds_inactive / 60);
        console.log(`   💬 ID ${conv.id}: ${conv.workflow_name} - ${conv.current_block}`);
        console.log(`      Inativo há: ${minutesInactive} minutos`);
        console.log(`      Auto_followup: ${conv.auto_followup_disabled ? 'Desativado' : 'Ativado'}`);
      }
    } else {
      console.log('❌ Nenhuma conversa seria processada pelo auto_followup');
    }

    console.log('\n✅ Análise concluída!');
    console.log('\n📋 Resumo:');
    console.log('   • O comando !reset deleta a conversa de workflow_conversations');
    console.log('   • Reativa o bot com auto_followup_disabled = true');
    console.log('   • Quando uma nova conversa é iniciada, ela precisa ativar o auto_followup explicitamente');

  } catch (error) {
    console.error('❌ Erro durante a análise:', error);
  } finally {
    await pool.end();
  }
}

testResetBehavior();
