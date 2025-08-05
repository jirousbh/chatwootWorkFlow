const axios = require('axios');
const { Pool } = require('pg');

// Configurações
const BASE_URL = 'http://localhost:3001';
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825',
});

async function testTemplateLanguage() {
  try {
    console.log('🔍 Testando uso correto do idioma dos templates...\n');

    // 1. Fazer login
    console.log('1. Fazendo login...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'admin',
      password: 'invoAI@76825'
    });
    
    if (!loginResponse.data.token) {
      console.log('❌ Erro no login');
      return;
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login bem-sucedido\n');

    // 2. Buscar templates disponíveis
    console.log('2. Buscando templates disponíveis...');
    const templatesResponse = await axios.get(`${BASE_URL}/api/chatwoot/templates`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const templates = templatesResponse.data;
    console.log(`📋 Templates encontrados: ${templates.length}`);
    
    if (templates.length === 0) {
      console.log('⚠️ Nenhum template encontrado. Execute o sistema de sincronização primeiro.');
      return;
    }

    // Mostrar templates disponíveis
    console.log('\n📋 Templates disponíveis:');
    templates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name} (${template.category}, ${template.language})`);
    });

    // 3. Criar uma campanha de teste
    console.log('\n3. Criando campanha de teste...');
    
    // Usar o primeiro template
    const testTemplate = templates[0];
    
    const campaignData = {
      name: `Teste Language - ${testTemplate.name}`,
      type: 'tag',
      tag_name: 'teste_language',
      template_name: testTemplate.name,
      chatwoot_account_id: 3,
      chatwoot_inbox_id: 4
    };
    
    const campaignResponse = await axios.post(`${BASE_URL}/api/campaigns`, campaignData, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!campaignResponse.data.success) {
      console.log('❌ Erro ao criar campanha:', campaignResponse.data);
      return;
    }
    
    const campaign = campaignResponse.data.campaign;
    console.log(`✅ Campanha criada: ID ${campaign.id}`);
    
    // 4. Verificar se os dados do template foram salvos corretamente
    console.log('\n4. Verificando dados salvos no banco...');
    
    const dbResult = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign.id]);
    const campaignFromDb = dbResult.rows[0];
    
    console.log('📊 Dados da campanha no banco:');
    console.log(`   Template: ${campaignFromDb.template_name}`);
    console.log(`   Idioma: ${campaignFromDb.template_language}`);
    console.log(`   Categoria: ${campaignFromDb.template_category}`);
    
    // 5. Comparar com o template original
    console.log('\n5. Comparando com template original...');
    console.log(`   Template original - Idioma: ${testTemplate.language}, Categoria: ${testTemplate.category}`);
    console.log(`   Campanha criada  - Idioma: ${campaignFromDb.template_language}, Categoria: ${campaignFromDb.template_category}`);
    
    const languageMatch = testTemplate.language === campaignFromDb.template_language;
    const categoryMatch = testTemplate.category === campaignFromDb.template_category;
    
    if (languageMatch && categoryMatch) {
      console.log('✅ SUCESSO! Os dados do template foram salvos corretamente');
    } else {
      console.log('❌ FALHA! Os dados não correspondem:');
      if (!languageMatch) {
        console.log(`   - Idioma: esperado '${testTemplate.language}', obtido '${campaignFromDb.template_language}'`);
      }
      if (!categoryMatch) {
        console.log(`   - Categoria: esperado '${testTemplate.category}', obtido '${campaignFromDb.template_category}'`);
      }
    }

    // 6. Testar diferentes templates se disponíveis
    if (templates.length > 1) {
      console.log('\n6. Testando diferentes idiomas/categorias...');
      
      const differentTemplates = templates.filter(t => 
        t.language !== testTemplate.language || t.category !== testTemplate.category
      );
      
      if (differentTemplates.length > 0) {
        const testTemplate2 = differentTemplates[0];
        console.log(`\n📋 Testando template: ${testTemplate2.name} (${testTemplate2.category}, ${testTemplate2.language})`);
        
        const campaignData2 = {
          name: `Teste Language 2 - ${testTemplate2.name}`,
          type: 'tag',
          tag_name: 'teste_language_2',
          template_name: testTemplate2.name,
          chatwoot_account_id: 3,
          chatwoot_inbox_id: 4
        };
        
        const campaignResponse2 = await axios.post(`${BASE_URL}/api/campaigns`, campaignData2, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (campaignResponse2.data.success) {
          const campaign2 = campaignResponse2.data.campaign;
          const dbResult2 = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign2.id]);
          const campaignFromDb2 = dbResult2.rows[0];
          
          console.log(`   Salvou: ${campaignFromDb2.template_language}, ${campaignFromDb2.template_category}`);
          
          const languageMatch2 = testTemplate2.language === campaignFromDb2.template_language;
          const categoryMatch2 = testTemplate2.category === campaignFromDb2.template_category;
          
          if (languageMatch2 && categoryMatch2) {
            console.log('✅ Template 2 também salvo corretamente!');
          } else {
            console.log('❌ Template 2 com problemas');
          }
        }
      }
    }

    // 7. Limpeza - remover campanhas de teste
    console.log('\n7. Limpando campanhas de teste...');
    // Primeiro, obter os IDs das campanhas de teste
    const testCampaigns = await pool.query("SELECT id FROM campaigns WHERE name LIKE 'Teste Language%'");
    
    for (const campaign of testCampaigns.rows) {
      // Excluir registros relacionados primeiro (devido às foreign keys)
      await pool.query('DELETE FROM campaign_executions WHERE campaign_id = $1', [campaign.id]);
      await pool.query('DELETE FROM campaign_status WHERE campaign_id = $1', [campaign.id]);
      await pool.query('DELETE FROM campaign_contacts WHERE campaign_id = $1', [campaign.id]);
    }
    
    // Agora excluir as campanhas
    await pool.query("DELETE FROM campaigns WHERE name LIKE 'Teste Language%'");
    console.log('✅ Campanhas de teste removidas');

    console.log('\n🎯 Teste concluído!');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.response?.data || error.message);
  } finally {
    await pool.end();
  }
}

testTemplateLanguage(); 