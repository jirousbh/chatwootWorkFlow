const { Pool } = require('pg');

console.log('🔍 Testando conexão com o banco de dados...');

// Configuração do banco de dados
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825',
  ssl: false
});

async function testConnection() {
  try {
    console.log('📡 Tentando conectar...');
    const client = await pool.connect();
    console.log('✅ Conexão estabelecida com sucesso!');
    
    const result = await client.query('SELECT current_database(), current_user, version()');
    console.log('📊 Informações da conexão:');
    console.log('   Database:', result.rows[0].current_database);
    console.log('   User:', result.rows[0].current_user);
    console.log('   Version:', result.rows[0].version.split(' ')[0]);
    
    // Verificar se a tabela button_debounce existe
    console.log('\n🔍 Verificando tabela button_debounce...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'button_debounce'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('   ✅ Tabela button_debounce existe');
      
      // Verificar estrutura da tabela
      const structure = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'button_debounce'
        ORDER BY ordinal_position;
      `);
      
      console.log('   📋 Estrutura da tabela:');
      structure.rows.forEach(row => {
        console.log(`      ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
      
      // Verificar índices
      const indexes = await client.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'button_debounce';
      `);
      
      console.log('   🔗 Índices criados:');
      indexes.rows.forEach(row => {
        console.log(`      ${row.indexname}`);
      });
      
    } else {
      console.log('   ❌ Tabela button_debounce não existe');
    }
    
    client.release();
    await pool.end();
    console.log('\n✅ Teste de conexão concluído com sucesso!');
  } catch (error) {
    console.error('❌ Erro na conexão:', error.message);
    console.error('   Detalhes:', error);
  }
}

testConnection();
