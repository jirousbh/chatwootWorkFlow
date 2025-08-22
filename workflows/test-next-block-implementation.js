// Script de teste para verificar a implementação do next_block em blocos sem botões

// Simular a função renderBlockNextBlock
function renderBlockNextBlock(block, allBlocks) {
    if (!block.next_block) {
        return '';
    }

    const nextBlock = allBlocks[block.next_block];
    const nextBlockName = nextBlock ? (nextBlock.name || block.next_block) : block.next_block;
    
    let nextBlockText = '';
    if (block.next_block === 'finalizar') {
        nextBlockText = '🏁 Finalizar conversa';
    } else {
        nextBlockText = `➡️ Próximo bloco: ${nextBlockName}`;
    }

    return `
        <div class="block-next-block">
            <div class="next-block-indicator">
                <i class="fas fa-arrow-right me-2"></i>
                <span class="next-block-text">
                    ${nextBlockText}
                </span>
            </div>
        </div>
    `;
}

// Teste com dados reais do wizard-novo.json
const testBlocks = {
    "bloco_3": {
        "id": "bloco_3",
        "name": "Transferir para Pedagógico",
        "message": "Perfeito! Vou te conectar agora mesmo com nossa equipe pedagógica...",
        "pause_bot": true,
        "next_block": "finalizar",
        "assign_team": 2,
        "assign_labels": ["transferido_pedagogico"]
    },
    "bloco_4": {
        "id": "bloco_4",
        "name": "Transferir para Financeiro",
        "message": "Perfeito! Vou te conectar agora mesmo com nossa equipe financeira...",
        "pause_bot": true,
        "next_block": "finalizar",
        "assign_team": 3,
        "assign_labels": ["transferido_financeiro"]
    },
    "bloco_5": {
        "id": "bloco_5",
        "name": "Transferir para Comercial",
        "message": "Perfeito! Vou te conectar agora mesmo com nossa equipe comercial...",
        "pause_bot": true,
        "next_block": "finalizar",
        "assign_team": 1,
        "assign_labels": ["transferido_comercial"]
    },
    "finalizar": {
        "id": "finalizar",
        "name": "Finalizar",
        "type": "end",
        "message": "Conversa finalizada."
    }
};

// Testar a função
console.log('=== Teste da implementação do next_block ===\n');

Object.entries(testBlocks).forEach(([blockId, block]) => {
    console.log(`Bloco: ${blockId}`);
    console.log(`Nome: ${block.name}`);
    console.log(`Tem botões: ${block.buttons ? 'Sim' : 'Não'}`);
    console.log(`Tem next_block: ${block.next_block ? 'Sim' : 'Não'}`);
    
    if (!block.buttons && block.next_block) {
        const rendered = renderBlockNextBlock(block, testBlocks);
        console.log('HTML gerado:');
        console.log(rendered);
    }
    
    console.log('---');
});

console.log('\n✅ Teste concluído!');
console.log('📝 Verifique se o HTML gerado está correto e se os estilos CSS foram aplicados.');
