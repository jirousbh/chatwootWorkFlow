const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function listActiveConversations() {
  try {
    console.log('🔍 Listando conversas ativas...\n');
    
    const result = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        status,
        last_activity,
        EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
      FROM workflow_conversations 
      WHERE status = 'active'
      ORDER BY last_activity DESC
      LIMIT 10
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ Nenhuma conversa ativa encontrada');
      return;
    }
    
    console.log(`✅ Encontradas ${result.rows.length} conversa(s) ativa(s):\n`);
    
    result.rows.forEach((row, index) => {
      const minutesInactive = Math.round(row.seconds_inactive / 60);
      console.log(`${index + 1}. ID: ${row.id}`);
      console.log(`   Contact: ${row.contact_id}`);
      console.log(`   Workflow: ${row.workflow_name}`);
      console.log(`   Bloco atual: ${row.current_block}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Última atividade: ${row.last_activity}`);
      console.log(`   Inativo há: ${minutesInactive} minutos`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

listActiveConversations();
