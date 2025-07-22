#!/usr/bin/env node

const axios = require('axios');

// Configurações
const BASE_URL = 'http://localhost:3001';
let authToken = null;

async function testUrlAttachment() {
  console.log('🌐 TESTE DE ANEXO VIA URL PÚBLICA\n');
  
  try {
    // 1. Fazer login
    console.log('🔐 1. Fazendo login...');
    const loginResponse = await axios.post(`${BASE_URL}/api/login`, {
      username: 'admin',
      password: '123456'
    });
    
    authToken = loginResponse.data.token;
    console.log('✅ Login realizado com sucesso!\n');
    
    // 2. Listar arquivos disponíveis
    console.log('📋 2. Listando arquivos disponíveis...');
    const filesResponse = await axios.get(`${BASE_URL}/api/media-files`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const files = filesResponse.data.files;
    if (files.length === 0) {
      console.log('❌ Nenhum arquivo encontrado! Faça upload de um arquivo primeiro.');
      return;
    }
    
    const testFile = files[0]; // Usar o primeiro arquivo
    console.log(`✅ Arquivo selecionado: ${testFile.original_name} (ID: ${testFile.id})\n`);
    
    // 3. Testar rota pública diretamente
    console.log('🔗 3. Testando rota pública...');
    const publicUrl = `${BASE_URL}/public-preview/${testFile.id}`;
    console.log(`   URL: ${publicUrl}`);
    
    try {
      const headResponse = await axios.head(publicUrl);
      console.log(`✅ Rota pública acessível! Status: ${headResponse.status}`);
      console.log(`   Content-Type: ${headResponse.headers['content-type']}`);
      console.log(`   Content-Length: ${headResponse.headers['content-length']} bytes\n`);
    } catch (publicError) {
      console.error(`❌ Erro ao acessar rota pública: ${publicError.message}\n`);
      return;
    }
    
    // 4. Simular envio via workflow (se tivermos conversa ativa)
    console.log('💬 4. Testando envio via workflow...');
    
    // Criar workflow de teste com anexo
    const testWorkflow = {
      name: 'teste_url_anexo',
      config: {
        blocks: {
          start: {
            id: 'start',
            name: 'Teste URL Anexo',
            message: 'Aqui está o arquivo via URL pública:',
            media: {
              attachment: {
                file_id: testFile.id
              }
            },
            buttons: [
              { text: 'OK!', next_block: 'end' }
            ]
          },
          end: {
            id: 'end',
            name: 'Fim',
            message: 'Teste concluído!'
          }
        }
      }
    };
    
    // Salvar workflow temporário
    await axios.post(`${BASE_URL}/api/workflows`, testWorkflow, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Workflow de teste criado com sucesso!');
    console.log(`📁 Arquivo configurado: ${testFile.original_name}`);
    console.log(`🌐 URL pública configurada: ${publicUrl}\n`);
    
    // 5. Informações de debug
    console.log('🔧 5. Informações para debug:');
    console.log(`   - ID do arquivo: ${testFile.id}`);
    console.log(`   - Nome: ${testFile.original_name}`);
    console.log(`   - Tipo: ${testFile.mimetype}`);
    console.log(`   - URL pública: ${publicUrl}`);
    console.log(`   - Path no sistema: ${testFile.file_path}\n`);
    
    // 6. Verificar logs do sistema
    console.log('📋 6. Para verificar se funcionou:');
    console.log(`   1. Execute: docker logs --tail 50 chatwoot-chatbot-workflows-1`);
    console.log(`   2. Procure por: "Enviando via URL pública"`);
    console.log(`   3. Ou execute: grep "URL pública" /data/workflows-logs/*.log`);
    console.log(`   4. Teste no Chatwoot iniciando conversa com: "start"\n`);
    
    console.log('🎉 TESTE CONCLUÍDO!');
    console.log('📱 Agora teste enviando "start" em uma conversa no Chatwoot.');
    console.log('🔍 O sistema deve enviar um card com a mídia via URL pública.');
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔑 Problema de autenticação - verifique credenciais');
    } else if (error.response?.status === 404) {
      console.log('\n📁 Arquivo ou rota não encontrada');
    }
  }
}

testUrlAttachment(); 