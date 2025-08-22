const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function testPauseBotVisualization() {
    try {
        console.log('🔍 Testando visualização do Pause Bot...\n');

        // Buscar workflows que têm pause_bot configurado
        const query = `
            SELECT 
                wc.workflow_name,
                wc.config,
                iw.account_id,
                iw.inbox_id
            FROM workflow_configs wc
            JOIN inbox_workflows iw ON wc.workflow_name = iw.workflow_name
            WHERE wc.config::text LIKE '%"pause_bot":true%'
            ORDER BY wc.workflow_name
        `;

        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            console.log('❌ Nenhum workflow com pause_bot encontrado.');
            return;
        }

        console.log(`✅ Encontrados ${result.rows.length} workflow(s) com pause_bot:\n`);

        result.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.workflow_name}`);
            console.log(`   Conta: ${row.account_id}, Caixa: ${row.inbox_id}`);
            
            const config = row.config;
            const blocksWithPauseBot = Object.values(config.blocks || {}).filter(block => block.pause_bot === true);
            
            console.log(`   Blocos com pause_bot: ${blocksWithPauseBot.length}`);
            blocksWithPauseBot.forEach(block => {
                console.log(`     - ${block.name || block.id}${block.assign_team ? ` (Equipe: ${block.assign_team})` : ''}`);
            });
            console.log('');
        });

        // Simular a estrutura que seria passada para o frontend
        console.log('🎨 Simulando visualização no frontend:\n');
        
        const sampleWorkflow = result.rows[0];
        const config = sampleWorkflow.config;
        const blocksWithPauseBot = Object.values(config.blocks || {}).filter(block => block.pause_bot === true);

        // Simular a seção de pause bot
        const pauseBotSection = `
<div class="pause-bot-section">
    <div class="pause-bot-header">
        <i class="fas fa-pause-circle"></i>
        <span>Pause Bot</span>
        <span class="pause-bot-badge">${blocksWithPauseBot.length}</span>
    </div>
    <div class="pause-bot-content">
        <div class="pause-bot-description">
            Blocos que pausam o bot e transferem para atendimento humano:
        </div>
        ${blocksWithPauseBot.map(block => `
            <div class="pause-bot-item">
                <div class="pause-bot-block-info">
                    <i class="fas fa-handshake"></i>
                    <span class="pause-bot-block-name">${block.name || block.id}</span>
                </div>
                ${block.assign_team ? `
                    <div class="pause-bot-team">
                        <i class="fas fa-users"></i>
                        <span>Equipe: ${block.assign_team}</span>
                    </div>
                ` : ''}
            </div>
        `).join('')}
    </div>
</div>`;

        console.log('📋 Seção Pause Bot HTML:');
        console.log(pauseBotSection);
        console.log('\n');

        // Simular blocos individuais com pause bot
        console.log('🔧 Blocos individuais com pause_bot:');
        blocksWithPauseBot.forEach(block => {
            const blockHtml = `
<div class="workflow-block pause-bot">
    <div class="block-header">
        <h6 class="block-title">${block.name || block.id}</h6>
        <span class="block-type default">${block.id}</span>
        <span class="pause-bot-indicator">
            <i class="fas fa-pause-circle"></i> Pause Bot
        </span>
    </div>
    <div class="block-message">${block.message || ''}</div>
</div>`;
            console.log(blockHtml);
            console.log('');
        });

        console.log('✅ Teste de visualização do Pause Bot concluído!');
        console.log('\n📝 Para testar no frontend:');
        console.log('1. Acesse o sistema no navegador');
        console.log('2. Faça login como admin');
        console.log('3. Selecione uma conta e caixa de entrada');
        console.log('4. Clique em "Configurar Fluxo"');
        console.log('5. Verifique a seção "Pause Bot" na visualização');
        console.log('6. Observe os blocos com indicador de pause bot');

    } catch (error) {
        console.error('❌ Erro ao testar visualização do Pause Bot:', error);
    } finally {
        await pool.end();
    }
}

testPauseBotVisualization();
