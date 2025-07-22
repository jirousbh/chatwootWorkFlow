const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Configuração do PostgreSQL
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825',
});

async function resetAdminPassword() {
  try {
    console.log('🔒 Resetando senha do usuário admin...');
    
    // Pegar nova senha dos argumentos da linha de comando ou usar padrão
    const newPassword = process.argv[2] || 'admin123';
    
    console.log(`🔐 Definindo nova senha: ${newPassword}`);
    
    // Criar novo hash para a senha
    const newHash = await bcrypt.hash(newPassword, 10);
    
    console.log(`🔐 Novo hash gerado: ${newHash}`);
    
    // Atualizar no banco de dados
    const result = await pool.query(
      'UPDATE system_users SET password_hash = $1 WHERE username = $2',
      [newHash, 'admin']
    );
    
    if (result.rowCount > 0) {
      console.log('✅ Senha do admin resetada com sucesso!');
      console.log(`📝 Nova senha: ${newPassword}`);
    } else {
      console.log('❌ Usuário admin não encontrado!');
    }
    
    // Verificar se a nova senha funciona
    console.log('\n🧪 Testando nova senha...');
    const testResult = await bcrypt.compare(newPassword, newHash);
    console.log(`🔍 Teste de verificação: ${testResult ? '✅ SUCESSO' : '❌ FALHOU'}`);
    
  } catch (error) {
    console.error('❌ Erro ao resetar senha:', error);
  } finally {
    await pool.end();
  }
}

resetAdminPassword(); 