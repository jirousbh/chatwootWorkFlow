const { Pool } = require('pg');

console.log('🧪 Teste de Navegação Múltipla e Volta...\n');

// Configuração do banco de dados
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825',
  ssl: false
});

async function testeNavegacaoMultipla() {
  try {
    const client = await pool.connect();
    console.log('✅ Conectado ao banco\n');

    const testContactId = '+553175012310';
    const testConversationId = 888;

    // 1. Limpar registros anteriores
    console.log('1️⃣ Limpando registros anteriores...');
    await client.query('DELETE FROM button_debounce WHERE contact_id = $1', [testContactId]);
    console.log('   ✅ Limpo\n');

    // 2. Simular navegação: bloco_14 → bloco_15 → bloco_16
    console.log('2️⃣ Simulando navegação: bloco_14 → bloco_15 → bloco_16');
    
    // Navegar para bloco_15 (deve resetar bloco_14)
    console.log('   📍 Navegando para bloco_15...');
    await resetButtonDebounceForBlock(testConversationId, 'bloco_15');
    
    // Navegar para bloco_16 (deve resetar bloco_15)
    console.log('   📍 Navegando para bloco_16...');
    await resetButtonDebounceForBlock(testConversationId, 'bloco_16');
    
    console.log('   ✅ Navegação simulada\n');

    // 3. Verificar se botões dos blocos anteriores podem ser usados
    console.log('3️⃣ Verificando se botões dos blocos anteriores podem ser usados:');
    
    // Testar botão do bloco_14
    const botaoBloco14 = await verificarDebounce(testConversationId, 'bloco_14', 'Presencial');
    console.log(`   Botão "Presencial" do bloco_14: ${botaoBloco14 ? '❌ Bloqueado' : '✅ Permitido'}`);
    
    // Testar botão do bloco_15
    const botaoBloco15 = await verificarDebounce(testConversationId, 'bloco_15', 'Virtual');
    console.log(`   Botão "Virtual" do bloco_15: ${botaoBloco15 ? '❌ Bloqueado' : '✅ Permitido'}`);
    
    // Testar botão do bloco_16 (atual)
    const botaoBloco16 = await verificarDebounce(testConversationId, 'bloco_16', 'Continuar');
    console.log(`   Botão "Continuar" do bloco_16: ${botaoBloco16 ? '❌ Bloqueado' : '✅ Permitido'}`);

    // 4. Simular uso de botões nos blocos anteriores
    console.log('\n4️⃣ Simulando uso de botões nos blocos anteriores:');
    
    // Usar botão do bloco_14
    await client.query(`
      INSERT INTO button_debounce (conversation_id, contact_id, block_id, button_text) 
      VALUES ($1, $2, $3, $4)
    `, [testConversationId, testContactId, 'bloco_14', 'Presencial']);
    console.log('   ✅ Botão "Presencial" do bloco_14 usado');
    
    // Usar botão do bloco_15
    await client.query(`
      INSERT INTO button_debounce (conversation_id, contact_id, block_id, button_text) 
      VALUES ($1, $2, $3, $4)
    `, [testConversationId, testContactId, 'bloco_15', 'Virtual']);
    console.log('   ✅ Botão "Virtual" do bloco_15 usado');

    // 5. Verificar se os botões agora estão bloqueados
    console.log('\n5️⃣ Verificando se os botões agora estão bloqueados:');
    
    const botaoBloco14Usado = await verificarDebounce(testConversationId, 'bloco_14', 'Presencial');
    console.log(`   Botão "Presencial" do bloco_14: ${botaoBloco14Usado ? '✅ Bloqueado (correto)' : '❌ Permitido (erro)'}`);
    
    const botaoBloco15Usado = await verificarDebounce(testConversationId, 'bloco_15', 'Virtual');
    console.log(`   Botão "Virtual" do bloco_15: ${botaoBloco15Usado ? '✅ Bloqueado (correto)' : '❌ Permitido (erro)'}`);

    // 6. Simular volta para bloco_14
    console.log('\n6️⃣ Simulando volta para bloco_14:');
    await resetButtonDebounceForBlock(testConversationId, 'bloco_14');
    
    // Verificar se o botão do bloco_14 pode ser usado novamente
    const botaoBloco14Volta = await verificarDebounce(testConversationId, 'bloco_14', 'Presencial');
    console.log(`   Botão "Presencial" do bloco_14 após volta: ${botaoBloco14Volta ? '❌ Bloqueado' : '✅ Permitido (correto - reset funcionou)'}`);

    // 7. Verificar registros finais
    console.log('\n7️⃣ Verificando registros finais na tabela:');
    const records = await client.query('SELECT * FROM button_debounce WHERE contact_id = $1 ORDER BY block_id', [testContactId]);
    records.rows.forEach((record, index) => {
      const timeAgo = Math.round((new Date() - record.processed_at) / 1000 / 60);
      console.log(`   Registro ${index + 1}: ${record.block_id} - "${record.button_text}" (há ${timeAgo} minutos)`);
    });

    client.release();
    await pool.end();
    console.log('\n✅ Teste de navegação múltipla concluído!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
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

async function resetButtonDebounceForBlock(conversationId, newBlockId) {
  try {
    // Simular que estamos navegando de um bloco para outro
    // No teste, vamos assumir que o bloco anterior é diferente
    
    console.log(`   🔄 Resetando debounce para navegação para ${newBlockId}`);
    
    // Resetar debounce de todos os blocos que podem ser acessados de volta
    const result = await pool.query(`
      UPDATE button_debounce 
      SET processed_at = processed_at - INTERVAL '10 minutes'
      WHERE conversation_id = $1 
      AND block_id != $2 
      AND processed_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `, [conversationId, newBlockId]);
    
    if (result.rowCount > 0) {
      console.log(`   ✅ Debounce resetado para ${result.rowCount} blocos anteriores`);
    } else {
      console.log(`   ℹ️ Nenhum bloco anterior para resetar`);
    }
  } catch (error) {
    console.error('❌ Erro ao resetar debounce:', error.message);
  }
}

testeNavegacaoMultipla();
