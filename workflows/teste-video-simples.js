#!/usr/bin/env node

// Teste simples para envio de vídeo via multipart/form-data
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = '3';

async function testeVideoMultipart() {
  console.log('🎬 TESTE - ENVIO DE VÍDEO VIA MULTIPART/FORM-DATA\n');
  
  try {
    // ID do vídeo que sabemos que existe
    const videoId = '1752608369518';
    const publicUrl = 'https://workflows.inovaianalytics.com.br/public-preview/' + videoId;
    const tempVideoPath = path.join(__dirname, `temp_video_${videoId}.mp4`);
    
    console.log(`🔗 URL do vídeo: ${publicUrl}`);
    console.log(`📁 Arquivo temporário: ${tempVideoPath}\n`);
    
    // 1. Verificar se URL está acessível
    console.log('🔍 1. Verificando se URL está acessível...');
    try {
      const headResponse = await axios.head(publicUrl);
      console.log(`✅ URL acessível! Status: ${headResponse.status}`);
      console.log(`📹 Tipo: ${headResponse.headers['content-type']}`);
      console.log(`📏 Tamanho: ${(headResponse.headers['content-length'] / 1024 / 1024).toFixed(2)}MB\n`);
    } catch (urlError) {
      console.error(`❌ URL não acessível: ${urlError.message}`);
      return;
    }
    
    // 2. Baixar o vídeo para arquivo temporário
    console.log('⬇️ 2. Baixando vídeo...');
    const downloadResponse = await axios.get(publicUrl, {
      responseType: 'stream',
      timeout: 30000 // 30 segundos timeout
    });
    
    const writer = fs.createWriteStream(tempVideoPath);
    downloadResponse.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    const fileStats = fs.statSync(tempVideoPath);
    console.log(`✅ Vídeo baixado: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB\n`);
    
    // 3. Buscar conversa ativa para teste
    console.log('💬 3. Buscando conversas ativas...');
    const conversationsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { status: 'open' }
    });
    
    const conversations = conversationsResponse.data.data.payload || [];
    console.log(`📊 Conversas encontradas: ${conversations.length}`);
    
    if (conversations.length === 0) {
      console.log('⚠️ Nenhuma conversa ativa encontrada!');
      console.log('💡 Para testar:');
      console.log('   1. Abra o WhatsApp');
      console.log('   2. Envie uma mensagem para o número do Chatwoot');
      console.log('   3. Execute este teste novamente\n');
      return;
    }
    
    const conversation = conversations[0];
    console.log(`🎯 Usando conversa: ${conversation.id} (${conversation.meta?.sender?.phone_number})\n`);
    
    // 4. Criar FormData com multipart/form-data
    console.log('📤 4. Criando FormData multipart...');
    const formData = new FormData();
    
    // Adicionar arquivo
    formData.append('attachments[]', fs.createReadStream(tempVideoPath), {
      filename: 'VID_20250715_155306.mp4',
      contentType: 'video/mp4'
    });
    
    // Adicionar conteúdo da mensagem
    formData.append('content', '🎬 Vídeo de teste enviado via multipart/form-data!');
    formData.append('message_type', 'outgoing');
    
    console.log('📋 FormData criado:');
    console.log(`   - Arquivo: VID_20250715_155306.mp4 (${(fileStats.size / 1024 / 1024).toFixed(2)}MB)`);
    console.log(`   - Content-Type: video/mp4`);
    console.log(`   - Boundary: ${formData.getBoundary()}`);
    console.log();
    
    // 5. Enviar com multipart/form-data
    console.log('🚀 5. Enviando vídeo via multipart/form-data...');
    console.log(`📡 Content-Type: multipart/form-data; boundary=${formData.getBoundary()}\n`);
    
    const messageResponse = await axios.post(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
      formData,
      {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          ...formData.getHeaders(), // Inclui Content-Type com boundary
        },
        timeout: 60000 // 60 segundos para upload
      }
    );
    
    console.log(`✅ Vídeo enviado com sucesso! Status: ${messageResponse.status}`);
    console.log(`📝 Mensagem ID: ${messageResponse.data.id || 'N/A'}`);
    console.log(`🔄 Response:`, messageResponse.data);
    console.log();
    
    // 6. Limpar arquivo temporário
    console.log('🧹 6. Limpando arquivo temporário...');
    fs.unlinkSync(tempVideoPath);
    console.log('✅ Arquivo temporário removido\n');
    
    // Instruções finais
    console.log('🎉 TESTE CONCLUÍDO!');
    console.log();
    console.log('📱 VERIFIQUE NO WHATSAPP/CHATWOOT:');
    console.log('   ✅ Deve aparecer o vídeo como anexo');
    console.log('   ✅ Com preview/thumbnail');
    console.log('   ✅ Sem erro 131053');
    console.log('   ✅ Formato correto multipart/form-data');
    console.log();
    console.log('🔍 Se apareceu erro 131053:');
    console.log('   - O Chatwoot ainda não consegue acessar arquivos locais');
    console.log('   - Precisaremos usar a solução de URL pública');
    console.log();
    console.log('✅ Se funcionou:');
    console.log('   - O problema estava no formato, não no acesso');
    console.log('   - Podemos usar multipart/form-data diretamente');
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.response?.data || error.message);
    
    // Limpar arquivo temporário em caso de erro
    const tempVideoPath = path.join(__dirname, `temp_video_1752608369518.mp4`);
    if (fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
      console.log('🧹 Arquivo temporário removido após erro');
    }
    
    if (error.response?.status === 401) {
      console.log('\n🔑 Erro de autenticação - verifique CHATWOOT_API_TOKEN');
    } else if (error.response?.status === 404) {
      console.log('\n📁 Conversa ou recurso não encontrado');
    } else if (error.response?.status === 422) {
      console.log('\n📋 Erro de validação - verifique formato do payload');
    } else if (error.response?.status === 413) {
      console.log('\n📏 Arquivo muito grande - limite do servidor');
    } else if (error.code === 'ECONNABORTED') {
      console.log('\n⏰ Timeout - arquivo muito grande ou conexão lenta');
    }
  }
}

// Verificar se token está configurado
if (!CHATWOOT_API_TOKEN) {
  console.error('❌ CHATWOOT_API_TOKEN não está configurado!');
  console.log('💡 Configure em /root/chatwoot/.env ou como variável de ambiente');
  process.exit(1);
}

testeVideoMultipart(); 