// Chatwoot Workflows Frontend Application
class ChatwootWorkflowsApp {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.currentAccount = null;
        this.currentInbox = null;
        this.accounts = [];
        this.inboxes = [];
        this.workflowTemplates = [];
        this.activeWorkflows = [];
        
        this.init();
    }

    async init() {
        if (this.token) {
            await this.checkAuth();
        } else {
            this.showLogin();
        }
    }

    async checkAuth() {
        try {
            // Verificar se o token ainda é válido fazendo uma requisição
            const response = await this.apiRequest('/api/accounts');
            if (response) {
                this.showApp();
                await this.loadInitialData();
            } else {
                this.showLogin();
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
            this.showLogin();
        }
    }

    showLogin() {
        const appElement = document.getElementById('app');
        const loginDiv = document.getElementById('loginDiv');
        
        if (appElement) {
            appElement.classList.add('d-none');
        }
        
        this.showDiv('loginDiv');
        
        // Configurar formulário de login (evitar listeners duplicados)
        const loginForm = document.getElementById('loginForm');
        if (loginForm && !loginForm.hasAttribute('data-listener-added')) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login();
            });
            loginForm.setAttribute('data-listener-added', 'true');
        }
    }

    showApp() {
        this.hideDiv('loginDiv');
            document.getElementById('app').classList.remove('d-none');
            document.getElementById('currentUser').textContent = this.user.username;
            
        // Adiciona listener para o formulário de senha (evitar duplicados)
            const form = document.getElementById('changePasswordForm');
            if (form && !form.hasAttribute('data-listener-added')) {
                form.onsubmit = (e) => {
                    e.preventDefault();
                    this.changePassword();
                };
                form.setAttribute('data-listener-added', 'true');
            }
            
            // Inicializar event listeners de campanhas após login
            initCampanhasAfterLogin();
    }

    async login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                
                errorDiv.classList.add('d-none');
                this.showApp();
                await this.loadInitialData();
            } else {
                errorDiv.textContent = data.error || 'Erro no login';
                errorDiv.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Erro no login:', error);
            errorDiv.textContent = 'Erro de conexão';
            errorDiv.classList.remove('d-none');
        }
    }

    logout() {
        this.token = null;
        this.user = {};
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        this.showLogin();
    }

    async apiRequest(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    ...options.headers
                }
            });

            if (response.status === 401) {
                this.logout();
                return null;
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    async loadInitialData() {
        // 1. Carregar contas
        await this.loadAccounts();
        // 2. Carregar inboxes de todas as contas
        this.inboxes = [];
        for (const account of this.accounts) {
            try {
                const inboxes = await this.apiRequest(`/api/accounts/${account.id}/inboxes`);
                if (Array.isArray(inboxes)) {
                    this.inboxes = this.inboxes.concat(inboxes);
                }
            } catch (e) {
                console.warn('Erro ao carregar inboxes da conta', account.id, e);
            }
        }
        // 3. Carregar templates (opcional, não afeta nomes)
        await this.loadWorkflowTemplates();
        // 4. Carregar fluxos ativos
        await this.loadActiveWorkflows();
    }

    async loadAccounts() {
        try {
            this.accounts = await this.apiRequest('/api/accounts');
            this.populateAccountSelect();
        } catch (error) {
            console.error('Erro ao carregar contas:', error);
            this.showAlert('Erro ao carregar contas', 'danger');
        }
    }

    async loadInboxes() {
        const accountId = document.getElementById('accountSelect').value;
        if (!accountId) {
            document.getElementById('inboxSelect').innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
            return;
        }

        try {
            this.inboxes = await this.apiRequest(`/api/accounts/${accountId}/inboxes`);
            this.populateInboxSelect();
        } catch (error) {
            console.error('Erro ao carregar caixas de entrada:', error);
            this.showAlert('Erro ao carregar caixas de entrada', 'danger');
        }
    }

    async loadWorkflowTemplates() {
        try {
            this.workflowTemplates = await this.apiRequest('/api/workflow-templates');
            this.populateTemplateSelect();
        } catch (error) {
            console.error('Erro ao carregar templates:', error);
        }
    }

    async loadActiveWorkflows(forceRefresh = false) {
        try {
            console.log(`🔄 Carregando workflows ativos (força: ${forceRefresh})`);
            
            const headers = {};
            if (forceRefresh) {
                headers['Cache-Control'] = 'no-cache';
                headers['Pragma'] = 'no-cache';
            }
            
            this.activeWorkflows = await this.apiRequest('/api/inbox-workflows', { headers });
            this.populateActiveWorkflows();
            
            console.log(`✅ ${this.activeWorkflows.length} workflows carregados`);
        } catch (error) {
            console.error('❌ Erro ao carregar fluxos ativos:', error);
        }
    }

    async loadWorkflow() {
        const accountId = document.getElementById('accountSelect').value;
        const inboxId = document.getElementById('inboxSelect').value;
        
        if (!accountId || !inboxId) {
            return;
        }

        try {
            const workflow = await this.apiRequest(`/api/inbox-workflows/${accountId}/${inboxId}`);
            if (workflow) {
                document.getElementById('workflowName').value = workflow.workflow_name;
                document.getElementById('workflowConfig').value = JSON.stringify(workflow.workflow_config, null, 2);
                this.updateWorkflowPreview();
            }
            
            // Se o editor estiver aberto, atualizar também
            const editorVisible = !document.getElementById('workflowEditor').classList.contains('d-none');
            if (editorVisible) {
                console.log('🔄 Editor está aberto, atualizando com novo fluxo...');
                await this.loadActiveWorkflowForEditor(accountId, inboxId);
            }
        } catch (error) {
            console.error('Erro ao carregar fluxo:', error);
        }
    }

    populateAccountSelect() {
        const select = document.getElementById('accountSelect');
        select.innerHTML = '<option value="">Selecione uma conta...</option>';
        
        this.accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.name;
            select.appendChild(option);
        });
        
        // Garantir que o select seja clicável
        select.style.pointerEvents = 'auto';
        select.style.zIndex = '1';
    }

    populateInboxSelect() {
        const select = document.getElementById('inboxSelect');
        select.innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
        
        this.inboxes.forEach(inbox => {
            const option = document.createElement('option');
            option.value = inbox.id;
            option.textContent = inbox.name;
            select.appendChild(option);
        });
        
        // Garantir que o select seja clicável
        select.style.pointerEvents = 'auto';
        select.style.zIndex = '1';
    }

    populateTemplateSelect() {
        const select = document.getElementById('workflowTemplate');
        select.innerHTML = '<option value="">Selecione um template...</option>';
        
        this.workflowTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.name;
            option.textContent = template.displayName;
            select.appendChild(option);
        });
    }

    populateActiveWorkflows() {
        const container = document.getElementById('activeWorkflows');
        container.innerHTML = '';
        if (this.activeWorkflows.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Nenhum fluxo ativo</p>';
            return;
        }
        this.activeWorkflows.forEach(workflow => {
            // Buscar nome da conta e da caixa, garantindo comparação por string
            let accountName = workflow.account_id;
            let inboxName = workflow.inbox_id;
            if (this.accounts && this.accounts.length > 0) {
                const account = this.accounts.find(acc => String(acc.id) === String(workflow.account_id));
                if (account) accountName = account.name;
            }
            if (this.inboxes && this.inboxes.length > 0) {
                const inbox = this.inboxes.find(inb => String(inb.id) === String(workflow.inbox_id));
                if (inbox) inboxName = inbox.name;
            }
            const item = document.createElement('div');
            item.className = 'workflow-item';
            item.innerHTML = `
                <div class="workflow-info">
                    <h6 class="workflow-name">${workflow.workflow_name}</h6>
                    <p class="workflow-details">
                        Conta: ${accountName} | Caixa: ${inboxName}
                    </p>
                </div>
                <div class="workflow-actions">
                    <button class="btn btn-sm btn-outline-danger" onclick="app.deleteWorkflow(${workflow.account_id}, ${workflow.inbox_id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    async showWorkflowEditor() {
        const accountId = document.getElementById('accountSelect').value;
        const inboxId = document.getElementById('inboxSelect').value;
        
        if (!accountId || !inboxId) {
            this.showAlert('Selecione uma conta e caixa de entrada primeiro', 'warning');
            return;
        }

        // Mostrar o editor
        document.getElementById('workflowEditor').classList.remove('d-none');
        document.getElementById('workflowInfo').classList.add('d-none');
        
        // Tentar carregar o fluxo ativo para esta conta/caixa de entrada
        await this.loadActiveWorkflowForEditor(accountId, inboxId);
    }

    async loadActiveWorkflowForEditor(accountId, inboxId) {
        try {
            console.log(`🔍 Carregando fluxo ativo para conta ${accountId}, caixa ${inboxId}`);
            
            const workflow = await this.apiRequest(`/api/inbox-workflows/${accountId}/${inboxId}`);
            
            if (workflow) {
                console.log('✅ Fluxo ativo encontrado:', workflow.workflow_name);
                
                // Preencher os campos com o fluxo ativo
                document.getElementById('workflowName').value = workflow.workflow_name;
                document.getElementById('workflowConfig').value = JSON.stringify(workflow.workflow_config, null, 2);
                
                // Atualizar o preview
                this.updateWorkflowPreview();
                
                // Mostrar mensagem informativa
                this.showAlert(`✅ Fluxo ativo carregado: "${workflow.workflow_name}"`, 'success');
                
                // Adicionar indicador visual no editor
                this.addActiveWorkflowIndicator(workflow.workflow_name);
                
                // Opcional: destacar no template select se corresponder a algum template
                this.highlightActiveTemplate(workflow.workflow_name);
            } else {
                console.log('ℹ️ Nenhum fluxo ativo encontrado para esta combinação');
                
                // Limpar campos se não houver fluxo ativo
                document.getElementById('workflowName').value = '';
                document.getElementById('workflowConfig').value = '';
                document.getElementById('workflowPreview').innerHTML = '<p class="text-muted">Nenhum fluxo ativo encontrado. Selecione um template ou cole uma configuração para criar um novo fluxo.</p>';
                
                // Remover indicador de fluxo ativo
                this.removeActiveWorkflowIndicator();
                
                // Mostrar mensagem informativa
                this.showAlert('Nenhum fluxo ativo encontrado para esta conta/caixa de entrada. Você pode criar um novo.', 'info');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar fluxo ativo:', error);
            
            // Em caso de erro, limpar campos
            document.getElementById('workflowName').value = '';
            document.getElementById('workflowConfig').value = '';
            document.getElementById('workflowPreview').innerHTML = '<p class="text-danger">Erro ao carregar fluxo ativo. Você pode criar um novo fluxo.</p>';
            
            // Remover indicador de fluxo ativo
            this.removeActiveWorkflowIndicator();
            
            // Não mostrar erro para o usuário, apenas informar que pode criar novo
            this.showAlert('Erro ao verificar fluxo ativo. Você pode criar um novo fluxo.', 'warning');
        }
    }

    highlightActiveTemplate(workflowName) {
        try {
            const templateSelect = document.getElementById('workflowTemplate');
            const options = templateSelect.querySelectorAll('option');
            
            // Limpar seleção anterior
            templateSelect.value = '';
            
            // Tentar encontrar template correspondente
            options.forEach(option => {
                if (option.value && this.workflowTemplates) {
                    const template = this.workflowTemplates.find(t => t.name === option.value);
                    if (template && (template.name === workflowName || template.displayName === workflowName)) {
                        templateSelect.value = option.value;
                        console.log(`🎯 Template correspondente encontrado: ${template.displayName}`);
                    }
                }
            });
        } catch (error) {
            console.warn('Erro ao destacar template ativo:', error);
        }
    }

    addActiveWorkflowIndicator(workflowName) {
        try {
            // Remover indicador anterior se existir
            this.removeActiveWorkflowIndicator();
            
            // Encontrar o cabeçalho do editor
            const editorHeader = document.querySelector('#workflowEditor .card-header h5');
            if (editorHeader) {
                // Criar indicador
                const indicator = document.createElement('span');
                indicator.id = 'activeWorkflowIndicator';
                indicator.className = 'badge bg-success ms-2';
                indicator.innerHTML = `🔄 Fluxo Ativo: ${workflowName}`;
                
                // Adicionar ao cabeçalho
                editorHeader.appendChild(indicator);
                
                console.log(`📍 Indicador de fluxo ativo adicionado: ${workflowName}`);
            }
        } catch (error) {
            console.warn('Erro ao adicionar indicador de fluxo ativo:', error);
        }
    }

    removeActiveWorkflowIndicator() {
        try {
            const indicator = document.getElementById('activeWorkflowIndicator');
            if (indicator) {
                indicator.remove();
                console.log('🗑️ Indicador de fluxo ativo removido');
            }
        } catch (error) {
            console.warn('Erro ao remover indicador de fluxo ativo:', error);
        }
    }

    hideWorkflowEditor() {
        document.getElementById('workflowEditor').classList.add('d-none');
        document.getElementById('workflowInfo').classList.remove('d-none');
        document.getElementById('workflowName').value = '';
        document.getElementById('workflowConfig').value = '';
        document.getElementById('workflowPreview').innerHTML = '<p class="text-muted">Selecione um template ou cole uma configuração para visualizar o fluxo.</p>';
        
        // Remover indicador de fluxo ativo
        this.removeActiveWorkflowIndicator();
    }

    loadTemplate() {
        const templateName = document.getElementById('workflowTemplate').value;
        if (!templateName) return;

        const template = this.workflowTemplates.find(t => t.name === templateName);
        if (template) {
            document.getElementById('workflowName').value = template.displayName;
            document.getElementById('workflowConfig').value = JSON.stringify(template.config, null, 2);
            this.updateWorkflowPreview();
        }
    }

    updateWorkflowPreview() {
        const configText = document.getElementById('workflowConfig').value;
        const preview = document.getElementById('workflowPreview');
        
        try {
            const config = JSON.parse(configText);
            preview.innerHTML = this.renderWorkflowPreview(config);
            
            // Inicializar tooltips após renderizar
            setTimeout(() => {
                this.initializeTooltips();
            }, 100);
        } catch (error) {
            preview.innerHTML = '<p class="text-danger">Erro ao parsear JSON</p>';
        }
    }

    initializeTooltips() {
        // Implementação simples de tooltip usando title
        const tooltipElements = document.querySelectorAll('[data-tooltip]');
        tooltipElements.forEach(element => {
            element.title = element.getAttribute('data-tooltip');
        });
    }

    renderWorkflowPreview(config) {
        if (!config.blocks) {
            return '<p class="text-muted">Configuração inválida</p>';
        }

        let html = '<div class="workflow-preview">';
        
        Object.entries(config.blocks).forEach(([blockId, block]) => {
            const isStart = blockId === 'bloco_1';
            const isEnd = block.type === 'end';
            
            html += `
                <div class="workflow-block ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''}">
                    <div class="block-header">
                        <h6 class="block-title">${block.name || blockId}</h6>
                        <span class="block-type ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''} default">
                            ${isStart ? 'Início' : isEnd ? 'Fim' : blockId}
                        </span>
                    </div>
                    <div class="block-message">${block.message || ''}</div>
                    ${this.renderBlockMedia(block)}
                    ${this.renderBlockActions(block)}
                    ${block.buttons ? `
                        <div class="block-buttons">
                            ${block.buttons.map(btn => this.renderButtonWithTooltip(btn, config.blocks)).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    renderBlockMedia(block) {
        if (!block.media) {
            return '';
        }

        const media = block.media;
        
        // Renderizar vídeo do YouTube
        if (media.type === 'video' && media.url) {
            const videoId = this.extractYouTubeVideoId(media.url);
            if (videoId) {
                // Usar múltiplas opções de thumbnail com fallbacks
                const thumbnailId = `thumb_${videoId}`;
                return `
                    <div class="block-media">
                        <div class="media-card">
                            <div class="media-thumbnail">
                                <img 
                                    id="${thumbnailId}"
                                    src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" 
                                    alt="Thumbnail do vídeo" 
                                    class="youtube-thumbnail"
                                    onerror="handleThumbnailError('${thumbnailId}', '${videoId}')" 
                                />
                                <div class="play-overlay">
                                    <i class="fab fa-youtube"></i>
                                </div>
                            </div>
                            <div class="media-info">
                                <h6 class="media-title">
                                    <i class="fas fa-play-circle me-2"></i>${media.title || 'Vídeo do YouTube'}
                                </h6>
                                ${media.description ? `<p class="media-description">${media.description}</p>` : ''}
                                <small class="media-url">
                                    <i class="fas fa-link me-1"></i>
                                    <a href="${media.url}" target="_blank" class="text-decoration-none">${media.url}</a>
                                </small>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        // Renderizar attachment (arquivo enviado)
        if (media.attachment && media.attachment.file_id) {
            return `
                <div class="block-media">
                    <div class="media-card">
                        <div class="media-info">
                            <h6 class="media-title">
                                <i class="fas fa-paperclip me-2"></i>Anexo
                            </h6>
                            <small class="media-file-id">
                                <i class="fas fa-file me-1"></i>
                                File ID: <code>${media.attachment.file_id}</code>
                            </small>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return '';
    }

    extractYouTubeVideoId(url) {
        console.log('Extraindo ID do YouTube da URL:', url);
        
        // Extrair ID do vídeo de diferentes formatos de URL do YouTube
        const regexes = [
            // youtube.com/watch?v=ID (pode ter outros parâmetros)
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*[&?]v=([^&\n?#]+)/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\n?#]+)/,
            // youtu.be/ID (formato curto)
            /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^&\n?#\?]+)/,
            // youtube.com/embed/ID
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&\n?#]+)/,
            // youtube.com/v/ID
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^&\n?#]+)/,
            // youtube.com/watch?feature=player_embedded&v=ID
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([^&\n?#]+)/
        ];
        
        for (let i = 0; i < regexes.length; i++) {
            const regex = regexes[i];
            const match = url.match(regex);
            if (match && match[1]) {
                const videoId = match[1].split('&')[0]; // Remove parâmetros adicionais
                console.log(`ID extraído (regex ${i+1}):`, videoId);
                return videoId;
            }
        }
        
        console.warn('Não foi possível extrair ID do YouTube da URL');
        return null;
    }

    renderBlockActions(block) {
        const actions = [];
        
        // Labels do bloco
        if (block.assign_labels && block.assign_labels.length > 0) {
            actions.push(`<div class="block-action-info">🏷️ Labels da conversa: ${block.assign_labels.join(', ')}</div>`);
        }
        
        if (block.contact_labels && block.contact_labels.length > 0) {
            actions.push(`<div class="block-action-info">👤 Labels do contato: ${block.contact_labels.join(', ')}</div>`);
        }
        
        // Atribuições do bloco
        if (block.assign_agent) {
            actions.push(`<div class="block-action-info">👨‍💼 Atribuir ao agente: ${block.assign_agent}</div>`);
        }
        
        if (block.assign_team) {
            actions.push(`<div class="block-action-info">👥 Atribuir ao time: ${block.assign_team}</div>`);
        }
        
        if (block.tag) {
            actions.push(`<div class="block-action-info">🏷️ Tag do bloco: ${block.tag}</div>`);
        }
        
        return actions.length > 0 ? `<div class="block-actions">${actions.join('')}</div>` : '';
    }

    renderButtonWithTooltip(button, allBlocks) {
        const tooltipInfo = this.generateButtonTooltip(button, allBlocks);
        
        return `
            <span class="block-button" 
                  data-tooltip="${tooltipInfo.replace(/"/g, '&quot;')}" 
                  title="${tooltipInfo.replace(/"/g, '&quot;')}">
                ${button.text}
            </span>
        `;
    }

    generateButtonTooltip(button, allBlocks) {
        const tooltipParts = [];
        
        // Próximo bloco
        if (button.next_block) {
            const nextBlock = allBlocks[button.next_block];
            const nextBlockName = nextBlock ? (nextBlock.name || button.next_block) : button.next_block;
            
            if (button.next_block === 'finalizar') {
                tooltipParts.push(`🏁 Ação: Finalizar conversa`);
            } else {
                tooltipParts.push(`➡️ Próximo bloco: ${nextBlockName}`);
            }
        } else {
            // Se não há next_block definido, o fluxo para neste ponto
            tooltipParts.push(`⏹️ Ação: Parar fluxo (sem próximo bloco)`);
        }
        
        // Labels que serão atribuídos pelo botão
        const labels = [];
        
        if (button.assign_labels && button.assign_labels.length > 0) {
            labels.push(`🏷️ Labels da conversa: ${button.assign_labels.join(', ')}`);
        }
        
        if (button.contact_labels && button.contact_labels.length > 0) {
            labels.push(`👤 Labels do contato: ${button.contact_labels.join(', ')}`);
        }
        
        if (button.tag) {
            labels.push(`🏷️ Tag: ${button.tag}`);
        }
        
        tooltipParts.push(...labels);
        
        // Atribuições do botão
        if (button.assign_agent) {
            tooltipParts.push(`👨‍💼 Atribuir ao agente: ${button.assign_agent}`);
        }
        
        if (button.assign_team) {
            tooltipParts.push(`👥 Atribuir ao time: ${button.assign_team}`);
        }
        
        // Se não há nenhuma informação além do fluxo, mostrar mensagem
        if (tooltipParts.length === 1 && !button.next_block) {
            return '⚠️ Botão sem ação definida - fluxo irá parar';
        }
        
        return tooltipParts.join('\n');
    }

    async saveWorkflow() {
        const accountId = document.getElementById('accountSelect').value;
        const inboxId = document.getElementById('inboxSelect').value;
        const workflowName = document.getElementById('workflowName').value;
        const configText = document.getElementById('workflowConfig').value;

        if (!accountId || !inboxId || !workflowName || !configText) {
            this.showAlert('Preencha todos os campos', 'warning');
            return;
        }

        // Adicionar indicador de salvando
        const saveButton = document.querySelector('button[onclick="saveWorkflow()"]');
        const originalText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Salvando...';
        saveButton.disabled = true;

        try {
            const workflowConfig = JSON.parse(configText);
            
            console.log('🔄 Iniciando salvamento:', { accountId, inboxId, workflowName });
            
            const response = await this.apiRequest('/api/inbox-workflows', {
                method: 'POST',
                body: JSON.stringify({
                    accountId: parseInt(accountId),
                    inboxId: parseInt(inboxId),
                    workflowName,
                    workflowConfig
                }),
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            if (response.success) {
                console.log('✅ Salvamento bem-sucedido!');
                
                // Mostrar sucesso
                this.showAlert('✅ Fluxo salvo com sucesso!', 'success');
                
                // FORÇAR RELOAD dos dados para garantir sincronização
                console.log('🔄 Forçando reload dos dados...');
                
                // 1. Aguardar um pouco para garantir que salvou no banco
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 2. Recarregar workflows ativos com força
                await this.loadActiveWorkflows(true); // true = força reload
                
                // 3. Recarregar o workflow específico para validar
                await this.forceReloadCurrentWorkflow(accountId, inboxId);
                
                // 4. Fechar editor apenas se reload foi bem-sucedido
                this.hideWorkflowEditor();
                
                // 5. Mostrar confirmação visual com detalhes
                this.showWorkflowSavedConfirmation(workflowName, accountId, inboxId);
                
            } else {
                console.error('❌ Erro no salvamento:', response.error);
                this.showAlert(response.error || 'Erro ao salvar fluxo', 'danger');
            }
        } catch (error) {
            console.error('❌ Erro ao salvar fluxo:', error);
            this.showAlert('Erro ao salvar fluxo: ' + error.message, 'danger');
        } finally {
            // Restaurar botão
            saveButton.innerHTML = originalText;
            saveButton.disabled = false;
        }
    }

    // Função para forçar reload do workflow atual
    async forceReloadCurrentWorkflow(accountId, inboxId) {
        try {
            console.log('🔄 Validando workflow salvo...');
            
            const workflow = await this.apiRequest(`/api/inbox-workflows/${accountId}/${inboxId}`, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'If-None-Match': '*' // Força bypass de cache HTTP
                }
            });
            
            if (workflow) {
                console.log(`✅ Workflow validado: "${workflow.workflow_name}"`);
                return workflow;
            } else {
                console.warn('⚠️ Workflow não encontrado após salvamento');
                return null;
            }
        } catch (error) {
            console.error('❌ Erro ao validar workflow:', error);
            return null;
        }
    }
    
    // Função para mostrar indicador de templates específicos da caixa
showInboxTemplateIndicator(inboxName, templateCount) {
    // Remover indicador anterior se existir
    const existingIndicator = document.getElementById('inboxTemplateIndicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Criar novo indicador
    const indicator = document.createElement('div');
    indicator.id = 'inboxTemplateIndicator';
    indicator.className = 'alert alert-info alert-dismissible fade show mt-2';
    indicator.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-info-circle me-2"></i>
            <div>
                <strong>🚀 Templates da API Oficial</strong><br>
                <small>Carregados ${templateCount} templates da caixa de entrada: <strong>${inboxName}</strong></small>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Adicionar após o select de templates
    const selectContainer = document.getElementById('modeloMensagem').parentElement;
    selectContainer.appendChild(indicator);
    
    // Auto-remover após 8 segundos
    setTimeout(() => {
        if (indicator && indicator.parentNode) {
            indicator.remove();
        }
    }, 8000);
}

// Função para mostrar confirmação detalhada
showWorkflowSavedConfirmation(workflowName, accountId, inboxId) {
        const confirmationHtml = `
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                <div class="d-flex align-items-center">
                    <i class="fas fa-check-circle fa-2x text-success me-3"></i>
                    <div>
                        <h6 class="alert-heading mb-1">✅ Workflow Salvo com Sucesso!</h6>
                        <p class="mb-1"><strong>Nome:</strong> ${workflowName}</p>
                        <p class="mb-1"><strong>Conta:</strong> ${accountId} | <strong>Inbox:</strong> ${inboxId}</p>
                        <small class="text-muted">Salvo em: ${new Date().toLocaleString()}</small>
                    </div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        // Adicionar no topo da página
        const container = document.querySelector('.container-fluid');
        const existingAlert = container.querySelector('.alert-success');
        if (existingAlert) existingAlert.remove();
        
        container.insertAdjacentHTML('afterbegin', confirmationHtml);
        
        // Auto-remover após 10 segundos
        setTimeout(() => {
            const alert = container.querySelector('.alert-success');
            if (alert) alert.remove();
        }, 10000);
    }

    async deleteWorkflow(accountId, inboxId) {
        if (!confirm('Tem certeza que deseja desativar este fluxo?')) {
            return;
        }

        try {
            const response = await this.apiRequest(`/api/inbox-workflows/${accountId}/${inboxId}`, {
                method: 'DELETE'
            });

            if (response.success) {
                this.showAlert('Fluxo desativado com sucesso!', 'success');
                await this.loadActiveWorkflows();
            } else {
                this.showAlert(response.error || 'Erro ao desativar fluxo', 'danger');
            }
        } catch (error) {
            console.error('Erro ao desativar fluxo:', error);
            this.showAlert('Erro ao desativar fluxo', 'danger');
        }
    }

    testWorkflow() {
        this.showAlert('Funcionalidade de teste em desenvolvimento', 'info');
    }

    showAlert(message, type = 'info') {
        // Criar alerta temporário
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Remover automaticamente após 5 segundos
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    showChangePasswordDiv() {
        if (!this.token) {
            console.log('Tentativa de abrir div de senha sem estar logado');
            return;
        }
        
        this.showDiv('changePasswordDiv');
        document.getElementById('changePasswordForm').reset();
        document.getElementById('changePasswordError').classList.add('d-none');
        console.log('Div de alteração de senha aberta pelo usuário');
    }

    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const errorDiv = document.getElementById('changePasswordError');
        
        try {
            const response = await this.apiRequest('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword })
            });
            
            if (response.success) {
                errorDiv.classList.add('d-none');
                this.hideDiv('changePasswordDiv');
                this.showAlert('Senha alterada com sucesso!', 'success');
            } else {
                errorDiv.textContent = response.error || 'Erro ao alterar senha';
                errorDiv.classList.remove('d-none');
            }
        } catch (error) {
            errorDiv.textContent = 'Erro de conexão';
            errorDiv.classList.remove('d-none');
        }
}

    // Funções simples para gerenciar divs
    showDiv(divId) {
        const div = document.getElementById(divId);
        if (div) {
            div.classList.remove('d-none');
            div.style.display = 'block';
            }
    }

    hideDiv(divId) {
        const div = document.getElementById(divId);
        if (div) {
            div.classList.add('d-none');
            div.style.display = 'none';
        }
    }

    hideAllDivs() {
        const divs = ['loginDiv', 'changePasswordDiv', 'mediaManagerDiv', 'campanhasDiv'];
        divs.forEach(divId => this.hideDiv(divId));
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Adicionar estilos CSS para as informações dos blocos
    addWorkflowPreviewStyles();
    
    window.app = new ChatwootWorkflowsApp();
    
    // Atualizar preview quando o usuário digitar no textarea
    const workflowConfig = document.getElementById('workflowConfig');
    if (workflowConfig) {
        workflowConfig.addEventListener('input', () => {
        window.app.updateWorkflowPreview();
    });
    }
});

