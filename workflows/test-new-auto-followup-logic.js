const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function testNewAutoFollowupLogic() {
  console.log('🧪 Testando nova lógica de auto_followup (padrão desativado, ativação explícita)');
  console.log('=' .repeat(60));

  try {
    // 1. Verificar workflows com auto_followup no banco
    console.log('\n1️⃣ Verificando workflows com auto_followup no banco...');
    const workflowsResult = await pool.query(`
      SELECT workflow_name, config 
      FROM workflow_configs 
      WHERE config::text LIKE '%auto_followup%'
    `);
    
    console.log(`✅ Encontrados ${workflowsResult.rows.length} workflows com auto_followup`);
    
    for (const workflow of workflowsResult.rows) {
      try {
        console.log(`   🔍 Verificando workflow: ${workflow.workflow_name}`);
        
        // config já é um objeto JSONB, não precisa fazer parse
        const config = workflow.config;
        const followupCount = config.auto_followup ? Object.keys(config.auto_followup).length : 0;
        console.log(`   📋 ${workflow.workflow_name}: ${followupCount} followups`);
        
        // Mostrar detalhes dos followups
        if (config.auto_followup) {
          for (const [blockName, followup] of Object.entries(config.auto_followup)) {
            console.log(`      ⏰ ${blockName}: ${followup.delay}s - ${followup.condition}`);
          }
        }
      } catch (parseError) {
        console.log(`   ❌ Erro ao processar workflow ${workflow.workflow_name}: ${parseError.message}`);
      }
    }

    // 2. Verificar estrutura da tabela bot_conversation_status
    console.log('\n2️⃣ Verificando estrutura da tabela bot_conversation_status...');
    const tableStructureResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bot_conversation_status'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Colunas da tabela bot_conversation_status:');
    for (const column of tableStructureResult.rows) {
      console.log(`   ${column.column_name}: ${column.data_type}`);
    }

    // 3. Verificar conversas ativas e seus status (sem colunas que podem não existir)
    console.log('\n3️⃣ Verificando conversas ativas e status do auto_followup...');
    const conversationsResult = await pool.query(`
      SELECT 
        wc.id,
        wc.contact_id,
        wc.current_block,
        wc.workflow_name,
        wc.last_activity,
        bcs.auto_followup_disabled,
        bcs.bot_active,
        bcs.has_human_agent
      FROM workflow_conversations wc
      LEFT JOIN bot_conversation_status bcs ON wc.id = bcs.conversation_id
      WHERE wc.status = 'active'
      ORDER BY wc.last_activity DESC
      LIMIT 5
    `);
    
    console.log(`✅ Encontradas ${conversationsResult.rows.length} conversas ativas`);
    
    for (const conv of conversationsResult.rows) {
      console.log(`   💬 Conversa ${conv.id}: ${conv.contact_id} - Bloco: ${conv.current_block}`);
      console.log(`      🤖 Bot ativo: ${conv.bot_active !== false}`);
      console.log(`      🚫 Auto_followup desativado: ${conv.auto_followup_disabled !== false}`);
      console.log(`      👤 Tem agente humano: ${conv.has_human_agent === true}`);
      
      // Calcular tempo inativo
      const lastActivity = new Date(conv.last_activity);
      const now = new Date();
      const secondsInactive = Math.floor((now - lastActivity) / 1000);
      console.log(`      ⏰ Inativo há: ${Math.round(secondsInactive / 60)} minutos`);
    }

    // 4. Testar criação de novo status (simular nova conversa)
    console.log('\n4️⃣ Testando criação de novo status (simulação)...');
    
    // Simular criação de novo status
    const testConversationId = 999999; // ID fictício para teste
    const testContactId = '5511999999999';
    
    const newStatusResult = await pool.query(`
      INSERT INTO bot_conversation_status 
      (conversation_id, contact_id, bot_active, auto_followup_disabled, last_interaction_at, created_at, updated_at) 
      VALUES ($1, $2, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
      ON CONFLICT (conversation_id) 
      DO UPDATE SET 
        auto_followup_disabled = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [testConversationId, testContactId]);
    
    console.log(`✅ Status de teste criado: auto_followup_disabled = ${newStatusResult.rows[0].auto_followup_disabled}`);
    
    // Testar ativação do auto_followup
    const enableResult = await pool.query(`
      UPDATE bot_conversation_status 
      SET auto_followup_disabled = false, 
          updated_at = CURRENT_TIMESTAMP
      WHERE conversation_id = $1
      RETURNING *
    `, [testConversationId]);
    
    console.log(`✅ Auto_followup ativado: auto_followup_disabled = ${enableResult.rows[0].auto_followup_disabled}`);
    
    // Limpar teste
    await pool.query('DELETE FROM bot_conversation_status WHERE conversation_id = $1', [testConversationId]);
    console.log('🧹 Dados de teste removidos');

    console.log('\n✅ Teste concluído!');
    console.log('\n📋 Resumo da nova lógica:');
    console.log('   • auto_followup_disabled = true por padrão');
    console.log('   • Precisa ser ativado explicitamente com "disable_auto_followup": false');
    console.log('   • Pode ser desativado com "disable_auto_followup": true');
    console.log('   • Funciona tanto em botões quanto em blocos');

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    await pool.end();
  }
}

// Executar teste
testNewAutoFollowupLogic();
