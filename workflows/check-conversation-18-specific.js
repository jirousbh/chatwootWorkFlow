const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function checkConversation18Specific() {
  console.log('🔍 Verificando conversa 18 especificamente...');
  console.log('=' .repeat(60));

  try {
    // 1. Verificar diretamente na tabela workflow_conversations
    console.log('\n1️⃣ Verificando diretamente na workflow_conversations:');
    const directResult = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        status,
        last_activity,
        account_id,
        conversation_id
      FROM workflow_conversations 
      WHERE conversation_id = 18
    `);
    
    if (directResult.rows.length > 0) {
      const conv = directResult.rows[0];
      console.log(`✅ Conversa 18 encontrada diretamente:`);
      console.log(`   ID: ${conv.id}`);
      console.log(`   Contact: ${conv.contact_id}`);
      console.log(`   Workflow: ${conv.workflow_name}`);
      console.log(`   Bloco atual: ${conv.current_block}`);
      console.log(`   Status: ${conv.status}`);
      console.log(`   Account ID: ${conv.account_id}`);
      console.log(`   Conversation ID: ${conv.conversation_id}`);
      console.log(`   Última atividade: ${conv.last_activity}`);
    } else {
      console.log('❌ Conversa 18 não encontrada diretamente');
    }

    // 2. Verificar por contact_id
    console.log('\n2️⃣ Verificando por contact_id:');
    const contactResult = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        status
      FROM workflow_conversations 
      WHERE contact_id = '+553175012310'
      ORDER BY id
    `);
    
    if (contactResult.rows.length > 0) {
      console.log(`✅ Encontradas ${contactResult.rows.length} conversa(s) para o contact:`);
      for (const conv of contactResult.rows) {
        console.log(`   💬 ID ${conv.id}: ${conv.workflow_name} - ${conv.current_block} - Status: ${conv.status}`);
      }
    } else {
      console.log('❌ Nenhuma conversa encontrada para o contact');
    }

    // 3. Verificar todas as conversas com ID próximo a 18
    console.log('\n3️⃣ Verificando conversas com ID próximo a 18:');
    const nearbyResult = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        status
      FROM workflow_conversations 
      WHERE conversation_id BETWEEN 15 AND 25
      ORDER BY id
    `);
    
    if (nearbyResult.rows.length > 0) {
      console.log(`✅ Conversas próximas ao ID 18:`);
      for (const conv of nearbyResult.rows) {
        console.log(`   💬 ID ${conv.id}: ${conv.contact_id} - ${conv.workflow_name} - ${conv.current_block} - Status: ${conv.status}`);
      }
    } else {
      console.log('❌ Nenhuma conversa encontrada próximo ao ID 18');
    }

    // 4. Verificar se há problema com a query do debug anterior
    console.log('\n4️⃣ Verificando query do debug anterior:');
    const debugQueryResult = await pool.query(`
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
        AND wc.conversation_id = 18
    `);
    
    if (debugQueryResult.rows.length > 0) {
      const conv = debugQueryResult.rows[0];
      const minutesInactive = Math.round(conv.seconds_inactive / 60);
      console.log(`✅ Conversa 18 seria encontrada pela query do debug:`);
      console.log(`   Inativo há: ${minutesInactive} minutos`);
    } else {
      console.log('❌ Conversa 18 NÃO seria encontrada pela query do debug');
      console.log('   Possíveis razões:');
      console.log('   - Status não é "active"');
      console.log('   - last_activity é NULL');
      console.log('   - ID não é 18');
    }

    // 5. Verificar status da conversa 18
    console.log('\n5️⃣ Verificando status da conversa 18:');
    const statusResult = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        status,
        last_activity,
        CASE 
          WHEN status = 'active' THEN '✅ Ativo'
          WHEN status = 'completed' THEN '✅ Concluído'
          WHEN status = 'paused' THEN '⏸️ Pausado'
          ELSE '❓ Desconhecido'
        END as status_desc
      FROM workflow_conversations 
      WHERE conversation_id = 18
    `);
    
    if (statusResult.rows.length > 0) {
      const conv = statusResult.rows[0];
      console.log(`✅ Status da conversa 18:`);
      console.log(`   ${conv.status_desc} (${conv.status})`);
      console.log(`   Última atividade: ${conv.last_activity}`);
      console.log(`   Workflow: ${conv.workflow_name}`);
      console.log(`   Bloco: ${conv.current_block}`);
    } else {
      console.log('❌ Conversa 18 não encontrada para verificação de status');
    }

    console.log('\n✅ Verificação específica concluída!');

  } catch (error) {
    console.error('❌ Erro durante a verificação:', error);
  } finally {
    await pool.end();
  }
}

checkConversation18Specific();