// Funções globais para compatibilidade com onclick
function logout() {
    window.app.logout();
}

function loadInboxes() {
    const accountSelect = document.getElementById('accountSelect');
    updateSelectedAccount(accountSelect.value);
    window.app.loadInboxes();
}

function loadWorkflow() {
    const inboxSelect = document.getElementById('inboxSelect');
    updateSelectedInbox(inboxSelect.value);
    window.app.loadWorkflow();
}

async function showWorkflowEditor() {
    await window.app.showWorkflowEditor();
}

function hideWorkflowEditor() {
    window.app.hideWorkflowEditor();
}

function loadTemplate() {
    window.app.loadTemplate();
}

function saveWorkflow() {
    window.app.saveWorkflow();
}

function testWorkflow() {
    window.app.testWorkflow();
} 

// ===== CAMPANHAS DE WHATSAPP =====

// Variáveis globais para campanhas
let selectedAccountId = null;
let selectedInboxId = null;

// Atualizar as seleções existentes para acompanhar mudanças
function updateSelectedAccount(accountId) {
    selectedAccountId = accountId;
}

function updateSelectedInbox(inboxId) {
    selectedInboxId = inboxId;
}

// Função para inicializar event listeners das campanhas
function initCampanhasEventListeners() {
    try {
        console.log('Inicializando event listeners de campanhas...');
        
        // Verificar se os elementos existem antes de adicionar listeners
        const btnCriarCampanha = document.getElementById('btnCriarCampanha');
        const closeCampanha = document.getElementById('closeCampanha');
        const formCampanha = document.getElementById('formCampanha');
        const agendarEnvio = document.getElementById('agendarEnvio');
        const menuListarCampanhas = document.getElementById('menuListarCampanhas');
        const metodoEnvioRadios = document.getElementsByName('metodoEnvio');

        console.log('Elementos encontrados:', {
            btnCriarCampanha: !!btnCriarCampanha,
            closeCampanha: !!closeCampanha,
            formCampanha: !!formCampanha,
            agendarEnvio: !!agendarEnvio,
            menuListarCampanhas: !!menuListarCampanhas,
            metodoEnvioRadios: metodoEnvioRadios.length
        });

        if (btnCriarCampanha) {
            btnCriarCampanha.addEventListener('click', function() {
                // Verificar se conta e caixa foram selecionadas (mesma regra dos workflows)
                const accountId = document.getElementById('accountSelect').value;
                const inboxId = document.getElementById('inboxSelect').value;
                
                if (!accountId || !inboxId) {
                    window.app.showAlert('Selecione uma conta e caixa de entrada primeiro', 'warning');
                    return;
                }
                
                // Atualizar as variáveis globais com os valores selecionados
                selectedAccountId = accountId;
                selectedInboxId = inboxId;
                
                // Abrir modal de campanha
                window.app.showDiv('campanhasDiv');
                loadModelos();
                loadTags();
                
                // Mostrar informações da conta/caixa selecionada no modal
                showSelectedAccountInbox();
            });
        }

        if (closeCampanha) {
            closeCampanha.addEventListener('click', function() {
                // Remover indicador de conta/caixa selecionada
                const indicator = document.getElementById('selectedAccountInboxIndicator');
                if (indicator) {
                    indicator.remove();
                }
                
                window.app.hideDiv('campanhasDiv');
            });
        }

        // Trocar entre campos de tag/CSV
        if (metodoEnvioRadios && metodoEnvioRadios.length > 0) {
            metodoEnvioRadios.forEach(radio => {
                radio.addEventListener('change', function() {
                    const detalhesTag = document.getElementById('detalhesTag');
                    const detalhesCSV = document.getElementById('detalhesCSV');
                    if (detalhesTag && detalhesCSV) {
                        if (this.value === 'tag') {
                            detalhesTag.style.display = 'block';
                            detalhesCSV.style.display = 'none';
                        } else {
                            detalhesTag.style.display = 'none';
                            detalhesCSV.style.display = 'block';
                        }
                    }
                });
            });
        }

        // Mostrar/esconder campos de agendamento
        if (agendarEnvio) {
            agendarEnvio.addEventListener('change', function() {
                const agendamentoCampos = document.getElementById('agendamentoCampos');
                const btnEnviar = document.getElementById('btnEnviarCampanha');
                if (agendamentoCampos && btnEnviar) {
                    if (this.checked) {
                        agendamentoCampos.style.display = 'block';
                        btnEnviar.textContent = 'Agendar Campanha';
                    } else {
                        agendamentoCampos.style.display = 'none';
                        btnEnviar.textContent = 'Enviar Agora';
                    }
                }
            });
        }

        // Submeter formulário para criar campanha
        if (formCampanha) {
            formCampanha.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const formData = new FormData(this);
                const metodoEnvio = formData.get('metodoEnvio');
                const agendarEnvioChecked = document.getElementById('agendarEnvio').checked;
                
                // Preparar dados da campanha
                const campanhaData = {
                    name: formData.get('campanhaNome'),
                    type: metodoEnvio,
                    template_name: formData.get('modeloMensagem'),
                    chatwoot_account_id: selectedAccountId,
                    chatwoot_inbox_id: selectedInboxId
                };
                
                if (metodoEnvio === 'tag') {
                    campanhaData.tag_name = formData.get('tagNome');
                }
                
                if (agendarEnvioChecked) {
                    const dataEnvio = formData.get('dataEnvio');
                    const horaEnvio = formData.get('horaEnvio');
                    if (dataEnvio && horaEnvio) {
                        campanhaData.scheduled_at = `${dataEnvio}T${horaEnvio}:00`;
                    }
                }
                
                try {
                    // Criar campanha
                    const response = await fetch('/api/campaigns', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getAuthToken()}`
                        },
                        body: JSON.stringify(campanhaData)
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        const campaignId = result.campaign.id;
                        
                        // Se for CSV, fazer upload do arquivo
                        if (metodoEnvio === 'csv') {
                            const csvFile = formData.get('csvContatos');
                            if (csvFile && csvFile.size > 0) {
                                const uploadFormData = new FormData();
                                uploadFormData.append('file', csvFile);
                                
                                await fetch(`/api/campaigns/${campaignId}/upload-csv`, {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${getAuthToken()}` },
                                    body: uploadFormData
                                });
                            }
                        }
                        
                        // Se não for agendado, iniciar envio imediatamente
                        if (!agendarEnvioChecked) {
                            await fetch(`/api/campaigns/${campaignId}/start`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                            });
                        }
                        
                        window.app.showAlert('Campanha criada com sucesso!', 'success');
                        window.app.hideDiv('campanhasDiv');
                        this.reset();
                    } else {
                        window.app.showAlert('Erro ao criar campanha: ' + result.error, 'error');
                    }
                } catch (error) {
                    console.error('Erro ao criar campanha:', error);
                    window.app.showAlert('Erro ao criar campanha', 'error');
                }
            });
        }

        // Listar campanhas (menu dropdown)
        if (menuListarCampanhas) {
            menuListarCampanhas.addEventListener('click', function() {
                loadCampanhasList();
            });
        }
        
        console.log('Event listeners de campanhas inicializados com sucesso!');
    } catch (error) {
        console.error('Erro na função initCampanhasEventListeners:', error);
    }
}

