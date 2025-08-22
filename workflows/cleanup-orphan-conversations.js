const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function cleanupOrphanConversations() {
  console.log('🧹 Limpando conversas órfãs...');
  console.log('=' .repeat(60));

  try {
    // 1. Identificar conversas órfãs
    console.log('\n1️⃣ Identificando conversas órfãs:');
    const orphanResult = await pool.query(`
      SELECT 
        bcs.conversation_id,
        bcs.contact_id,
        bcs.auto_followup_disabled,
        bcs.bot_active,
        bcs.last_interaction_at
      FROM bot_conversation_status bcs
      LEFT JOIN workflow_conversations wc ON bcs.conversation_id = wc.id
      WHERE wc.id IS NULL
      ORDER BY bcs.conversation_id
    `);
    
    if (orphanResult.rows.length === 0) {
      console.log('✅ Nenhuma conversa órfã encontrada');
      return;
    }
    
    console.log(`⚠️ Encontradas ${orphanResult.rows.length} conversa(s) órfã(s):`);
    for (const orphan of orphanResult.rows) {
      const lastInteraction = new Date(orphan.last_interaction_at);
      const now = new Date();
      const hoursAgo = Math.round((now - lastInteraction) / (1000 * 60 * 60));
      console.log(`   🤖 Conversation ${orphan.conversation_id}: ${orphan.contact_id}`);
      console.log(`      Bot ativo: ${orphan.bot_active}, Auto_followup: ${orphan.auto_followup_disabled ? 'Desativado' : 'Ativado'}`);
      console.log(`      Última interação: ${hoursAgo} horas atrás`);
    }

    // 2. Perguntar se deve limpar (simular confirmação)
    console.log('\n2️⃣ Simulando limpeza (sem executar):');
    console.log('   Para limpar as conversas órfãs, execute:');
    console.log('   DELETE FROM bot_conversation_status WHERE conversation_id IN (lista_de_ids)');
    
    // 3. Mostrar o comando SQL que seria executado
    const orphanIds = orphanResult.rows.map(r => r.conversation_id);
    console.log(`\n3️⃣ Comando SQL que seria executado:`);
    console.log(`   DELETE FROM bot_conversation_status WHERE conversation_id IN (${orphanIds.join(', ')});`);
    
    // 4. Verificar se há interações órfãs também
    console.log('\n4️⃣ Verificando interações órfãs:');
    const orphanInteractionsResult = await pool.query(`
      SELECT 
        wi.conversation_id,
        wi.contact_id,
        COUNT(*) as interaction_count
      FROM workflow_interactions wi
      LEFT JOIN workflow_conversations wc ON wi.conversation_id = wc.id
      WHERE wc.id IS NULL
      GROUP BY wi.conversation_id, wi.contact_id
      ORDER BY wi.conversation_id
    `);
    
    if (orphanInteractionsResult.rows.length > 0) {
      console.log(`⚠️ Encontradas interações órfãs:`);
      for (const interaction of orphanInteractionsResult.rows) {
        console.log(`   📝 Conversation ${interaction.conversation_id}: ${interaction.interaction_count} interações`);
      }
      
      const orphanInteractionIds = orphanInteractionsResult.rows.map(r => r.conversation_id);
      console.log(`\n   Comando SQL para limpar interações:`);
      console.log(`   DELETE FROM workflow_interactions WHERE conversation_id IN (${orphanInteractionIds.join(', ')});`);
    } else {
      console.log('✅ Nenhuma interação órfã encontrada');
    }

    // 5. Verificar conversas ativas por contact
    console.log('\n5️⃣ Verificando conversas ativas por contact:');
    const activeContactsResult = await pool.query(`
      SELECT 
        contact_id,
        COUNT(*) as active_conversations,
        STRING_AGG(id::text, ', ') as conversation_ids
      FROM workflow_conversations 
      WHERE status = 'active'
      GROUP BY contact_id
      HAVING COUNT(*) > 1
      ORDER BY contact_id
    `);
    
    if (activeContactsResult.rows.length > 0) {
      console.log(`⚠️ Contacts com múltiplas conversas ativas:`);
      for (const contact of activeContactsResult.rows) {
        console.log(`   📞 ${contact.contact_id}: ${contact.active_conversations} conversas (IDs: ${contact.conversation_ids})`);
      }
    } else {
      console.log('✅ Nenhum contact com múltiplas conversas ativas');
    }

    console.log('\n✅ Análise concluída!');
    console.log('\n📋 Recomendações:');
    console.log('   1. Limpar conversas órfãs para evitar confusão');
    console.log('   2. Verificar se há múltiplas conversas ativas por contact');
    console.log('   3. Manter apenas a conversa mais recente ativa');

  } catch (error) {
    console.error('❌ Erro durante a análise:', error);
  } finally {
    await pool.end();
  }
}

cleanupOrphanConversations();
