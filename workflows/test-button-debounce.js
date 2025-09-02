const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825',
  ssl: false
});

async function testButtonDebounce() {
  try {
    console.log('🧪 Testando sistema de debounce de botões...\n');

    const testContactId = '+553175012310';
    const testConversationId = 123;
    const testBlockId = 'bloco_14';
    const testButtonText = 'Presencial';

    // 1. Verificar se a tabela button_debounce existe
    console.log('1️⃣ Verificando se a tabela button_debounce existe:');
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'button_debounce'
        );
      `);
      
      if (tableCheck.rows[0].exists) {
        console.log('   ✅ Tabela button_debounce existe');
      } else {
        console.log('   ❌ Tabela button_debounce não existe');
        return;
      }
    } catch (error) {
      console.log('   ❌ Erro ao verificar tabela:', error.message);
      return;
    }

    // 2. Limpar registros de teste anteriores
    console.log('\n2️⃣ Limpando registros de teste anteriores:');
    await pool.query('DELETE FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log('   ✅ Registros de teste anteriores removidos');

    // 3. Testar primeira verificação (deve retornar false)
    console.log('\n3️⃣ Testando primeira verificação de debounce:');
    const isFirstProcessed = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isFirstProcessed ? '❌ Já processado' : '✅ Não processado (correto)'}`);

    // 4. Marcar botão como processado
    console.log('\n4️⃣ Marcando botão como processado:');
    await markButtonAsProcessed(testConversationId, testContactId, testBlockId, testButtonText);
    console.log('   ✅ Botão marcado como processado');

    // 5. Testar segunda verificação (deve retornar true)
    console.log('\n5️⃣ Testando segunda verificação de debounce:');
    const isSecondProcessed = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isSecondProcessed ? '✅ Já processado (correto)' : '❌ Não processado'}`);

    // 6. Testar com botão diferente (deve retornar false)
    console.log('\n6️⃣ Testando com botão diferente:');
    const isDifferentButtonProcessed = await isButtonRecentlyProcessed(testConversationId, testBlockId, 'Virtual');
    console.log(`   Resultado: ${isDifferentButtonProcessed ? '❌ Já processado' : '✅ Não processado (correto)'}`);

    // 7. Testar com bloco diferente (deve retornar false)
    console.log('\n7️⃣ Testando com bloco diferente:');
    const isDifferentBlockProcessed = await isButtonRecentlyProcessed(testConversationId, 'bloco_15', testButtonText);
    console.log(`   Resultado: ${isDifferentBlockProcessed ? '❌ Já processado' : '✅ Não processado (correto)'}`);

    // 8. Verificar registros na tabela
    console.log('\n8️⃣ Verificando registros na tabela:');
    const records = await pool.query('SELECT * FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log(`   Total de registros: ${records.rows.length}`);
    records.rows.forEach((record, index) => {
      console.log(`   Registro ${index + 1}: ${record.block_id} - "${record.button_text}" (${record.processed_at})`);
    });

    // 9. Testar limpeza de registros antigos
    console.log('\n9️⃣ Testando limpeza de registros antigos:');
    await cleanOldButtonDebounce();
    console.log('   ✅ Função de limpeza executada');

    // 10. Verificar se os registros ainda existem (devem existir pois são recentes)
    console.log('\n🔟 Verificando se registros ainda existem após limpeza:');
    const recordsAfterCleanup = await pool.query('SELECT * FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log(`   Total de registros após limpeza: ${recordsAfterCleanup.rows.length}`);

    // 11. Simular reset de conversa
    console.log('\n1️⃣1️⃣ Simulando reset de conversa:');
    await pool.query('DELETE FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log('   ✅ Registros de debounce removidos (simulando reset)');

    // 12. Verificar se o debounce foi limpo
    console.log('\n1️⃣2️⃣ Verificando se debounce foi limpo:');
    const isAfterReset = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isAfterReset ? '❌ Ainda processado' : '✅ Não processado (correto)'}`);

    console.log('\n✅ Teste do sistema de debounce concluído com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao testar sistema de debounce:', error);
  } finally {
    await pool.end();
  }
}

// Funções auxiliares (copiadas do sistema principal)
async function isButtonRecentlyProcessed(conversationId, blockId, buttonText) {
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
    
    // Se foi processado há menos de 5 segundos, considerar como recente
    return timeDiff < 5;
  } catch (error) {
    console.error('❌ Erro ao verificar debounce do botão:', error);
    return false; // Em caso de erro, permitir processamento
  }
}

async function markButtonAsProcessed(conversationId, contactId, blockId, buttonText) {
  try {
    await pool.query(`
      INSERT INTO button_debounce (conversation_id, contact_id, block_id, button_text) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (conversation_id, block_id, button_text) 
      DO UPDATE SET processed_at = CURRENT_TIMESTAMP
    `, [conversationId, contactId, blockId, buttonText]);
  } catch (error) {
    console.error('❌ Erro ao marcar botão como processado:', error);
  }
}

async function cleanOldButtonDebounce() {
  try {
    // Limpar registros de debounce de mais de 1 hora
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    const result = await pool.query(`
      DELETE FROM button_debounce 
      WHERE processed_at < $1
    `, [oneHourAgo]);
    
    if (result.rowCount > 0) {
      console.log(`   🧹 Limpeza de debounce: ${result.rowCount} registros antigos removidos`);
    } else {
      console.log('   ℹ️ Nenhum registro antigo encontrado para limpeza');
    }
  } catch (error) {
    console.error('❌ Erro ao limpar registros antigos de debounce:', error);
  }
}

// Executar teste
testButtonDebounce();
