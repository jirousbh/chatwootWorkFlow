const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

// Função para detectar o bloco inicial do workflow (copiada do sistema principal)
function getInitialBlock(workflow) {
    if (!workflow || !workflow.blocks) {
        return null;
    }
    
    // Tentar bloco_1 primeiro
    if (workflow.blocks.bloco_1) {
        return 'bloco_1';
    }
    
    // Tentar bloco_01
    if (workflow.blocks.bloco_01) {
        return 'bloco_01';
    }
    
    // Se não encontrar, procurar por padrões de bloco inicial
    const blockKeys = Object.keys(workflow.blocks);
    const initialBlockPatterns = [
        'bloco_1', 'bloco_01', 'bloco_001',
        'inicio', 'start', 'welcome', 'boas_vindas'
    ];
    
    for (const pattern of initialBlockPatterns) {
        if (blockKeys.includes(pattern)) {
            return pattern;
        }
    }
    
    // Se ainda não encontrar, retornar o primeiro bloco
    return blockKeys[0] || null;
}

async function testInitialBlockDetection() {
    try {
        console.log('🔍 Testando detecção automática do bloco inicial...\n');

        // Buscar todos os workflows
        const query = `
            SELECT 
                wc.workflow_name,
                wc.config
            FROM workflow_configs wc
            ORDER BY wc.workflow_name
        `;

        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            console.log('❌ Nenhum workflow encontrado.');
            return;
        }

        console.log(`✅ Encontrados ${result.rows.length} workflow(s):\n`);

        result.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.workflow_name}`);
            
            const config = row.config;
            const initialBlock = getInitialBlock(config);
            const allBlocks = Object.keys(config.blocks || {});
            
            console.log(`   Blocos disponíveis: ${allBlocks.join(', ')}`);
            console.log(`   Bloco inicial detectado: ${initialBlock}`);
            
            if (initialBlock) {
                const firstBlock = config.blocks[initialBlock];
                console.log(`   Nome do bloco inicial: ${firstBlock.name || initialBlock}`);
                console.log(`   Mensagem: ${firstBlock.message ? firstBlock.message.substring(0, 50) + '...' : 'N/A'}`);
            }
            
            console.log('');
        });

        // Testar com workflows de exemplo
        console.log('🧪 Testando com workflows de exemplo:\n');
        
        const testWorkflows = [
            {
                name: 'Workflow com bloco_1',
                blocks: {
                    bloco_1: { name: 'Início', message: 'Olá!' },
                    bloco_2: { name: 'Segundo', message: 'Como vai?' }
                }
            },
            {
                name: 'Workflow com bloco_01',
                blocks: {
                    bloco_01: { name: 'Boas-vindas', message: 'Bem-vindo!' },
                    bloco_02: { name: 'Segundo', message: 'Como vai?' }
                }
            },
            {
                name: 'Workflow com bloco_001',
                blocks: {
                    bloco_001: { name: 'Início', message: 'Olá!' },
                    bloco_002: { name: 'Segundo', message: 'Como vai?' }
                }
            },
            {
                name: 'Workflow com nome personalizado',
                blocks: {
                    inicio: { name: 'Início', message: 'Olá!' },
                    segundo: { name: 'Segundo', message: 'Como vai?' }
                }
            },
            {
                name: 'Workflow sem padrão',
                blocks: {
                    primeiro: { name: 'Primeiro', message: 'Olá!' },
                    segundo: { name: 'Segundo', message: 'Como vai?' }
                }
            }
        ];

        testWorkflows.forEach((testWorkflow, index) => {
            console.log(`${index + 1}. ${testWorkflow.name}`);
            const initialBlock = getInitialBlock(testWorkflow);
            console.log(`   Blocos: ${Object.keys(testWorkflow.blocks).join(', ')}`);
            console.log(`   Bloco inicial detectado: ${initialBlock}`);
            console.log('');
        });

        console.log('✅ Teste de detecção do bloco inicial concluído!');
        console.log('\n📝 Funcionalidades implementadas:');
        console.log('1. Detecção automática de bloco_1, bloco_01, bloco_001');
        console.log('2. Suporte a nomes personalizados (inicio, start, welcome, boas_vindas)');
        console.log('3. Fallback para o primeiro bloco disponível');
        console.log('4. Aplicado tanto no backend quanto no frontend');

    } catch (error) {
        console.error('❌ Erro ao testar detecção do bloco inicial:', error);
    } finally {
        await pool.end();
    }
}

testInitialBlockDetection();