// Inicializar event listeners quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Não executar nada relacionado a campanhas no DOMContentLoaded
    // Deixar apenas para após o login
});

// Função para ser chamada quando o usuário faz login com sucesso
function initCampanhasAfterLogin() {
    try {
        // Aguardar um pouco mais para garantir que todos os elementos foram criados
        setTimeout(() => {
            try {
                initCampanhasEventListeners();
            } catch (error) {
                console.error('Erro ao inicializar event listeners de campanhas:', error);
            }
        }, 1000);
    } catch (error) {
        console.error('Erro na inicialização de campanhas:', error);
    }
}

// Carregar modelos/templates via API
async function loadModelos() {
    try {
        console.log('🔍 Carregando templates do WhatsApp...');
        
        // Obter conta e caixa selecionadas
        const accountId = selectedAccountId || document.getElementById('accountSelect')?.value;
        const inboxId = selectedInboxId || document.getElementById('inboxSelect')?.value;
        
        console.log(`📋 Usando Account ID: ${accountId}, Inbox ID: ${inboxId}`);
        
        // Construir URL com parâmetros se disponíveis
        let url = '/api/chatwoot/templates';
        const params = new URLSearchParams();
        if (accountId) params.append('accountId', accountId);
        if (inboxId) params.append('inboxId', inboxId);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const templates = await response.json();
        console.log('📋 Templates recebidos:', templates);
        
        const select = document.getElementById('modeloMensagem');
        select.innerHTML = '<option value="">Selecione um modelo</option>';
        
        if (Array.isArray(templates) && templates.length > 0) {
            // Agrupar por fonte
            const officialApiTemplates = templates.filter(t => t.source?.includes('whatsapp_api'));
            const chatwootTemplates = templates.filter(t => !t.source?.includes('whatsapp_api'));
            
            // Verificar se templates são específicos de uma caixa
            const inboxSpecificTemplates = templates.filter(t => t.inboxId);
            
            // Mostrar templates da API oficial primeiro
            if (officialApiTemplates.length > 0) {
                let label = `🚀 API Oficial WhatsApp (${officialApiTemplates.length})`;
                
                // Se há templates específicos de caixa, mostrar nome da caixa
                if (inboxSpecificTemplates.length > 0) {
                    const inboxName = inboxSpecificTemplates[0].inboxName;
                    label = `🚀 ${inboxName} - API Oficial (${officialApiTemplates.length})`;
                }
                
                const optgroup = document.createElement('optgroup');
                optgroup.label = label;
                
                officialApiTemplates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.name;
                    option.textContent = template.displayName || template.name;
                    const sourceText = template.inboxName ? `Caixa: ${template.inboxName}` : 'API Oficial';
                    option.title = `Fonte: ${sourceText} | Status: ${template.status} | Categoria: ${template.category} | Idioma: ${template.language}`;
                    optgroup.appendChild(option);
                });
                
                select.appendChild(optgroup);
            }
            
            // Mostrar templates do Chatwoot depois
            if (chatwootTemplates.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `📱 Chatwoot (${chatwootTemplates.length})`;
                
                chatwootTemplates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.name;
                    option.textContent = template.displayName || template.name;
                    option.title = `Fonte: Chatwoot | Status: ${template.status} | Categoria: ${template.category} | Idioma: ${template.language}`;
                    optgroup.appendChild(option);
                });
                
                select.appendChild(optgroup);
            }
            
            // Se não há grupos, mostrar normalmente
            if (officialApiTemplates.length === 0 && chatwootTemplates.length === 0) {
                templates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.name;
                    option.textContent = template.displayName || template.name;
                    option.title = `Status: ${template.status} | Categoria: ${template.category} | Idioma: ${template.language}`;
                    select.appendChild(option);
                });
            }
            
            console.log(`✅ ${templates.length} templates carregados com sucesso`);
            console.log(`📊 API Oficial: ${officialApiTemplates.length}, Chatwoot: ${chatwootTemplates.length}`);
            
            // Mostrar indicador se templates são específicos de uma caixa
            if (inboxSpecificTemplates.length > 0) {
                showInboxTemplateIndicator(inboxSpecificTemplates[0].inboxName, officialApiTemplates.length);
            }
        } else {
            console.warn('⚠️ Nenhum template encontrado');
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Nenhum template disponível - Clique em Sincronizar';
            option.disabled = true;
            select.appendChild(option);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar modelos:', error);
        
        // Mostrar erro no select
        const select = document.getElementById('modeloMensagem');
        select.innerHTML = '<option value="">Erro ao carregar templates - Clique em Sincronizar</option>';
        
        // Mostrar alerta se a função showAlert existir
        if (typeof window.app?.showAlert === 'function') {
            window.app.showAlert('Erro ao carregar modelos de mensagem. Tente sincronizar os templates.', 'danger');
        }
    }
}

