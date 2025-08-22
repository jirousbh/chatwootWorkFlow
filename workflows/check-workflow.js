const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function checkWorkflow() {
  try {
    const result = await pool.query(
      'SELECT workflow_name, config FROM workflow_configs WHERE workflow_name = $1', 
      ['teste disable auto follow up']
    );
    
    if (result.rows.length > 0) {
      const workflow = result.rows[0];
      console.log('Workflow encontrado:', workflow.workflow_name);
      console.log('Tem auto_followup:', !!workflow.config.auto_followup);
      
      if (workflow.config.auto_followup) {
        console.log('Auto_followup configurado:');
        for (const [blockName, followup] of Object.entries(workflow.config.auto_followup)) {
          console.log(`  ${blockName}: ${followup.delay}s - ${followup.condition}`);
        }
      } else {
        console.log('Nenhum auto_followup configurado');
      }
    } else {
      console.log('Workflow não encontrado');
    }
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await pool.end();
  }
}

checkWorkflow();
