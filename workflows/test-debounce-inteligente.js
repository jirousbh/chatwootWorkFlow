const { Pool } = require('pg');

console.log('🧪 Testando sistema de debounce inteligente...');

// Configuração do banco de dados
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825',
  ssl: false
});

async function testDebounceInteligente() {
  try {
    console.log('📡 Conectando ao banco...');
    const client = await pool.connect();
    console.log('✅ Conectado com sucesso!\n');

    const testContactId = '+553175012310';
    const testConversationId = 123;
    const testBlockId = 'bloco_14';
    const testButtonText = 'Presencial';

    // 1. Limpar registros de teste anteriores
    console.log('1️⃣ Limpando registros de teste anteriores...');
    await client.query('DELETE FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log('   ✅ Registros de teste anteriores removidos\n');

    // 2. Testar primeira verificação (deve retornar false)
    console.log('2️⃣ Testando primeira verificação de debounce:');
    const isFirstProcessed = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isFirstProcessed ? '❌ Já processado' : '✅ Não processado (correto)'}\n`);

    // 3. Marcar botão como processado
    console.log('3️⃣ Marcando botão como processado:');
    await markButtonAsProcessed(testConversationId, testContactId, testBlockId, testButtonText);
    console.log('   ✅ Botão marcado como processado\n');

    // 4. Testar segunda verificação (deve retornar true - bloqueado)
    console.log('4️⃣ Testando segunda verificação de debounce (deve estar bloqueado):');
    const isSecondProcessed = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isSecondProcessed ? '✅ Já processado (correto - bloqueado)' : '❌ Não processado (erro)'}\n`);

    // 5. Simular navegação para bloco diferente (reset de debounce)
    console.log('5️⃣ Simulando navegação para bloco diferente (reset de debounce):');
    await resetButtonDebounceForBlock(testConversationId, 'bloco_15');
    console.log('   ✅ Reset de debounce executado\n');

    // 6. Verificar se o debounce foi resetado
    console.log('6️⃣ Verificando se o debounce foi resetado:');
    const isAfterReset = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isAfterReset ? '❌ Ainda processado' : '✅ Não processado (correto - reset funcionou)'}\n`);

    // 7. Testar com tempo avançado (simular 10 minutos)
    console.log('7️⃣ Simulando avanço de tempo (10 minutos):');
    await client.query(`
      UPDATE button_debounce 
      SET processed_at = processed_at - INTERVAL '10 minutes'
      WHERE conversation_id = $1 AND block_id = $2 AND button_text = $3
    `, [testConversationId, testBlockId, testButtonText]);
    console.log('   ✅ Tempo avançado em 10 minutos\n');

    // 8. Verificar se o debounce permite reutilização após tempo
    console.log('8️⃣ Verificando se debounce permite reutilização após tempo:');
    const isAfterTime = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isAfterTime ? '❌ Ainda processado' : '✅ Não processado (correto - tempo permitiu reutilização)'}\n`);

    // 9. Verificar registros na tabela
    console.log('9️⃣ Verificando registros na tabela:');
    const records = await client.query('SELECT * FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log(`   Total de registros: ${records.rows.length}`);
    records.rows.forEach((record, index) => {
      const timeAgo = Math.round((new Date() - record.processed_at) / 1000 / 60);
      console.log(`   Registro ${index + 1}: ${record.block_id} - "${record.button_text}" (há ${timeAgo} minutos)`);
    });

    // 10. Testar reset completo de conversa
    console.log('\n🔟 Testando reset completo de conversa:');
    await client.query('DELETE FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log('   ✅ Registros de debounce removidos (simulando reset)');

    const isAfterCompleteReset = await isButtonRecentlyProcessed(testConversationId, testBlockId, testButtonText);
    console.log(`   Resultado: ${isAfterCompleteReset ? '❌ Ainda processado' : '✅ Não processado (correto - reset completo funcionou)'}`);

    client.release();
    await pool.end();
    console.log('\n✅ Teste do sistema de debounce inteligente concluído com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao testar sistema de debounce inteligente:', error);
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
    
    // ===== DEBOUNCE INTELIGENTE =====
    // Se foi processado há menos de 5 segundos, considerar como recente
    // Mas se passou mais de 5 minutos, permitir reutilização (usuário pode ter voltado ao bloco)
    if (timeDiff < 5) {
      return true; // Clique muito recente - bloquear
    } else if (timeDiff > 300) { // 5 minutos = 300 segundos
      console.log(`   🔄 Botão "${buttonText}" foi processado há ${Math.round(timeDiff/60)} minutos. Permitindo reutilização.`);
      return false; // Permitir reutilização após tempo significativo
    } else {
      return true; // Entre 5 segundos e 5 minutos - manter bloqueio
    }
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

async function resetButtonDebounceForBlock(conversationId, newBlockId) {
  try {
    // Buscar o bloco atual da conversa
    const currentBlockResult = await pool.query(`
      SELECT current_block 
      FROM workflow_conversations 
      WHERE conversation_id = $1
    `, [conversationId]);
    
    if (currentBlockResult.rows.length === 0) {
      return; // Conversa não encontrada
    }
    
    const currentBlock = currentBlockResult.rows[0].current_block;
    
    // Se o usuário está navegando para um bloco diferente, resetar debounce do bloco anterior
    if (currentBlock && currentBlock !== newBlockId) {
      console.log(`   🔄 Usuário navegando de bloco ${currentBlock} para ${newBlockId}. Resetando debounce do bloco anterior.`);
      
      // Resetar debounce apenas do bloco anterior (não de todos os botões)
      await pool.query(`
        UPDATE button_debounce 
        SET processed_at = processed_at - INTERVAL '10 minutes'
        WHERE conversation_id = $1 AND block_id = $2
      `, [conversationId, currentBlock]);
      
      console.log(`   ✅ Debounce resetado para bloco ${currentBlock}`);
    }
  } catch (error) {
    console.error('❌ Erro ao resetar debounce do bloco:', error);
  }
}

// Executar teste
testDebounceInteligente();
