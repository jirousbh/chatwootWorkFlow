const bcrypt = require('bcryptjs');

const storedHash = '$2a$10$KwkB6fmVAxcR7TA5o2p4tO.qWqZ5ZU1odp5i03wuM/sgw8eBgNJ2u';

const passwords = ['admin123', 'admin', '123456', 'password', 'chatwoot'];

console.log('🧪 Testando senhas contra o hash armazenado...\n');

passwords.forEach(async (password) => {
  try {
    const match = await bcrypt.compare(password, storedHash);
    console.log(`Password "${password}": ${match ? '✅ VÁLIDA' : '❌ Inválida'}`);
    
    if (match) {
      console.log(`🎉 SENHA ENCONTRADA: "${password}"`);
    }
  } catch (error) {
    console.log(`❌ Erro testando "${password}":`, error.message);
  }
});

// Esperar um pouco para todas as comparações assíncronas terminarem
setTimeout(() => {
  console.log('\n✅ Teste concluído!');
}, 1000); 