const { Pool } = require('pg');

console.log('🧪 Teste Simples do Sistema de Debounce Inteligente...\n');

// Configuração do banco de dados
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825',
  ssl: false
});

async function testeSimples() {
  try {
    const client = await pool.connect();
    console.log('✅ Conectado ao banco\n');

    const testContactId = '+553175012310';
    const testConversationId = 999;
    const testBlockId = 'bloco_teste';
    const testButtonText = 'Botão Teste';

    // 1. Limpar registros anteriores
    console.log('1️⃣ Limpando registros anteriores...');
    await client.query('DELETE FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log('   ✅ Limpo\n');

    // 2. Testar botão não processado
    console.log('2️⃣ Testando botão não processado:');
    const resultado1 = await verificarDebounce(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${resultado1 ? '❌ Bloqueado' : '✅ Permitido'}\n`);

    // 3. Marcar botão como processado
    console.log('3️⃣ Marcando botão como processado...');
    await client.query(`
      INSERT INTO button_debounce (conversation_id, contact_id, block_id, button_text) 
      VALUES ($1, $2, $3, $4)
    `, [testConversationId, testContactId, testBlockId, testButtonText]);
    console.log('   ✅ Marcado\n');

    // 4. Testar botão recém processado (deve estar bloqueado)
    console.log('4️⃣ Testando botão recém processado:');
    const resultado2 = await verificarDebounce(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${resultado2 ? '✅ Bloqueado (correto)' : '❌ Permitido (erro)'}\n`);

    // 5. Simular avanço de tempo (6 minutos)
    console.log('5️⃣ Simulando avanço de tempo (6 minutos)...');
    await client.query(`
      UPDATE button_debounce 
      SET processed_at = processed_at - INTERVAL '6 minutes'
      WHERE conversation_id = $1 AND block_id = $2 AND button_text = $3
    `, [testConversationId, testBlockId, testButtonText]);
    console.log('   ✅ Tempo avançado\n');

    // 6. Testar botão após tempo (deve permitir reutilização)
    console.log('6️⃣ Testando botão após tempo:');
    const resultado3 = await verificarDebounce(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${resultado3 ? '❌ Bloqueado' : '✅ Permitido (correto - tempo permitiu reutilização)'}\n`);

    // 7. Verificar registros
    console.log('7️⃣ Verificando registros na tabela:');
    const records = await client.query('SELECT * FROM button_debounce WHERE contact_id = $1', [testContactId]);
    records.rows.forEach((record, index) => {
      const timeAgo = Math.round((new Date() - record.processed_at) / 1000 / 60);
      console.log(`   Registro ${index + 1}: ${record.block_id} - "${record.button_text}" (há ${timeAgo} minutos)`);
    });

    client.release();
    await pool.end();
    console.log('\n✅ Teste simples concluído!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

async function verificarDebounce(conversationId, blockId, buttonText) {
  try {
    const result = await pool.query(`
      SELECT processed_at 
      FROM button_debounce 
      WHERE conversation_id = $1 AND block_id = $2 AND button_text = $3
    `, [conversationId, blockId, buttonText]);
    
    if (result.rows.length === 0) {
      return false; // Botão nunca foi processado
    }
    
    const processedAt = result.rows[0].processed_at;
    const now = new Date();
    const timeDiff = (now - processedAt) / 1000; // Diferença em segundos
    
    // Lógica de debounce inteligente
    if (timeDiff < 5) {
      return true; // Bloquear (muito recente)
    } else if (timeDiff > 300) { // 5 minutos
      return false; // Permitir reutilização
    } else {
      return true; // Manter bloqueio
    }
  } catch (error) {
    console.error('❌ Erro ao verificar debounce:', error.message);
    return false;
  }
}

testeSimples();
