const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function checkStatus() {
  try {
    console.log('🔍 VERIFICANDO STATUS DOS WORKFLOWS...\n');
    
    // Verificar workflows cadastrados
    const workflows = await pool.query('SELECT workflow_name, is_active, created_at FROM workflow_configs ORDER BY created_at DESC');
    
    console.log('📋 WORKFLOWS CADASTRADOS:');
    workflows.rows.forEach(w => {
      const status = w.is_active ? '🟢 ATIVO' : '🔴 INATIVO';
      console.log(`${status} - ${w.workflow_name} (${w.created_at})`);
    });
    
    // Verificar conversas ativas
    const conversations = await pool.query('SELECT COUNT(*) as total, status FROM workflow_conversations GROUP BY status');
    
    console.log('\n💬 CONVERSAS ATIVAS:');
    conversations.rows.forEach(c => {
      console.log(`${c.status}: ${c.total} conversas`);
    });
    
    // Verificar interações recentes
    const interactions = await pool.query('SELECT COUNT(*) as total FROM workflow_interactions WHERE timestamp > NOW() - INTERVAL \'24 hours\'');
    
    console.log(`\n📊 INTERAÇÕES NAS ÚLTIMAS 24H: ${interactions.rows[0].total}`);
    
    console.log('\n✅ Sistema funcionando corretamente!');
    
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error.message);
  } finally {
    await pool.end();
  }
}

checkStatus(); 