// Sincronizar templates do WhatsApp
async function syncTemplates() {
    const syncButton = document.getElementById('syncTemplatesBtn');
    const originalText = syncButton.innerHTML;
    
    try {
        // Atualizar botão para mostrar carregamento
        syncButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        syncButton.disabled = true;
        
        console.log('🔄 Iniciando sincronização de templates...');
        
        // Obter conta e caixa selecionadas para sincronização específica
        const accountId = selectedAccountId || document.getElementById('accountSelect')?.value;
        const inboxId = selectedInboxId || document.getElementById('inboxSelect')?.value;
        
        let url = '/api/chatwoot/templates/sync';
        const params = new URLSearchParams();
        if (accountId) params.append('accountId', accountId);
        if (inboxId) params.append('inboxId', inboxId);
        if (params.toString()) url += `?${params.toString()}`;
        
        console.log(`🔄 Sincronizando para Account: ${accountId}, Inbox: ${inboxId}`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Sincronização bem-sucedida:', result);
            
            // Verificar se foi via API oficial
            let alertMessage = result.message;
            let alertType = 'success';
            
            if (result.source === 'whatsapp_official_api') {
                alertMessage = `🚀 ${result.message} (API Oficial do WhatsApp)`;
                alertType = 'success';
            } else if (result.results?.some(r => r.method === 'whatsapp_official_api' && r.status === 'failed')) {
                alertMessage = `⚠️ ${result.message} (Chatwoot - API oficial falhou)`;
                alertType = 'warning';
            }
            
            if (typeof window.app?.showAlert === 'function') {
                window.app.showAlert(alertMessage, alertType);
            }
            
            // Aguardar um pouco e recarregar templates
            setTimeout(() => {
                loadModelos();
            }, 1500);
            
        } else {
            console.warn('⚠️ Sincronização parcial:', result);
            
            if (typeof window.app?.showAlert === 'function') {
                window.app.showAlert(result.message || 'Falha na sincronização', 'warning');
            }
        }
        
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        
        if (typeof window.app?.showAlert === 'function') {
            window.app.showAlert('Erro ao sincronizar templates. Verifique a conexão.', 'danger');
        }
    } finally {
        // Restaurar botão
        setTimeout(() => {
            syncButton.innerHTML = originalText;
            syncButton.disabled = false;
        }, 1000);
    }
}

