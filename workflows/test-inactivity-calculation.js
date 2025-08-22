const { Pool } = require('pg');

// Configuração do banco
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

async function testInactivityCalculation() {
  try {
    console.log('🧪 Testando cálculo de inatividade...\n');
    
    // Buscar uma conversa ativa
    const result = await pool.query(`
      SELECT 
        id,
        contact_id,
        workflow_name,
        current_block,
        last_activity,
        created_at
      FROM workflow_conversations 
      WHERE status = 'active' 
        AND last_activity IS NOT NULL
      ORDER BY last_activity ASC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ Nenhuma conversa ativa encontrada');
      return;
    }
    
    const conversation = result.rows[0];
    console.log(`📋 Conversa encontrada:`);
    console.log(`   ID: ${conversation.id}`);
    console.log(`   Contact: ${conversation.contact_id}`);
    console.log(`   Workflow: ${conversation.workflow_name}`);
    console.log(`   Bloco atual: ${conversation.current_block}`);
    console.log(`   Criada em: ${conversation.created_at}`);
    console.log(`   Última atividade: ${conversation.last_activity}`);
    
    // Teste 1: Cálculo PostgreSQL (antigo)
    const postgresResult = await pool.query(`
      SELECT 
        EXTRACT(EPOCH FROM (NOW() - $1::timestamp)) / 1000 as seconds_inactive_postgres
    `, [conversation.last_activity]);
    
    const postgresSeconds = postgresResult.rows[0].seconds_inactive_postgres;
    
    // Teste 2: Cálculo JavaScript (novo)
    const now = new Date();
    const lastActivity = new Date(conversation.last_activity);
    const jsSeconds = Math.floor((now - lastActivity) / 1000);
    
    console.log('\n📊 COMPARAÇÃO DOS CÁLCULOS:');
    console.log('============================');
    console.log(`⏰ Agora (JavaScript): ${now.toISOString()}`);
    console.log(`⏰ Última atividade: ${lastActivity.toISOString()}`);
    console.log(`📊 PostgreSQL: ${postgresSeconds} segundos`);
    console.log(`📊 JavaScript: ${jsSeconds} segundos`);
    console.log(`📊 Diferença: ${Math.abs(postgresSeconds - jsSeconds)} segundos`);
    
    // Teste 3: Verificar se há problemas de timezone
    const timezoneResult = await pool.query('SELECT NOW() as db_now, NOW() AT TIME ZONE \'UTC\' as db_now_utc');
    const dbNow = timezoneResult.rows[0].db_now;
    const dbNowUtc = timezoneResult.rows[0].db_now_utc;
    
    console.log('\n🌍 VERIFICAÇÃO DE TIMEZONE:');
    console.log('===========================');
    console.log(`🗄️ Banco de dados NOW(): ${dbNow}`);
    console.log(`🗄️ Banco de dados NOW() UTC: ${dbNowUtc}`);
    console.log(`💻 JavaScript new Date(): ${now.toISOString()}`);
    
    // Teste 4: Simular followup de 90 segundos
    const delay90Seconds = 90;
    console.log('\n🎯 TESTE DE FOLLOWUP 90s:');
    console.log('==========================');
    console.log(`⏰ Delay configurado: ${delay90Seconds} segundos`);
    console.log(`📊 PostgreSQL >= 90s: ${postgresSeconds >= delay90Seconds ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`📊 JavaScript >= 90s: ${jsSeconds >= delay90Seconds ? '✅ SIM' : '❌ NÃO'}`);
    
    if (postgresSeconds >= delay90Seconds && jsSeconds < delay90Seconds) {
      console.log('🚨 PROBLEMA IDENTIFICADO: PostgreSQL diz que pode executar, mas JavaScript não!');
    } else if (jsSeconds >= delay90Seconds && postgresSeconds < delay90Seconds) {
      console.log('🚨 PROBLEMA IDENTIFICADO: JavaScript diz que pode executar, mas PostgreSQL não!');
    } else if (jsSeconds >= delay90Seconds && postgresSeconds >= delay90Seconds) {
      console.log('✅ AMBOS OS CÁLCULOS CONCORDAM: Pode executar followup');
    } else {
      console.log('✅ AMBOS OS CÁLCULOS CONCORDAM: Ainda não pode executar followup');
    }
    
    // Teste 5: Verificar outras conversas
    console.log('\n📋 OUTRAS CONVERSAS ATIVAS:');
    console.log('============================');
    const allActiveResult = await pool.query(`
      SELECT 
        contact_id,
        workflow_name,
        last_activity,
        EXTRACT(EPOCH FROM (NOW() - last_activity)) / 1000 as seconds_inactive_postgres
      FROM workflow_conversations 
      WHERE status = 'active' 
        AND last_activity IS NOT NULL
      ORDER BY last_activity ASC 
      LIMIT 5
    `);
    
    for (const conv of allActiveResult.rows) {
      const lastAct = new Date(conv.last_activity);
      const jsSec = Math.floor((now - lastAct) / 1000);
      const postgresSec = parseFloat(conv.seconds_inactive_postgres);
      const diff = Math.abs(postgresSec - jsSec);
      
      console.log(`\n💬 ${conv.contact_id} (${conv.workflow_name}):`);
      console.log(`   PostgreSQL: ${postgresSec.toFixed(2)}s`);
      console.log(`   JavaScript: ${jsSec}s`);
      console.log(`   Diferença: ${diff.toFixed(2)}s`);
      console.log(`   Última atividade: ${lastAct.toISOString()}`);
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  } finally {
    await pool.end();
  }
}

// Executar teste
testInactivityCalculation();
