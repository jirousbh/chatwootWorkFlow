const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function saveTestWorkflow() {
  try {
    // Ler o arquivo JSON do workflow
    const workflowPath = '/app/jsons/teste_inovai_disable_follow_up.json';
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const workflowConfig = JSON.parse(workflowContent);
    
    console.log('📋 Salvando workflow:', workflowConfig.name);
    console.log('📋 Tem auto_followup:', !!workflowConfig.auto_followup);
    
    if (workflowConfig.auto_followup) {
      console.log('📋 Auto_followup configurado:');
      for (const [blockName, followup] of Object.entries(workflowConfig.auto_followup)) {
        console.log(`  ${blockName}: ${followup.delay}s - ${followup.condition}`);
      }
    }
    
    // Salvar no banco
    const result = await pool.query(`
      INSERT INTO workflow_configs (workflow_name, config, is_active) 
      VALUES ($1, $2, true)
      ON CONFLICT (workflow_name) 
      DO UPDATE SET 
        config = $2,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [workflowConfig.name, workflowConfig]);
    
    console.log('✅ Workflow salvo com sucesso!');
    console.log('📋 ID:', result.rows[0].id);
    console.log('📋 Nome:', result.rows[0].workflow_name);
    console.log('📋 Ativo:', result.rows[0].is_active);
    
  } catch (error) {
    console.error('❌ Erro ao salvar workflow:', error);
  } finally {
    await pool.end();
  }
}

saveTestWorkflow();