// Carregar tags disponíveis via API para autocomplete
async function loadTags() {
    try {
        const response = await fetch('/api/chatwoot/tags', {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const tags = await response.json();
        // Implementar autocomplete simples ou datalist
        const input = document.getElementById('tagNome');
        const datalist = document.createElement('datalist');
        datalist.id = 'tagsList';
        input.setAttribute('list', 'tagsList');
        tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.title || tag.name;
            datalist.appendChild(option);
        });
        input.parentNode.appendChild(datalist);
    } catch (error) {
        console.error('Erro ao carregar tags:', error);
    }
}

// Carregar lista de campanhas
async function loadCampanhasList() {
    try {
        const response = await fetch('/api/campaigns', {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const campanhas = await response.json();
        
        // Criar div para exibir campanhas
        showCampanhasList(campanhas);
    } catch (error) {
        console.error('Erro ao carregar campanhas:', error);
        window.app.showAlert('Erro ao carregar campanhas', 'danger');
    }
}

// Exibir lista de campanhas com estatísticas detalhadas
function showCampanhasList(campanhas) {
    // Criar div para listagem de campanhas
    let container = document.getElementById('campanhasListDiv');
    if (!container) {
        container = document.createElement('div');
        container.id = 'campanhasListDiv';
        container.className = 'position-fixed top-0 start-0 w-100 h-100 bg-white z-3 p-4 overflow-auto';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }
    
    container.innerHTML = `
        <div class="container">
            <div class="row">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h3>Campanhas WhatsApp</h3>
                        <button class="btn btn-secondary" onclick="fecharListaCampanhas()">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                    <div class="row">
                        ${campanhas.map(campanha => {
                            const totalContacts = parseInt(campanha.total_contacts || 0);
                            const sentCount = parseInt(campanha.sent_count || 0);
                            const failedCount = parseInt(campanha.failed_count || 0);
                            const pendingCount = parseInt(campanha.pending_count || 0);
                            const successRate = totalContacts > 0 ? ((sentCount / totalContacts) * 100).toFixed(1) : 0;
                            
                            return `
                                <div class="col-md-6 mb-3">
                                    <div class="card">
                                        <div class="card-body">
                                            <h5 class="card-title">${campanha.name}</h5>
                                            <p class="card-text">
                                                <strong>Status:</strong> 
                                                <span class="badge bg-${getStatusColor(campanha.status)}">${campanha.status}</span>
                                            </p>
                                            
                                            <!-- Estatísticas detalhadas -->
                                            ${totalContacts > 0 ? `
                                                <div class="mb-3">
                                                    <h6>📊 Estatísticas:</h6>
                                                    <div class="row text-center">
                                                        <div class="col-3">
                                                            <div class="text-muted">Total</div>
                                                            <div class="fw-bold">${totalContacts}</div>
                                                        </div>
                                                        <div class="col-3">
                                                            <div class="text-success">Enviados</div>
                                                            <div class="fw-bold text-success">${sentCount}</div>
                                                        </div>
                                                        <div class="col-3">
                                                            <div class="text-danger">Falhas</div>
                                                            <div class="fw-bold text-danger">${failedCount}</div>
                                                        </div>
                                                        <div class="col-3">
                                                            <div class="text-warning">Pendentes</div>
                                                            <div class="fw-bold text-warning">${pendingCount}</div>
                                                        </div>
                                                    </div>
                                                    <div class="mt-2">
                                                        <div class="progress" style="height: 20px;">
                                                            <div class="progress-bar bg-success" style="width: ${(sentCount/totalContacts)*100}%"></div>
                                                            <div class="progress-bar bg-danger" style="width: ${(failedCount/totalContacts)*100}%"></div>
                                                            <div class="progress-bar bg-warning" style="width: ${(pendingCount/totalContacts)*100}%"></div>
                                                        </div>
                                                        <small class="text-muted">Taxa de sucesso: ${successRate}%</small>
                                                    </div>
                                                </div>
                                            ` : ''}
                                            
                                            <p class="card-text">
                                                <strong>Tipo:</strong> ${campanha.type}<br>
                                                <strong>Template:</strong> ${campanha.template_name}<br>
                                                <strong>Criada:</strong> ${new Date(campanha.created_at).toLocaleString()}
                                                ${campanha.scheduled_at ? `<br><strong>Agendada:</strong> ${new Date(campanha.scheduled_at).toLocaleString()}` : ''}
                                            </p>
                                            
                                            <div class="d-flex gap-2 flex-wrap">
                                                ${['pending', 'running'].includes(campanha.status) ? 
                                                    `<button class="btn btn-sm btn-danger" onclick="cancelarCampanha(${campanha.id})">
                                                        <i class="fas fa-stop"></i> Cancelar
                                                    </button>` : 
                                                    `<span class="text-muted">Finalizada</span>`
                                                }
                                                <button class="btn btn-sm btn-info" onclick="verStatusCampanha(${campanha.id})">
                                                    <i class="fas fa-chart-line"></i> Ver Status
                                                </button>
                                                ${failedCount > 0 ? `
                                                    <button class="btn btn-sm btn-warning" onclick="reenviarCampanha(${campanha.id})">
                                                        <i class="fas fa-redo"></i> Reenviar Erros (${failedCount})
                                                    </button>
                                                    <button class="btn btn-sm btn-outline-danger" onclick="verErrosCampanha(${campanha.id})">
                                                        <i class="fas fa-exclamation-triangle"></i> Ver Erros
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.style.display = 'block';
}

function getStatusColor(status) {
    switch(status) {
        case 'completed': return 'success';
        case 'running': return 'warning';
        case 'pending': return 'info';
        case 'cancelled': return 'secondary';
        case 'error': return 'danger';
        default: return 'secondary';
    }
}

// Função para obter token de autenticação
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// Função para cancelar campanha
async function cancelarCampanha(campanhaId) {
    if (!confirm('Tem certeza que deseja cancelar esta campanha?')) return;
    
    try {
        const response = await fetch(`/api/campaigns/${campanhaId}/cancel`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        const result = await response.json();
        if (result.success) {
            window.app.showAlert('Campanha cancelada com sucesso!', 'success');
            loadCampanhasList(); // Recarregar lista
        } else {
            window.app.showAlert('Erro ao cancelar campanha: ' + result.error, 'danger');
        }
    } catch (error) {
        console.error('Erro ao cancelar campanha:', error);
        window.app.showAlert('Erro ao cancelar campanha', 'danger');
    }
}

// Função para ver status detalhado da campanha
async function verStatusCampanha(campanhaId) {
    try {
        const response = await fetch(`/api/campaigns/${campanhaId}/status`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const status = await response.json();
        
        const resumo = status.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {});
        
        const statusText = Object.entries(resumo)
            .map(([status, count]) => `${status}: ${count}`)
            .join('\n');
            
        alert(`Status dos envios:\n\n${statusText}`);
    } catch (error) {
        console.error('Erro ao carregar status:', error);
        window.app.showAlert('Erro ao carregar status da campanha', 'danger');
    }
}

// Função para reenviar campanhas com erro
async function reenviarCampanha(campanhaId) {
    if (!confirm('Tem certeza que deseja reenviar as mensagens que falharam?')) return;
    
    try {
        const response = await fetch(`/api/campaigns/${campanhaId}/retry`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        const result = await response.json();
        if (result.success) {
            window.app.showAlert(`Reenvio iniciado para ${result.retryCount} contato(s)!`, 'success');
            // Aguardar um pouco e recarregar a lista
            setTimeout(() => loadCampanhasList(), 1000);
        } else {
            window.app.showAlert('Erro ao reenviar campanha: ' + result.message, 'warning');
        }
    } catch (error) {
        console.error('Erro ao reenviar campanha:', error);
        window.app.showAlert('Erro ao reenviar campanha', 'danger');
    }
}

// Função para ver erros detalhados de uma campanha
async function verErrosCampanha(campanhaId) {
    try {
        const response = await fetch(`/api/campaigns/${campanhaId}/errors`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const erros = await response.json();
        
        if (erros.length === 0) {
            alert('Nenhum erro encontrado para esta campanha.');
            return;
        }
        
        // Criar div simples para mostrar erros
        const errorDiv = document.createElement('div');
        errorDiv.className = 'position-fixed top-0 start-0 w-100 h-100 bg-white p-4 overflow-auto';
        errorDiv.style.zIndex = '99999';
        errorDiv.innerHTML = `
            <div class="container">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h5>🚨 Erros da Campanha</h5>
                    <button class="btn btn-secondary" onclick="this.closest('.position-fixed').remove()">Fechar</button>
                    </div>
                        <div class="alert alert-warning">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>${erros.length}</strong> contato(s) com erro de envio:
                        </div>
                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Nome</th>
                                        <th>Telefone</th>
                                        <th>Erro</th>
                                        <th>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${erros.map(erro => `
                                        <tr>
                                            <td>${erro.name || 'N/A'}</td>
                                            <td>${erro.phone || erro.contact_id}</td>
                                            <td>
                                                <small class="text-danger">
                                                    ${erro.error_message || 'Erro desconhecido'}
                                                </small>
                                            </td>
                                            <td>
                                                <small class="text-muted">
                                                    ${new Date(erro.created_at).toLocaleString()}
                                                </small>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                <div class="mt-3">
                    <button class="btn btn-warning" onclick="reenviarCampanha(${campanhaId}); this.closest('.position-fixed').remove();">
                            <i class="fas fa-redo"></i> Reenviar Todos
                        </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
        
    } catch (error) {
        console.error('Erro ao carregar erros da campanha:', error);
        window.app.showAlert('Erro ao carregar erros da campanha', 'danger');
    }
}

// Função para fechar lista de campanhas
function fecharListaCampanhas() {
    const container = document.getElementById('campanhasListDiv');
    if (container) {
        container.remove();
    }
}

// Função para mostrar informações da conta/caixa selecionada no modal de campanha
function showSelectedAccountInbox() {
    try {
        // Buscar nomes da conta e caixa baseado nos IDs selecionados
        let accountName = selectedAccountId;
        let inboxName = selectedInboxId;
        
        if (window.app && window.app.accounts && window.app.accounts.length > 0) {
            const account = window.app.accounts.find(acc => String(acc.id) === String(selectedAccountId));
            if (account) accountName = account.name;
        }
        
        if (window.app && window.app.inboxes && window.app.inboxes.length > 0) {
            const inbox = window.app.inboxes.find(inb => String(inb.id) === String(selectedInboxId));
            if (inbox) inboxName = inbox.name;
        }
        
        // Encontrar elemento para mostrar as informações (pode estar no cabeçalho do modal)
        const campanhaHeader = document.querySelector('#campanhasDiv .modal-header h5, #campanhasDiv .card-header h5');
        if (campanhaHeader) {
            // Remover indicador anterior se existir
            const existingIndicator = document.getElementById('selectedAccountInboxIndicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            // Criar novo indicador
            const indicator = document.createElement('div');
            indicator.id = 'selectedAccountInboxIndicator';
            indicator.className = 'mt-2 mb-3';
            indicator.innerHTML = `
                <div class="alert alert-info mb-0 py-2">
                    <i class="fas fa-info-circle me-2"></i>
                    <strong>Conta:</strong> ${accountName} | 
                    <strong>Caixa:</strong> ${inboxName}
                </div>
            `;
            
            // Inserir após o cabeçalho
            campanhaHeader.parentNode.insertBefore(indicator, campanhaHeader.nextSibling);
            
            console.log(`📍 Campanha será criada para: Conta "${accountName}" | Caixa "${inboxName}"`);
        }
        
    } catch (error) {
        console.warn('Erro ao mostrar informações da conta/caixa:', error);
    }
}

// ===== GERENCIAMENTO DE MÍDIA =====

// Variáveis globais para gerenciamento de mídia
let currentMediaFiles = [];
let fileToDelete = null;

// Função para mostrar o gerenciador de mídia
function showMediaManager() {
    window.app.showDiv('mediaManagerDiv');
    
    // Carregar arquivos ao abrir
    loadMediaFiles();
    
    // Inicializar eventos se ainda não foi feito
    initMediaEventListeners();
}

// Inicializar event listeners do gerenciamento de mídia
function initMediaEventListeners() {
    // Verificar se já foi inicializado
    if (window.mediaEventListenersInitialized) {
        return;
    }
    window.mediaEventListenersInitialized = true;
    
    // Upload form
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleFileUpload);
    }
    
    // Close button
    const closeMediaManager = document.getElementById('closeMediaManager');
    if (closeMediaManager) {
        closeMediaManager.addEventListener('click', function() {
            window.app.hideDiv('mediaManagerDiv');
        });
    }
}

// Função para fazer upload de arquivo
async function handleFileUpload(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('mediaFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = progressDiv.querySelector('.progress-bar');
    const successDiv = document.getElementById('uploadSuccess');
    const errorDiv = document.getElementById('uploadError');
    
    // Limpar mensagens anteriores
    successDiv.classList.add('d-none');
    errorDiv.classList.add('d-none');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showUploadError('Por favor, selecione um arquivo.');
        return;
    }
    
    const file = fileInput.files[0];
    
    // Validar tamanho (16MB)
    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
        showUploadError('Arquivo muito grande. Máximo permitido: 16MB');
        return;
    }
    
    // Validar tipo
    const allowedTypes = [
        'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/quicktime',
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg'
    ];
    
    if (!allowedTypes.includes(file.type)) {
        showUploadError('Tipo de arquivo não suportado: ' + file.type);
        return;
    }
    
    // Preparar formulário
    const formData = new FormData();
    formData.append('media', file);
    
    try {
        // Mostrar progresso
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Enviando...';
        progressDiv.classList.remove('d-none');
        
        // Simular progresso (já que fetch não suporta progresso de upload nativo)
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 30;
            if (progress > 90) progress = 90;
            progressBar.style.width = progress + '%';
        }, 200);
        
        const response = await fetch('/api/upload-media', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: formData
        });
        
        clearInterval(progressInterval);
        progressBar.style.width = '100%';
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Sucesso
            showUploadSuccess('Arquivo carregado com sucesso: ' + result.file.originalname);
            
            // Limpar formulário
            uploadForm.reset();
            
            // Recarregar lista de arquivos
            setTimeout(() => {
                loadMediaFiles();
                progressDiv.classList.add('d-none');
            }, 1000);
            
        } else {
            throw new Error(result.error || 'Erro no upload');
        }
        
    } catch (error) {
        console.error('Erro no upload:', error);
        showUploadError('Erro no upload: ' + error.message);
        progressDiv.classList.add('d-none');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload me-2"></i>Fazer Upload';
    }
}

// Carregar lista de arquivos de mídia
async function loadMediaFiles() {
    const listContainer = document.getElementById('mediaFilesList');
    
    try {
        // Mostrar loading
        listContainer.innerHTML = `
            <div class="text-center">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
            </div>
        `;
        
        const response = await fetch('/api/media-files', {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            currentMediaFiles = result.files;
            renderMediaFilesList(result.files);
        } else {
            throw new Error(result.error || 'Erro ao carregar arquivos');
        }
        
    } catch (error) {
        console.error('Erro ao carregar arquivos:', error);
        listContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Erro ao carregar arquivos: ${error.message}
            </div>
        `;
    }
}

// Renderizar lista de arquivos
function renderMediaFilesList(files) {
    const listContainer = document.getElementById('mediaFilesList');
    
    if (!files || files.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-folder-open fa-3x mb-3"></i>
                <h6>Nenhum arquivo encontrado</h6>
                <p>Faça upload de arquivos para começar a usar mídia nos workflows.</p>
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th style="width: 40%;">
                            <i class="fas fa-eye me-2 text-primary"></i>Preview & Arquivo
                        </th>
                        <th style="width: 10%;">Tipo</th>
                        <th style="width: 10%;">Tamanho</th>
                        <th style="width: 12%;">Data</th>
                        <th style="width: 15%;">ID</th>
                        <th style="width: 13%;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${files.map(file => renderFileRow(file)).join('')}
                </tbody>
            </table>
        </div>
        
        <style>
        .file-preview {
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        
        .file-preview:hover {
            transform: scale(1.02);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        
        .video-preview, .audio-preview {
            cursor: pointer;
        }
        
        .image-preview img {
            transition: opacity 0.2s ease;
        }
        
        .image-preview img:hover {
            opacity: 0.8;
        }
        
        .table tbody tr:hover .file-preview {
            transform: scale(1.05);
        }
        
        .file-preview i {
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
        </style>
    `;
}

// Gerar preview visual do arquivo
function generateFilePreview(file) {
    const previewSize = '60px';
    
    if (file.mimetype.startsWith('image/')) {
        // Para imagens: mostrar miniatura real
        return `
            <div class="file-preview image-preview position-relative" style="width: ${previewSize}; height: ${previewSize};" 
                 onclick="showImageModal('${file.id}', '${escapeHtml(file.original_name)}')" 
                 title="Clique para ampliar">
                <img src="/public-preview/${file.id}" 
                     alt="${escapeHtml(file.original_name)}"
                     class="img-fluid rounded border"
                     style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjZjhmOWZhIiBzdHJva2U9IiNkZWUyZTYiLz4KPHN2ZyB4PSIyMCIgeT0iMjAiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzZjNzU3ZCI+CjxwYXRoIGQ9Im0zIDlhMSAxIDAgMCAwIC0xIDFhMSAxIDAgMCAwIDEgMWwxIDFhMyAzIDAgMCAwIDQgMGwxLTFhMSAxIDAgMCAwIDEtMWExIDEgMCAwIDAtMS0xaC00LjVsLS4yOC0uNjhoMSAxIDAgMCAwIC0uOTItLjMyaC0yLjVhMSAxIDAgMCAwIC0uOTIuMzJsLS4yOC42OGgtMS41eiIvPgo8L3N2Zz4KPC9zdmc+'" />
                <div class="position-absolute top-0 end-0" style="margin: 2px;">
                    <small class="badge bg-dark bg-opacity-75 text-white" style="font-size: 10px;">
                        <i class="fas fa-search-plus"></i>
                    </small>
                </div>
            </div>
        `;
    } else if (file.mimetype.startsWith('video/')) {
        // Para vídeos: tentar mostrar frame do vídeo ou usar ícone estilizado
        return `
            <div class="file-preview video-preview position-relative" style="width: ${previewSize}; height: ${previewSize};" 
                 onclick="showVideoInfo('${file.id}', '${escapeHtml(file.original_name)}')" 
                 title="Clique para ver informações do vídeo">
                <video 
                    src="/public-preview/${file.id}" 
                    class="img-fluid rounded border"
                    style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                    muted
                    preload="metadata"
                    onloadedmetadata="this.currentTime = 1"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                </video>
                <div class="d-none align-items-center justify-content-center rounded border bg-gradient" 
                     style="width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); position: absolute; top: 0; left: 0;">
                    <i class="fas fa-play text-white" style="font-size: 20px;"></i>
                </div>
                <div class="position-absolute top-0 end-0" style="margin: 2px;">
                    <small class="badge bg-dark bg-opacity-75 text-white" style="font-size: 10px;">
                        <i class="fas fa-play"></i>
                    </small>
                </div>
            </div>
        `;
    } else if (file.mimetype.startsWith('audio/')) {
        // Para áudios: preview estilizado com ícone musical
        return `
            <div class="file-preview audio-preview" style="width: ${previewSize}; height: ${previewSize};">
                <div class="d-flex align-items-center justify-content-center rounded border bg-gradient" 
                     style="width: 100%; height: 100%; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                    <i class="fas fa-music text-white" style="font-size: 18px;"></i>
                </div>
            </div>
        `;
    } else {
        // Para outros tipos: preview genérico
        return `
            <div class="file-preview document-preview" style="width: ${previewSize}; height: ${previewSize};">
                <div class="d-flex align-items-center justify-content-center rounded border bg-light" 
                     style="width: 100%; height: 100%;">
                    <i class="fas fa-file text-secondary" style="font-size: 18px;"></i>
                </div>
            </div>
        `;
    }
}

// Renderizar linha da tabela para um arquivo
function renderFileRow(file) {
    const fileSize = formatFileSize(file.size);
    const uploadDate = new Date(file.upload_date).toLocaleDateString('pt-BR');
    const fileIcon = getFileIcon(file.mimetype);
    const fileTypeDisplay = getFileTypeDisplay(file.mimetype);
    const preview = generateFilePreview(file);
    
    return `
        <tr>
            <td>
                <div class="d-flex align-items-center">
                    ${preview}
                    <div class="ms-3">
                        <div class="fw-bold">${escapeHtml(file.original_name)}</div>
                        <small class="text-muted">${escapeHtml(file.filename)}</small>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge bg-secondary">${fileTypeDisplay}</span>
            </td>
            <td>${fileSize}</td>
            <td>${uploadDate}</td>
            <td>
                <small class="text-muted font-monospace">${file.id}</small>
                <button class="btn btn-outline-secondary btn-sm ms-1" onclick="copyFileId('${file.id}')" title="Copiar ID">
                    <i class="fas fa-copy"></i>
                </button>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-info" onclick="showFileDetails('${file.id}')" title="Detalhes">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn btn-outline-success" onclick="copyFileUsage('${file.id}')" title="Copiar código para workflow">
                        <i class="fas fa-code"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="confirmDeleteFile('${file.id}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Função para mostrar detalhes do arquivo
function showFileDetails(fileId) {
    const file = currentMediaFiles.find(f => f.id === fileId);
    if (!file) return;
    
    const fileSize = formatFileSize(file.size);
    const uploadDate = new Date(file.upload_date).toLocaleString('pt-BR');
    const fileIcon = getFileIcon(file.mimetype);
    
    // Criar div simples para detalhes
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'position-fixed top-0 start-0 w-100 h-100 bg-white p-4 overflow-auto';
    detailsDiv.style.zIndex = '99999';
    detailsDiv.innerHTML = `
        <div class="container">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h5><i class="${fileIcon} me-2"></i>Detalhes do Arquivo</h5>
                <button class="btn btn-secondary" onclick="this.closest('.position-fixed').remove()">Fechar</button>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <h6><i class="${fileIcon} me-2"></i>Informações do Arquivo</h6>
                    <table class="table table-sm">
                        <tr><th>Nome Original:</th><td>${escapeHtml(file.original_name)}</td></tr>
                        <tr><th>Nome do Sistema:</th><td><code>${escapeHtml(file.filename)}</code></td></tr>
                        <tr><th>Tipo MIME:</th><td><code>${file.mimetype}</code></td></tr>
                        <tr><th>Tamanho:</th><td>${fileSize}</td></tr>
                        <tr><th>Data Upload:</th><td>${uploadDate}</td></tr>
                        <tr><th>ID do Arquivo:</th><td><code>${file.id}</code></td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6><i class="fas fa-code me-2"></i>Como Usar no Workflow</h6>
                    <div class="bg-light p-3 rounded">
                        <p class="mb-2"><strong>Adicione ao seu bloco:</strong></p>
                        <pre class="mb-0"><code>"media": {
  "attachment": {
    "file_id": "${file.id}"
  }
}</code></pre>
                    </div>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-sm" onclick="copyFileUsage('${file.id}')">
                            <i class="fas fa-copy me-1"></i>Copiar Código
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(detailsDiv);
}

// Confirmar exclusão de arquivo
function confirmDeleteFile(fileId) {
    const file = currentMediaFiles.find(f => f.id === fileId);
    if (!file) return;
    
    fileToDelete = fileId;
    
    const fileSize = formatFileSize(file.size);
    const fileIcon = getFileIcon(file.mimetype);
    
    // Criar div simples para confirmação
    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'position-fixed top-50 start-50 translate-middle bg-white border shadow p-4';
    confirmDiv.style.zIndex = '99999';
    confirmDiv.innerHTML = `
        <h6>Confirmar Exclusão</h6>
        <div class="d-flex align-items-center mb-3">
            <i class="${fileIcon} me-2 text-primary fa-2x"></i>
            <div>
                <div class="fw-bold">${escapeHtml(file.original_name)}</div>
                <small class="text-muted">${file.mimetype} • ${fileSize}</small>
            </div>
        </div>
        <p class="text-danger">Esta ação não pode ser desfeita!</p>
        <div class="d-flex gap-2">
            <button class="btn btn-danger" onclick="executeDeleteFile()">Excluir</button>
            <button class="btn btn-secondary" onclick="this.closest('.position-fixed').remove(); fileToDelete = null;">Cancelar</button>
        </div>
    `;
    
    document.body.appendChild(confirmDiv);
}

// Executar exclusão do arquivo
async function executeDeleteFile() {
    if (!fileToDelete) return;
    
    try {
        const response = await fetch(`/api/media-files/${fileToDelete}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Fechar div de confirmação
            document.querySelector('.position-fixed').remove();
            
            // Mostrar sucesso
            window.app.showAlert('Arquivo excluído com sucesso!', 'success');
            
            // Recarregar lista
            loadMediaFiles();
            
        } else {
            throw new Error(result.error || 'Erro ao excluir arquivo');
        }
        
    } catch (error) {
        console.error('Erro ao excluir arquivo:', error);
        window.app.showAlert('Erro ao excluir arquivo: ' + error.message, 'danger');
    } finally {
        fileToDelete = null;
    }
}

// Copiar ID do arquivo
function copyFileId(fileId) {
    navigator.clipboard.writeText(fileId).then(() => {
        window.app.showAlert('ID copiado para a área de transferência!', 'success');
    }).catch(() => {
        // Fallback para navegadores antigos
        const textArea = document.createElement('textarea');
        textArea.value = fileId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        window.app.showAlert('ID copiado para a área de transferência!', 'success');
    });
}

// Copiar código de uso do arquivo
function copyFileUsage(fileId) {
    const code = `"media": {
  "attachment": {
    "file_id": "${fileId}"
  }
}`;
    
    navigator.clipboard.writeText(code).then(() => {
        window.app.showAlert('Código copiado para a área de transferência!', 'success');
    }).catch(() => {
        // Fallback para navegadores antigos
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        window.app.showAlert('Código copiado para a área de transferência!', 'success');
    });
}

// Funções utilitárias

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(mimetype) {
    if (mimetype.startsWith('video/')) return 'fas fa-file-video';
    if (mimetype.startsWith('image/')) return 'fas fa-file-image';
    if (mimetype.startsWith('audio/')) return 'fas fa-file-audio';
    return 'fas fa-file';
}

function getFileTypeDisplay(mimetype) {
    if (mimetype.startsWith('video/')) return 'Vídeo';
    if (mimetype.startsWith('image/')) return 'Imagem';
    if (mimetype.startsWith('audio/')) return 'Áudio';
    return 'Arquivo';
}

// Mostrar modal com imagem em tamanho completo
function showImageModal(fileId, fileName) {
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modal.style.zIndex = '99999';
    
    modal.innerHTML = `
        <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content bg-dark">
                <div class="modal-header bg-dark text-white border-secondary">
                    <h5 class="modal-title">
                        <i class="fas fa-image me-2"></i>${escapeHtml(fileName)}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" onclick="this.closest('.modal').remove()"></button>
                </div>
                <div class="modal-body bg-dark text-center p-2">
                    <img src="/public-preview/${fileId}" 
                         alt="${escapeHtml(fileName)}"
                         class="img-fluid rounded"
                         style="max-height: 70vh; max-width: 100%; object-fit: contain;"
                         onerror="this.parentElement.innerHTML='<div class=\\"text-white\\"><i class=\\"fas fa-exclamation-triangle\\"></i> Erro ao carregar imagem</div>'" />
                </div>
                <div class="modal-footer bg-dark border-secondary justify-content-center">
                    <button class="btn btn-outline-light btn-sm" onclick="copyFileId('${fileId}')">
                        <i class="fas fa-copy me-1"></i>Copiar ID
                    </button>
                    <button class="btn btn-outline-primary btn-sm" onclick="copyFileUsage('${fileId}')">
                        <i class="fas fa-code me-1"></i>Copiar Código
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times me-1"></i>Fechar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Fechar modal ao clicar fora
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Fechar modal com ESC
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    document.body.appendChild(modal);
}

// Mostrar informações do vídeo
function showVideoInfo(fileId, fileName) {
    const file = currentMediaFiles.find(f => f.id === fileId);
    if (!file) return;
    
    const fileSize = formatFileSize(file.size);
    const uploadDate = new Date(file.upload_date).toLocaleString('pt-BR');
    
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modal.style.zIndex = '99999';
    
    modal.innerHTML = `
        <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content bg-dark">
                <div class="modal-header bg-dark text-white border-secondary">
                    <h5 class="modal-title">
                        <i class="fas fa-video me-2"></i>${escapeHtml(fileName)}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" onclick="this.closest('.modal').remove()"></button>
                </div>
                <div class="modal-body bg-dark text-center p-3">
                    <video 
                        src="/public-preview/${fileId}" 
                        controls 
                        class="img-fluid rounded mb-3"
                        style="max-height: 60vh; max-width: 100%;"
                        onerror="this.parentElement.innerHTML='<div class=\\"text-white\\"><i class=\\"fas fa-exclamation-triangle\\"></i> Erro ao carregar vídeo</div>'">
                    </video>
                    <div class="text-white">
                        <small>
                            <strong>Tamanho:</strong> ${fileSize} | 
                            <strong>Tipo:</strong> ${file.mimetype} | 
                            <strong>Data:</strong> ${uploadDate}
                        </small>
                    </div>
                </div>
                <div class="modal-footer bg-dark border-secondary justify-content-center">
                    <button class="btn btn-outline-light btn-sm" onclick="copyFileId('${fileId}')">
                        <i class="fas fa-copy me-1"></i>Copiar ID
                    </button>
                    <button class="btn btn-outline-primary btn-sm" onclick="copyFileUsage('${fileId}')">
                        <i class="fas fa-code me-1"></i>Copiar Código
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times me-1"></i>Fechar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Fechar modal ao clicar fora
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Fechar modal com ESC
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    document.body.appendChild(modal);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showUploadSuccess(message) {
    const successDiv = document.getElementById('uploadSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('d-none');
}

function showUploadError(message) {
    const errorDiv = document.getElementById('uploadError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('d-none');
}

// Função para adicionar estilos CSS para o preview dos workflows
function addWorkflowPreviewStyles() {
    // Verificar se os estilos já foram adicionados
    if (document.getElementById('workflow-preview-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'workflow-preview-styles';
    style.textContent = `
        .block-actions {
            margin: 8px 0;
            padding: 8px;
            background-color: #f8f9fa;
            border-radius: 4px;
            border-left: 3px solid #007bff;
        }
        
        .block-action-info {
            font-size: 12px;
            color: #495057;
            margin: 2px 0;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .block-button {
            position: relative !important;
            cursor: help !important;
            transition: all 0.2s ease !important;
        }
        
        .block-button:hover {
            transform: scale(1.05) !important;
            background-color: #0d6efd !important;
            color: white !important;
            box-shadow: 0 2px 8px rgba(13, 110, 253, 0.3) !important;
        }
        
        .workflow-block {
            border: 2px solid #e9ecef;
            border-radius: 8px;
            margin-bottom: 16px;
            transition: border-color 0.2s ease;
        }
        
        .workflow-block:hover {
            border-color: #007bff;
        }
        
        .block-buttons {
            margin-top: 8px;
        }
        
        .block-button {
            display: inline-block;
            margin: 2px 4px;
            padding: 4px 8px;
            background-color: #e9ecef;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            font-size: 12px;
            color: #495057;
        }
        
        /* Estilos para mídia dos blocos */
        .block-media {
            margin: 12px 0;
            padding: 12px;
            background-color: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #dc3545;
        }
        
        .media-card {
            display: flex;
            gap: 12px;
            align-items: flex-start;
        }
        
        .media-thumbnail {
            position: relative;
            flex-shrink: 0;
            width: 160px;
            height: 90px;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .youtube-thumbnail {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.2s ease;
            border-radius: 4px;
        }
        
        .media-thumbnail:hover .youtube-thumbnail {
            transform: scale(1.05);
        }
        
        /* Placeholder para YouTube */
        .youtube-placeholder {
            background: linear-gradient(135deg, #ff0000, #cc0000);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            border-radius: 4px;
        }
        
        .placeholder-content {
            text-align: center;
            color: white;
        }
        
        .youtube-logo {
            font-size: 28px;
            margin-bottom: 8px;
        }
        
        .placeholder-text {
            font-size: 11px;
        }
        
        .video-title {
            font-weight: bold;
            margin-bottom: 4px;
        }
        
        .video-id {
            opacity: 0.8;
            font-size: 10px;
        }
        
        .play-overlay {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-size: 24px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            transition: transform 0.2s ease;
        }
        
        .media-thumbnail:hover .play-overlay {
            transform: translate(-50%, -50%) scale(1.1);
        }
        
        .media-info {
            flex: 1;
            min-width: 0;
        }
        
        .media-title {
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: 600;
            color: #495057;
            display: flex;
            align-items: center;
        }
        
        .media-description {
            margin: 0 0 8px 0;
            font-size: 12px;
            color: #6c757d;
            line-height: 1.4;
            white-space: pre-line;
        }
        
        .media-url {
            font-size: 11px;
            color: #6c757d;
            display: block;
            margin-bottom: 0;
        }
        
        .media-url a {
            color: #0d6efd;
            word-break: break-all;
        }
        
        .media-file-id {
            font-size: 11px;
            color: #6c757d;
        }
        
        .media-file-id code {
            background-color: #e9ecef;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 10px;
        }
        
        /* Responsividade para thumbnails */
        @media (max-width: 576px) {
            .media-card {
                flex-direction: column;
            }
            
            .media-thumbnail {
                width: 100%;
                max-width: 280px;
                height: 157px;
                align-self: center;
            }
        }
    `;
    
    document.head.appendChild(style);
}

// Função global para mostrar senha div
function showChangePasswordDiv() {
    if (window.app) {
        window.app.showChangePasswordDiv();
    }
}

// Função para tratar erro de thumbnail do YouTube
function handleThumbnailError(thumbnailId, videoId) {
    console.log(`Erro ao carregar thumbnail para vídeo ${videoId}, tentando fallbacks...`);
    
    const img = document.getElementById(thumbnailId);
    if (!img) return;
    
    // Lista de URLs de thumbnail para tentar como fallback
    const fallbackUrls = [
        `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/default.jpg`,
        `https://img.youtube.com/vi/${videoId}/1.jpg`,
        `https://img.youtube.com/vi/${videoId}/2.jpg`,
        `https://img.youtube.com/vi/${videoId}/3.jpg`
    ];
    
    // Tentar próximo fallback
    if (!img.dataset.fallbackIndex) {
        img.dataset.fallbackIndex = '0';
    }
    
    const currentIndex = parseInt(img.dataset.fallbackIndex);
    
    if (currentIndex < fallbackUrls.length) {
        img.dataset.fallbackIndex = (currentIndex + 1).toString();
        img.src = fallbackUrls[currentIndex];
    } else {
        // Se todos os fallbacks falharam, usar um placeholder personalizado
        createYouTubePlaceholder(img, videoId);
    }
}

// Criar placeholder personalizado para vídeo do YouTube
function createYouTubePlaceholder(img, videoId) {
    const container = img.parentElement;
    if (!container) return;
    
    console.log(`Criando placeholder para vídeo ${videoId}`);
    
    try {
        // Criar div placeholder com CSS
        const placeholder = document.createElement('div');
        placeholder.className = 'youtube-thumbnail youtube-placeholder';
        placeholder.innerHTML = `
            <div class="placeholder-content">
                <div class="youtube-logo">
                    <i class="fab fa-youtube"></i>
                </div>
                <div class="placeholder-text">
                    <div class="video-title">YouTube Video</div>
                    <div class="video-id">ID: ${videoId}</div>
                </div>
            </div>
        `;
        
        // Substituir a imagem pelo placeholder
        container.replaceChild(placeholder, img);
        
    } catch (error) {
        console.error('Erro ao criar placeholder:', error);
        
        // Fallback ultra simples - apenas esconder a imagem quebrada
        img.style.display = 'none';
        
        // Adicionar texto simples
        const textPlaceholder = document.createElement('div');
        textPlaceholder.className = 'youtube-thumbnail simple-placeholder';
        textPlaceholder.innerHTML = `
            <div style="
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100%; 
                background: linear-gradient(135deg, #ff0000, #cc0000); 
                color: white; 
                font-weight: bold;
                border-radius: 4px;
                flex-direction: column;
            ">
                <i class="fab fa-youtube" style="font-size: 24px; margin-bottom: 8px;"></i>
                <div style="font-size: 12px;">YouTube Video</div>
                <div style="font-size: 10px; opacity: 0.8;">${videoId}</div>
            </div>
        `;
        
        container.appendChild(textPlaceholder);
    }
}

function showAlert(message, type = 'info') {
    // Usar o método existente da classe principal se disponível
    if (window.app && window.app.showAlert) {
        window.app.showAlert(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}