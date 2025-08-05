const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825',
});

async function testScheduling() {
  try {
    console.log('🧪 Testando sistema de agendamento...\n');
    
    // 1. Verificar timezone do PostgreSQL
    console.log('1️⃣ Verificando timezone do PostgreSQL:');
    const timezoneResult = await pool.query('SHOW timezone');
    console.log(`   Timezone atual: ${timezoneResult.rows[0].TimeZone}`);
    
    // 2. Verificar horário atual em diferentes timezones
    console.log('\n2️⃣ Verificando horário atual:');
    const timeResult = await pool.query(`
      SELECT 
        NOW() as current_time,
        NOW() AT TIME ZONE 'UTC' as current_time_utc,
        NOW() AT TIME ZONE 'America/Sao_Paulo' as current_time_brasil
    `);
    console.log(`   Horário atual (local): ${timeResult.rows[0].current_time}`);
    console.log(`   Horário atual (UTC): ${timeResult.rows[0].current_time_utc}`);
    console.log(`   Horário atual (Brasil): ${timeResult.rows[0].current_time_brasil}`);
    
    // 3. Criar uma campanha de teste agendada para 2 minutos no futuro
    console.log('\n3️⃣ Criando campanha de teste...');
    const testTime = new Date();
    testTime.setMinutes(testTime.getMinutes() + 2);
    const scheduledAt = testTime.toISOString().replace('Z', '-03:00');
    
    console.log(`   Agendando para: ${scheduledAt}`);
    
    const insertResult = await pool.query(`
      INSERT INTO campaigns (name, type, scheduled_at, status, created_by)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, name, scheduled_at
    `, ['Teste Agendamento', 'test', scheduledAt, 'pending', 1]);
    
    const testCampaign = insertResult.rows[0];
    console.log(`   Campanha criada: ID ${testCampaign.id}`);
    console.log(`   scheduled_at salvo: ${testCampaign.scheduled_at}`);
    
    // 4. Testar a consulta de agendamento
    console.log('\n4️⃣ Testando consulta de agendamento:');
    const scheduledResult = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.scheduled_at,
        c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' as scheduled_at_brasil,
        NOW() AT TIME ZONE 'America/Sao_Paulo' as current_time_brasil,
        c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' >= (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '5 minutes' as is_after_minus_5,
        c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' <= (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '5 minutes' as is_before_plus_5
      FROM campaigns c
      WHERE c.id = $1
    `, [testCampaign.id]);
    
    const scheduledCampaign = scheduledResult.rows[0];
    console.log(`   ID: ${scheduledCampaign.id}`);
    console.log(`   Nome: ${scheduledCampaign.name}`);
    console.log(`   scheduled_at (bruto): ${scheduledCampaign.scheduled_at}`);
    console.log(`   scheduled_at (Brasil): ${scheduledCampaign.scheduled_at_brasil}`);
    console.log(`   current_time (Brasil): ${scheduledCampaign.current_time_brasil}`);
    console.log(`   is_after_minus_5: ${scheduledCampaign.is_after_minus_5}`);
    console.log(`   is_before_plus_5: ${scheduledCampaign.is_before_plus_5}`);
    
    // 5. Testar a consulta que seria usada no scheduler
    console.log('\n5️⃣ Testando consulta do scheduler:');
    const schedulerResult = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.scheduled_at,
        c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' as scheduled_at_brasil,
        NOW() AT TIME ZONE 'America/Sao_Paulo' as current_time_brasil
      FROM campaigns c
      WHERE c.status = 'pending' 
        AND c.scheduled_at IS NOT NULL 
        AND c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' >= (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '5 minutes'
        AND c.scheduled_at AT TIME ZONE 'America/Sao_Paulo' <= (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '5 minutes'
      ORDER BY c.scheduled_at ASC
    `);
    
    console.log(`   Campanhas encontradas: ${schedulerResult.rows.length}`);
    for (const campaign of schedulerResult.rows) {
      console.log(`   - ${campaign.name} (ID: ${campaign.id})`);
      console.log(`     Agendada para: ${campaign.scheduled_at_brasil}`);
    }
    
    // 6. Limpar campanha de teste
    console.log('\n6️⃣ Limpando campanha de teste...');
    // Excluir registros relacionados primeiro (devido às foreign keys)
    await pool.query('DELETE FROM campaign_executions WHERE campaign_id = $1', [testCampaign.id]);
    await pool.query('DELETE FROM campaign_status WHERE campaign_id = $1', [testCampaign.id]);
    await pool.query('DELETE FROM campaign_contacts WHERE campaign_id = $1', [testCampaign.id]);
    await pool.query('DELETE FROM campaigns WHERE id = $1', [testCampaign.id]);
    console.log('   ✅ Campanha de teste removida');
    
    console.log('\n✅ Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  } finally {
    await pool.end();
  }
}

// Executar teste
testScheduling(); 