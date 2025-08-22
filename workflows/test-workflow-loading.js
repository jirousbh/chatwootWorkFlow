const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function testWorkflowLoading() {
  const workflowName = 'teste disable auto follow up';
  console.log(`🔍 Testando carregamento do workflow: ${workflowName}`);
  console.log('=' .repeat(60));

  try {
    // 1. Verificar se existe em inbox_workflows
    console.log('\n1️⃣ Verificando em inbox_workflows:');
    const inboxResult = await pool.query(`
      SELECT workflow_name, workflow_config, is_active
      FROM inbox_workflows 
      WHERE workflow_name = $1
    `, [workflowName]);
    
    if (inboxResult.rows.length > 0) {
      const workflow = inboxResult.rows[0];
      console.log(`✅ Encontrado em inbox_workflows:`);
      console.log(`   Ativo: ${workflow.is_active}`);
      console.log(`   Tem auto_followup: ${!!workflow.workflow_config.auto_followup}`);
      
      if (workflow.workflow_config.auto_followup) {
        console.log(`   Auto_followup configurado:`);
        for (const [blockName, followup] of Object.entries(workflow.workflow_config.auto_followup)) {
          console.log(`     ${blockName}: ${followup.delay}s - ${followup.condition}`);
        }
      }
    } else {
      console.log('❌ Não encontrado em inbox_workflows');
    }

    // 2. Verificar se existe em workflow_configs
    console.log('\n2️⃣ Verificando em workflow_configs:');
    const configResult = await pool.query(`
      SELECT workflow_name, config, is_active
      FROM workflow_configs 
      WHERE workflow_name = $1
    `, [workflowName]);
    
    if (configResult.rows.length > 0) {
      const workflow = configResult.rows[0];
      console.log(`✅ Encontrado em workflow_configs:`);
      console.log(`   Ativo: ${workflow.is_active}`);
      console.log(`   Tem auto_followup: ${!!workflow.config.auto_followup}`);
    } else {
      console.log('❌ Não encontrado em workflow_configs');
    }

    // 3. Simular a função getWorkflowsWithAutoFollowup
    console.log('\n3️⃣ Simulando getWorkflowsWithAutoFollowup:');
    const autoFollowupResult = await pool.query(`
      SELECT workflow_name, workflow_config as config 
      FROM inbox_workflows 
      WHERE is_active = true 
        AND workflow_config::text LIKE '%auto_followup%'
        AND workflow_name = $1
    `, [workflowName]);
    
    if (autoFollowupResult.rows.length > 0) {
      console.log(`✅ Workflow seria encontrado por getWorkflowsWithAutoFollowup`);
      const config = autoFollowupResult.rows[0].config;
      if (config.auto_followup) {
        console.log(`   Auto_followup configurado:`);
        for (const [blockName, followup] of Object.entries(config.auto_followup)) {
          console.log(`     ${blockName}: ${followup.delay}s - ${followup.condition}`);
        }
      }
    } else {
      console.log('❌ Workflow NÃO seria encontrado por getWorkflowsWithAutoFollowup');
    }

    // 4. Simular a função loadWorkflowFromDatabase
    console.log('\n4️⃣ Simulando loadWorkflowFromDatabase:');
    
    // Primeiro tentar workflow_configs
    let result = await pool.query(
      'SELECT * FROM workflow_configs WHERE workflow_name = $1 AND is_active = true',
      [workflowName]
    );
    
    if (result.rows.length === 0) {
      console.log('🔍 Não encontrado em workflow_configs, buscando em inbox_workflows...');
      result = await pool.query(
        'SELECT workflow_name, workflow_config as config FROM inbox_workflows WHERE workflow_name = $1 AND is_active = true',
        [workflowName]
      );
    }
    
    if (result.rows.length > 0) {
      const workflowData = result.rows[0];
      console.log(`✅ Workflow seria carregado por loadWorkflowFromDatabase`);
      console.log(`   Fonte: ${workflowData.config ? 'inbox_workflows' : 'workflow_configs'}`);
    } else {
      console.log('❌ Workflow NÃO seria carregado por loadWorkflowFromDatabase');
    }

    // 5. Verificar conversas que usam este workflow
    console.log('\n5️⃣ Conversas que usam este workflow:');
    const conversationsResult = await pool.query(`
      SELECT 
        id,
        contact_id,
        current_block,
        last_activity,
        EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
      FROM workflow_conversations 
      WHERE workflow_name = $1 AND status = 'active'
      ORDER BY last_activity ASC
    `, [workflowName]);
    
    if (conversationsResult.rows.length > 0) {
      console.log(`✅ Encontradas ${conversationsResult.rows.length} conversa(s) ativa(s):`);
      for (const conv of conversationsResult.rows) {
        const minutesInactive = Math.round(conv.seconds_inactive / 60);
        console.log(`   💬 ID ${conv.id}: ${conv.contact_id} - ${conv.current_block} - Inativo: ${minutesInactive}min`);
      }
    } else {
      console.log('❌ Nenhuma conversa ativa encontrada para este workflow');
    }

    console.log('\n✅ Teste concluído!');

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    await pool.end();
  }
}

testWorkflowLoading();
