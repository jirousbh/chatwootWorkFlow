const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configurações
const BASE_URL = 'http://localhost:3008';
let authToken = null;

async function testAttachmentWorkflow() {
  console.log('🎬 TESTE COMPLETO DE ANEXOS EM WORKFLOWS\n');
  
  try {
    // 1. Fazer login
    console.log('🔐 1. Fazendo login...');
    const loginResponse = await axios.post(`${BASE_URL}/api/login`, {
      username: 'admin',
      password: '123456'
    });
    
    authToken = loginResponse.data.token;
    console.log('✅ Login realizado com sucesso!\n');
    
    // 2. Criar arquivo de teste
    console.log('📁 2. Criando arquivo de teste...');
    const testVideoContent = 'Este é um arquivo de vídeo de teste para demonstração';
    const testFilePath = path.join(__dirname, 'test_video.mp4');
    fs.writeFileSync(testFilePath, testVideoContent);
    console.log(`✅ Arquivo criado: ${testFilePath}\n`);
    
    // 3. Fazer upload do arquivo
    console.log('⬆️ 3. Fazendo upload do arquivo...');
    const formData = new FormData();
    formData.append('media', fs.createReadStream(testFilePath), {
      filename: 'video_demo.mp4',
      contentType: 'video/mp4'
    });
    
    const uploadResponse = await axios.post(`${BASE_URL}/api/upload-media`, formData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...formData.getHeaders()
      }
    });
    
    const uploadedFile = uploadResponse.data.file;
    console.log('✅ Upload realizado com sucesso!');
    console.log(`📄 Arquivo ID: ${uploadedFile.id}`);
    console.log(`📄 Nome: ${uploadedFile.originalname}`);
    console.log(`📄 Tamanho: ${uploadedFile.size} bytes\n`);
    
    // 4. Listar arquivos carregados
    console.log('📋 4. Listando arquivos carregados...');
    const filesResponse = await axios.get(`${BASE_URL}/api/media-files`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log(`✅ ${filesResponse.data.files.length} arquivo(s) encontrado(s):`);
    filesResponse.data.files.forEach(file => {
      console.log(`  - ${file.original_name} (ID: ${file.id})`);
    });
    console.log();
    
    // 5. Criar workflow com anexo
    console.log('⚙️ 5. Criando workflow com anexo...');
    const workflowWithAttachment = {
      name: 'teste_anexo_workflow',
      config: {
        blocks: {
          bloco_1: {
            id: 'bloco_1',
            name: 'Início com Vídeo',
            message: 'Olá! Aqui está um vídeo explicativo para você:',
            media: {
              attachment: {
                file_id: uploadedFile.id
              }
            },
            buttons: [
              { text: 'Entendi!', next_block: 'bloco_2' },
              { text: 'Mais info', next_block: 'bloco_info' }
            ]
          },
          bloco_2: {
            id: 'bloco_2',
            name: 'Confirmação',
            message: 'Ótimo! Você recebeu o vídeo. Como posso ajudar mais?',
            buttons: [
              { text: 'Outro vídeo', next_block: 'bloco_1' },
              { text: 'Finalizar', next_block: 'fim' }
            ]
          },
          bloco_info: {
            id: 'bloco_info',
            name: 'Mais Informações',
            message: 'Este é um sistema de anexos diretos que permite enviar arquivos de mídia diretamente pelo Chatwoot!',
            next_block: 'bloco_2'
          },
          fim: {
            id: 'fim',
            name: 'Finalização',
            message: 'Obrigado por testar o sistema de anexos! 🎉'
          }
        }
      }
    };
    
    // Salvar workflow
    const workflowResponse = await axios.post(`${BASE_URL}/api/workflows`, workflowWithAttachment, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Workflow criado com sucesso!');
    console.log(`🔄 Nome: ${workflowWithAttachment.name}\n`);
    
    // 6. Simular início de conversa (se tivermos conversation_id)
    console.log('💬 6. Testando envio direto de anexo...');
    
    // Para este teste, vamos usar a API de teste de anexo
    try {
      const testResponse = await axios.post(`${BASE_URL}/api/test-attachment`, {
        conversationId: 1, // Usar ID de conversa existente
        message: 'Teste de anexo direto via API',
        fileId: uploadedFile.id
      }, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Teste de anexo realizado com sucesso!');
      console.log('📤 Verifique no Chatwoot se o arquivo foi enviado.\n');
      
    } catch (testError) {
      console.log('⚠️ Teste de anexo falhou (normal se não houver conversa ativa):');
      console.log(`   ${testError.response?.data?.error || testError.message}\n`);
    }
    
    // 7. Demonstrar estrutura de workflow
    console.log('📖 7. Exemplo de uso no workflow:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Para usar anexos diretos, adicione ao seu bloco:');
    console.log();
    console.log(JSON.stringify({
      'id': 'exemplo',
      'message': 'Aqui está o arquivo:',
      'media': {
        'attachment': {
          'file_id': uploadedFile.id
        }
      },
      'buttons': [
        { 'text': 'Entendi', 'next_block': 'proximo' }
      ]
    }, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 8. Comandos úteis
    console.log('🔧 8. Comandos úteis:');
    console.log();
    console.log('Upload de arquivo:');
    console.log(`curl -X POST -H "Authorization: Bearer ${authToken}" -F "media=@arquivo.mp4" ${BASE_URL}/api/upload-media`);
    console.log();
    console.log('Listar arquivos:');
    console.log(`curl -H "Authorization: Bearer ${authToken}" ${BASE_URL}/api/media-files`);
    console.log();
    console.log('Deletar arquivo:');
    console.log(`curl -X DELETE -H "Authorization: Bearer ${authToken}" ${BASE_URL}/api/media-files/${uploadedFile.id}`);
    console.log();
    
    // 9. Limpeza (opcional)
    console.log('🧹 9. Limpeza...');
    
    // Remover arquivo de teste local
    fs.unlinkSync(testFilePath);
    console.log('✅ Arquivo de teste local removido');
    
    // Opcionalmente remover do sistema (descomente se quiser)
    /*
    await axios.delete(`${BASE_URL}/api/media-files/${uploadedFile.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log('✅ Arquivo removido do sistema');
    */
    
    console.log();
    console.log('🎉 TESTE COMPLETO FINALIZADO!');
    console.log('📱 Agora você pode usar anexos diretos nos seus workflows!');
    console.log('📚 Veja ANEXOS_DOCUMENTACAO.md para mais detalhes.');
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔑 Problema de autenticação - verifique credenciais');
    } else if (error.response?.status === 413) {
      console.log('\n📏 Arquivo muito grande - máximo 16MB');
    }
  }
}

// Executar teste
if (require.main === module) {
  testAttachmentWorkflow();
}

module.exports = { testAttachmentWorkflow }; 