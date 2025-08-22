const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function checkDatabaseInfo() {
  console.log('🔍 Verificando informações do banco de dados...');
  console.log('=' .repeat(60));

  try {
    // 1. Verificar informações da conexão
    console.log('\n1️⃣ Informações da conexão:');
    const connectionResult = await pool.query('SELECT current_database(), current_user, version()');
    console.log(`   Database: ${connectionResult.rows[0].current_database}`);
    console.log(`   User: ${connectionResult.rows[0].current_user}`);
    console.log(`   PostgreSQL: ${connectionResult.rows[0].version.split(',')[0]}`);

    // 2. Verificar todas as tabelas
    console.log('\n2️⃣ Tabelas disponíveis:');
    const tablesResult = await pool.query(`
      SELECT table_name, table_schema
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`✅ Encontradas ${tablesResult.rows.length} tabelas:`);
    for (const table of tablesResult.rows) {
      console.log(`   📋 ${table.table_name} (schema: ${table.table_schema})`);
    }

    // 3. Verificar estrutura da tabela workflow_conversations
    console.log('\n3️⃣ Estrutura da tabela workflow_conversations:');
    const structureResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'workflow_conversations'
      ORDER BY ordinal_position
    `);
    
    console.log(`✅ Colunas da tabela workflow_conversations:`);
    for (const column of structureResult.rows) {
      console.log(`   ${column.column_name}: ${column.data_type} (nullable: ${column.is_nullable})`);
    }

    // 4. Verificar total de registros na tabela workflow_conversations
    console.log('\n4️⃣ Total de registros em workflow_conversations:');
    const countResult = await pool.query('SELECT COUNT(*) as total FROM workflow_conversations');
    console.log(`   Total de registros: ${countResult.rows[0].total}`);

    // 5. Verificar IDs disponíveis
    console.log('\n5️⃣ IDs disponíveis na tabela workflow_conversations:');
    const idsResult = await pool.query(`
      SELECT id, contact_id, workflow_name, status
      FROM workflow_conversations 
      ORDER BY id
      LIMIT 10
    `);
    
    console.log(`✅ Primeiros 10 registros:`);
    for (const record of idsResult.rows) {
      console.log(`   ID ${record.id}: ${record.contact_id} - ${record.workflow_name} - ${record.status}`);
    }

    // 6. Verificar se há conversa 18 em qualquer lugar
    console.log('\n6️⃣ Verificando conversa 18 em todas as tabelas:');
    
    // workflow_conversations
    const conv18Result = await pool.query('SELECT id, conversation_id, contact_id, status FROM workflow_conversations WHERE conversation_id = 18');
    if (conv18Result.rows.length > 0) {
      console.log(`   ✅ workflow_conversations: ID 18 encontrado`);
    } else {
      console.log(`   ❌ workflow_conversations: ID 18 não encontrado`);
    }
    
    // bot_conversation_status
    const bot18Result = await pool.query('SELECT conversation_id, contact_id FROM bot_conversation_status WHERE conversation_id = 18');
    if (bot18Result.rows.length > 0) {
      console.log(`   ✅ bot_conversation_status: ID 18 encontrado`);
    } else {
      console.log(`   ❌ bot_conversation_status: ID 18 não encontrado`);
    }
    
    // workflow_interactions
    const int18Result = await pool.query('SELECT conversation_id, COUNT(*) as interactions FROM workflow_interactions WHERE conversation_id = 18 GROUP BY conversation_id');
    if (int18Result.rows.length > 0) {
      console.log(`   ✅ workflow_interactions: ID 18 encontrado (${int18Result.rows[0].interactions} interações)`);
    } else {
      console.log(`   ❌ workflow_interactions: ID 18 não encontrado`);
    }

    console.log('\n✅ Verificação do banco concluída!');

  } catch (error) {
    console.error('❌ Erro durante a verificação:', error);
  } finally {
    await pool.end();
  }
}

checkDatabaseInfo();
