const axios = require('axios');
require('dotenv').config();

// Configurações
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

async function testWhatsAppOfficialAPI() {
    console.log('🔍 Testando integração com API oficial do WhatsApp...\n');
    
    // 1. Verificar configurações
    console.log('1. Verificando configurações...');
    console.log(`📋 Business Account ID: ${WHATSAPP_BUSINESS_ACCOUNT_ID ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`🔑 API Token: ${WHATSAPP_API_TOKEN ? '✅ Configurado' : '❌ Não configurado'}`);
    
    if (!WHATSAPP_BUSINESS_ACCOUNT_ID || !WHATSAPP_API_TOKEN) {
        console.log('\n❌ Configurações incompletas. Configure WHATSAPP_BUSINESS_ACCOUNT_ID e WHATSAPP_API_TOKEN no arquivo .env');
        return;
    }
    
    try {
        // 2. Teste direto da API oficial do WhatsApp
        console.log('\n2. Testando API oficial do WhatsApp diretamente...');
        
        const whatsappResponse = await axios.get(
            `https://graph.facebook.com/v23.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
            {
                headers: { 'Authorization': `Bearer ${WHATSAPP_API_TOKEN}` },
                params: { 
                    fields: 'name,status,category,language,components',
                    limit: 10 
                }
            }
        );
        
        if (whatsappResponse.data?.data) {
            const allTemplates = whatsappResponse.data.data;
            const approvedTemplates = allTemplates.filter(t => t.status === 'APPROVED');
            
            console.log(`✅ API oficial funcionando!`);
            console.log(`📊 Total de templates: ${allTemplates.length}`);
            console.log(`✅ Templates aprovados: ${approvedTemplates.length}`);
            
            if (approvedTemplates.length > 0) {
                console.log('\n📋 Primeiros templates aprovados:');
                approvedTemplates.slice(0, 3).forEach((template, index) => {
                    console.log(`  ${index + 1}. ${template.name} (${template.category}, ${template.language})`);
                });
            }
            
            // Mostrar todos os status disponíveis
            const statusCounts = allTemplates.reduce((acc, t) => {
                acc[t.status] = (acc[t.status] || 0) + 1;
                return acc;
            }, {});
            
            console.log('\n📈 Status dos templates:');
            Object.entries(statusCounts).forEach(([status, count]) => {
                console.log(`  ${status}: ${count}`);
            });
        }
        
    } catch (whatsappError) {
        console.log('❌ Erro na API oficial:', whatsappError.response?.data || whatsappError.message);
        
        if (whatsappError.response?.status === 401) {
            console.log('🔑 Problema de autenticação - verifique o token');
        } else if (whatsappError.response?.status === 400) {
            console.log('📋 Problema com o Business Account ID ou parâmetros');
        }
        
        return;
    }
    
    try {
        // 3. Fazer login na aplicação
        console.log('\n3. Fazendo login na aplicação...');
        
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        
        if (!loginResponse.data.success) {
            console.log('❌ Falha no login. Verifique as credenciais.');
            return;
        }
        
        const token = loginResponse.data.token;
        console.log('✅ Login bem-sucedido');
        
        // 4. Buscar contas e caixas de entrada disponíveis
        console.log('\n4. Buscando contas e caixas de entrada...');
        
        const accountsResponse = await axios.get(`${BASE_URL}/api/accounts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const accounts = accountsResponse.data;
        console.log(`📋 Contas encontradas: ${accounts.length}`);
        
        let testAccountId = null;
        let testInboxId = null;
        
        if (accounts.length > 0) {
            testAccountId = accounts[0].id;
            console.log(`🔍 Usando conta de teste: ${accounts[0].name} (ID: ${testAccountId})`);
            
            // Buscar caixas de entrada desta conta
            const inboxesResponse = await axios.get(`${BASE_URL}/api/accounts/${testAccountId}/inboxes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const inboxes = inboxesResponse.data;
            const whatsappInboxes = inboxes.filter(i => i.channel_type === 'Channel::Whatsapp');
            
            console.log(`📱 Caixas WhatsApp encontradas: ${whatsappInboxes.length}`);
            
            if (whatsappInboxes.length > 0) {
                testInboxId = whatsappInboxes[0].id;
                console.log(`📥 Usando caixa de teste: ${whatsappInboxes[0].name} (ID: ${testInboxId})`);
            }
        }
        
        // 5. Testar endpoint de templates da aplicação (sem parâmetros)
        console.log('\n5. Testando endpoint de templates (global)...');
        
        const templatesResponse = await axios.get(`${BASE_URL}/api/chatwoot/templates`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const templates = templatesResponse.data;
        console.log(`📋 Templates retornados pela aplicação: ${templates.length}`);
        
        // Verificar fonte dos templates
        const officialApiTemplates = templates.filter(t => t.source?.includes('whatsapp_api'));
        const chatwootTemplates = templates.filter(t => !t.source?.includes('whatsapp_api'));
        
        console.log(`🚀 API Oficial: ${officialApiTemplates.length}`);
        console.log(`📱 Chatwoot: ${chatwootTemplates.length}`);
        
        if (officialApiTemplates.length > 0) {
            console.log('✅ Aplicação está usando API oficial do WhatsApp!');
        } else {
            console.log('⚠️ Aplicação não está usando API oficial (usando Chatwoot)');
        }
        
        // 6. Testar endpoint específico para caixa de entrada
        if (testAccountId && testInboxId) {
            console.log(`\n6. Testando endpoint específico para caixa (Account: ${testAccountId}, Inbox: ${testInboxId})...`);
            
            const inboxTemplatesResponse = await axios.get(`${BASE_URL}/api/chatwoot/templates?accountId=${testAccountId}&inboxId=${testInboxId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const inboxTemplates = inboxTemplatesResponse.data;
            console.log(`📋 Templates da caixa específica: ${inboxTemplates.length}`);
            
            const inboxOfficialApiTemplates = inboxTemplates.filter(t => t.source?.includes('whatsapp_api'));
            const inboxChatwootTemplates = inboxTemplates.filter(t => !t.source?.includes('whatsapp_api'));
            
            console.log(`🚀 API Oficial (caixa específica): ${inboxOfficialApiTemplates.length}`);
            console.log(`📱 Chatwoot (caixa específica): ${inboxChatwootTemplates.length}`);
            
            // Verificar se há informações da caixa nos templates
            const templatesWithInbox = inboxTemplates.filter(t => t.inboxId);
            if (templatesWithInbox.length > 0) {
                console.log(`✅ Templates incluem informações da caixa: ${templatesWithInbox[0].inboxName}`);
            }
        }
        
        // 7. Testar sincronização (global)
        console.log('\n7. Testando sincronização (global)...');
        
        const syncResponse = await axios.post(`${BASE_URL}/api/chatwoot/templates/sync`, {}, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const syncResult = syncResponse.data;
        console.log(`📊 Sincronização global: ${syncResult.success ? '✅ Sucesso' : '❌ Falha'}`);
        console.log(`💬 Mensagem: ${syncResult.message}`);
        console.log(`🔄 Fonte: ${syncResult.source || 'não especificado'}`);
        
        if (syncResult.results) {
            console.log('\n📋 Detalhes da sincronização global:');
            syncResult.results.forEach(result => {
                console.log(`  ${result.method}: ${result.status}`);
                if (result.templatesCount) {
                    console.log(`    Templates: ${result.templatesCount}`);
                }
                if (result.error) {
                    console.log(`    Erro: ${result.error}`);
                }
            });
        }
        
        // 8. Testar sincronização específica para caixa
        if (testAccountId && testInboxId) {
            console.log(`\n8. Testando sincronização específica para caixa (Account: ${testAccountId}, Inbox: ${testInboxId})...`);
            
            const inboxSyncResponse = await axios.post(`${BASE_URL}/api/chatwoot/templates/sync?accountId=${testAccountId}&inboxId=${testInboxId}`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const inboxSyncResult = inboxSyncResponse.data;
            console.log(`📊 Sincronização da caixa: ${inboxSyncResult.success ? '✅ Sucesso' : '❌ Falha'}`);
            console.log(`💬 Mensagem: ${inboxSyncResult.message}`);
            console.log(`🔄 Fonte: ${inboxSyncResult.source || 'não especificado'}`);
            
            if (inboxSyncResult.results) {
                console.log('\n📋 Detalhes da sincronização da caixa:');
                inboxSyncResult.results.forEach(result => {
                    console.log(`  ${result.method}: ${result.status}`);
                    if (result.inboxName) {
                        console.log(`    Caixa: ${result.inboxName}`);
                    }
                    if (result.templatesCount) {
                        console.log(`    Templates: ${result.templatesCount}`);
                    }
                    if (result.approvedCount) {
                        console.log(`    Aprovados: ${result.approvedCount}`);
                    }
                    if (result.error) {
                        console.log(`    Erro: ${result.error}`);
                    }
                });
            }
        }
        
        console.log('\n🎉 Teste concluído com sucesso!');
        
    } catch (appError) {
        console.log('❌ Erro ao testar aplicação:', appError.response?.data || appError.message);
    }
}

// Executar teste
if (require.main === module) {
    testWhatsAppOfficialAPI().catch(console.error);
}

module.exports = { testWhatsAppOfficialAPI }; 