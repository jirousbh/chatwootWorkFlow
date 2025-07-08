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
        // Limpar qualquer backdrop que possa estar presente
        const existingBackdrops = document.querySelectorAll('.modal-backdrop');
        existingBackdrops.forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        
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
        // Remover qualquer backdrop existente
        const existingBackdrops = document.querySelectorAll('.modal-backdrop');
        existingBackdrops.forEach(backdrop => backdrop.remove());
        
        document.getElementById('app').classList.add('d-none');
        const loginModalEl = document.getElementById('loginModal');
        
        // Garantir que não há instância prévia
        const existingModal = bootstrap.Modal.getInstance(loginModalEl);
        if (existingModal) {
            existingModal.dispose();
        }
        
        const loginModal = new bootstrap.Modal(loginModalEl, {
            backdrop: 'static',
            keyboard: false
        });
        loginModal.show();
        
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
        try {
            // Fechar e esconder completamente o modal de login
            const loginModalEl = document.getElementById('loginModal');
            if (loginModalEl) {
                // Verificar se há instância do modal
                const loginModal = bootstrap.Modal.getInstance(loginModalEl);
                if (loginModal) {
                    loginModal.hide();
                    loginModal.dispose(); // Remover instância completamente
                }
                
                // Forçar que o modal seja escondido
                loginModalEl.classList.remove('show');
                loginModalEl.style.display = 'none';
                loginModalEl.setAttribute('aria-hidden', 'true');
                loginModalEl.removeAttribute('aria-modal');
                loginModalEl.removeAttribute('role');
            }
            
            // Limpar todos os backdrops e estilos do body
            const backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(backdrop => backdrop.remove());
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
            
            // Mostrar app
            document.getElementById('app').classList.remove('d-none');
            document.getElementById('currentUser').textContent = this.user.username;
            
            // Adiciona listener para o modal de senha (evitar duplicados)
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
        } catch (error) {
            console.error('Erro em showApp:', error);
        }
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
        
        // Limpar qualquer modal/backdrop antes de mostrar login
        const allModals = document.querySelectorAll('.modal');
        allModals.forEach(modal => {
            const instance = bootstrap.Modal.getInstance(modal);
            if (instance) {
                instance.hide();
                instance.dispose();
            }
            modal.classList.remove('show');
            modal.style.display = 'none';
        });
        
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        
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

    async loadActiveWorkflows() {
        try {
            this.activeWorkflows = await this.apiRequest('/api/inbox-workflows');
            this.populateActiveWorkflows();
        } catch (error) {
            console.error('Erro ao carregar fluxos ativos:', error);
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
            
            // Inicializar tooltips do Bootstrap após renderizar
            setTimeout(() => {
                this.initializeTooltips();
            }, 100);
        } catch (error) {
            preview.innerHTML = '<p class="text-danger">Erro ao parsear JSON</p>';
        }
    }

    initializeTooltips() {
        // Destruir tooltips existentes primeiro
        const existingTooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        existingTooltips.forEach(element => {
            const tooltip = bootstrap.Tooltip.getInstance(element);
            if (tooltip) {
                tooltip.dispose();
            }
        });
        
        // Inicializar novos tooltips
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => 
            new bootstrap.Tooltip(tooltipTriggerEl, {
                html: true,
                trigger: 'hover focus'
            })
        );
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
                  title="${tooltipInfo}" 
                  data-bs-toggle="tooltip" 
                  data-bs-placement="top"
                  data-bs-html="true">
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
                tooltipParts.push(`🏁 <strong>Ação:</strong> Finalizar conversa`);
            } else {
                tooltipParts.push(`➡️ <strong>Próximo bloco:</strong> ${nextBlockName}`);
            }
        } else {
            // Se não há next_block definido, o fluxo para neste ponto
            tooltipParts.push(`⏹️ <strong>Ação:</strong> Parar fluxo (sem próximo bloco)`);
        }
        
        // Labels que serão atribuídos pelo botão
        const labels = [];
        
        if (button.assign_labels && button.assign_labels.length > 0) {
            labels.push(`🏷️ <strong>Labels da conversa:</strong> ${button.assign_labels.join(', ')}`);
        }
        
        if (button.contact_labels && button.contact_labels.length > 0) {
            labels.push(`👤 <strong>Labels do contato:</strong> ${button.contact_labels.join(', ')}`);
        }
        
        if (button.tag) {
            labels.push(`🏷️ <strong>Tag:</strong> ${button.tag}`);
        }
        
        tooltipParts.push(...labels);
        
        // Atribuições do botão
        if (button.assign_agent) {
            tooltipParts.push(`👨‍💼 <strong>Atribuir ao agente:</strong> ${button.assign_agent}`);
        }
        
        if (button.assign_team) {
            tooltipParts.push(`👥 <strong>Atribuir ao time:</strong> ${button.assign_team}`);
        }
        
        // Se não há nenhuma informação além do fluxo, mostrar mensagem
        if (tooltipParts.length === 1 && !button.next_block) {
            return '⚠️ Botão sem ação definida - fluxo irá parar';
        }
        
        return tooltipParts.join('<br>');
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

        try {
            const workflowConfig = JSON.parse(configText);
            
            const response = await this.apiRequest('/api/inbox-workflows', {
                method: 'POST',
                body: JSON.stringify({
                    accountId: parseInt(accountId),
                    inboxId: parseInt(inboxId),
                    workflowName,
                    workflowConfig
                })
            });

            if (response.success) {
                this.showAlert('Fluxo salvo com sucesso!', 'success');
                await this.loadActiveWorkflows();
                this.hideWorkflowEditor();
            } else {
                this.showAlert(response.error || 'Erro ao salvar fluxo', 'danger');
            }
        } catch (error) {
            console.error('Erro ao salvar fluxo:', error);
            this.showAlert('Erro ao salvar fluxo', 'danger');
        }
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
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Remover automaticamente após 5 segundos
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    showChangePasswordModal() {
        // Só permitir se realmente logado
        if (!this.token) {
            console.log('Tentativa de abrir modal de senha sem estar logado');
            return;
        }
        
        // Limpar qualquer backdrop que possa estar interferindo
        const existingBackdrops = document.querySelectorAll('.modal-backdrop');
        existingBackdrops.forEach(backdrop => backdrop.remove());
        
        const modalEl = document.getElementById('changePasswordModal');
        
        // Verificar se já existe uma instância
        const existingModal = bootstrap.Modal.getInstance(modalEl);
        if (existingModal) {
            existingModal.dispose();
        }
        
        const modal = new bootstrap.Modal(modalEl, {
            backdrop: true,
            keyboard: true
        });
        
        document.getElementById('changePasswordForm').reset();
        document.getElementById('changePasswordError').classList.add('d-none');
        modal.show();
        
        console.log('Modal de alteração de senha aberto pelo usuário');
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
                const modalEl = document.getElementById('changePasswordModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) {
                    modal.hide();
                }
                
                // Limpar backdrop após fechar
                setTimeout(() => {
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    backdrops.forEach(backdrop => backdrop.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    document.body.style.paddingRight = '';
                }, 300);
                
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
}

// Função para limpar backdrops e garantir interface limpa
function clearModalBackdrops() {
    // Remover todos os backdrops
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    
    // Resetar estilos do body
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    
    // Se o usuário está logado, garantir que modais problemáticos estejam escondidos
    if (window.app && window.app.token) {
        const problematicModals = ['loginModal', 'changePasswordModal'];
        problematicModals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
                modal.removeAttribute('aria-modal');
                modal.removeAttribute('role');
            }
        });
    }
}

// Função de emergência para forçar limpeza total
function forceCleanInterface() {
    // Remover TODOS os backdrops
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    
    // Resetar body
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    document.body.style.paddingLeft = '';
    
    // Lista de modais que devem ser fechados quando logado
    const modalsToClose = ['loginModal', 'changePasswordModal'];
    
    // Forçar que modais sejam escondidos se o usuário estiver logado
    const token = localStorage.getItem('authToken');
    if (token) {
        modalsToClose.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                // Remover todas as classes e atributos do modal
                modal.classList.remove('show', 'fade');
                modal.style.display = 'none';
                modal.style.visibility = 'hidden';
                modal.setAttribute('aria-hidden', 'true');
                modal.removeAttribute('aria-modal');
                modal.removeAttribute('role');
                modal.removeAttribute('tabindex');
                
                // Remover instância do Bootstrap se existir
                const instance = bootstrap.Modal.getInstance(modal);
                if (instance) {
                    try {
                        instance.hide();
                        instance.dispose();
                    } catch (e) {
                        // Ignorar erros de disposição
                    }
                }
            }
        });
        
        // Garantir que o app seja visível
        const app = document.getElementById('app');
        if (app) {
            app.classList.remove('d-none');
            app.style.display = 'block';
            app.style.visibility = 'visible';
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Limpar qualquer backdrop residual na inicialização
    clearModalBackdrops();
    
    // Executar limpeza forçada após um pequeno delay
    setTimeout(forceCleanInterface, 500);
    
    // Adicionar estilos CSS para as informações dos blocos
    addWorkflowPreviewStyles();
    
    window.app = new ChatwootWorkflowsApp();
    
    // Atualizar preview quando o usuário digitar no textarea
    document.getElementById('workflowConfig').addEventListener('input', () => {
        window.app.updateWorkflowPreview();
    });
    
    // Adicionar listener para limpar backdrops quando clicarem fora de qualquer modal
    document.addEventListener('click', (e) => {
        // Se clicaram fora de qualquer modal e não em um botão que abre modal
        if (!e.target.closest('.modal') && !e.target.closest('[data-bs-toggle="modal"]') && !e.target.closest('[onclick*="Modal"]')) {
            setTimeout(clearModalBackdrops, 100);
        }
    });
    
    // Executar limpeza periódica a cada 2 segundos se logado
    setInterval(() => {
        if (window.app && window.app.token) {
            forceCleanInterface();
        }
    }, 2000);
    
    // Observer para detectar quando modais são mostrados acidentalmente
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if ((target.id === 'changePasswordModal' || target.id === 'loginModal') && 
                    target.classList.contains('show') && 
                    window.app && window.app.token) {
                    
                    console.log('Modal detectado sendo aberto acidentalmente, fechando...');
                    setTimeout(() => {
                        const instance = bootstrap.Modal.getInstance(target);
                        if (instance) {
                            instance.hide();
                        }
                        target.classList.remove('show');
                        target.style.display = 'none';
                        forceCleanInterface();
                    }, 100);
                }
            }
        });
    });
    
    // Observar mudanças nos modais
    const modalsToObserve = ['loginModal', 'changePasswordModal'];
    modalsToObserve.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    });
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
        const closeModalCampanha = document.getElementById('closeModalCampanha');
        const formCampanha = document.getElementById('formCampanha');
        const agendarEnvio = document.getElementById('agendarEnvio');
        const menuListarCampanhas = document.getElementById('menuListarCampanhas');
        const metodoEnvioRadios = document.getElementsByName('metodoEnvio');

        console.log('Elementos encontrados:', {
            btnCriarCampanha: !!btnCriarCampanha,
            closeModalCampanha: !!closeModalCampanha,
            formCampanha: !!formCampanha,
            agendarEnvio: !!agendarEnvio,
            menuListarCampanhas: !!menuListarCampanhas,
            metodoEnvioRadios: metodoEnvioRadios.length
        });

        if (btnCriarCampanha) {
            btnCriarCampanha.addEventListener('click', function() {
                document.getElementById('modalCampanha').style.display = 'block';
                loadModelos();
                loadTags();
            });
        }

        if (closeModalCampanha) {
            closeModalCampanha.addEventListener('click', function() {
                document.getElementById('modalCampanha').style.display = 'none';
            });
        }

        // Fechar modal ao clicar fora
        window.addEventListener('click', function(event) {
            const modal = document.getElementById('modalCampanha');
            if (modal && event.target === modal) {
                modal.style.display = 'none';
            }
        });

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
                        document.getElementById('modalCampanha').style.display = 'none';
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

// Remover os event listeners que estavam soltos para evitar erros
// (Os event listeners agora estão dentro de initCampanhasEventListeners)

// Carregar modelos/templates via API
async function loadModelos() {
    try {
        console.log('🔍 Carregando templates do WhatsApp...');
        const response = await fetch('/api/chatwoot/templates', {
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
            templates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.name;
                option.textContent = template.displayName || template.name;
                option.title = `Status: ${template.status} | Categoria: ${template.category} | Idioma: ${template.language}`;
                select.appendChild(option);
            });
            console.log(`✅ ${templates.length} templates carregados com sucesso`);
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
        if (typeof showAlert === 'function') {
            showAlert('Erro ao carregar modelos de mensagem. Tente sincronizar os templates.', 'error');
        } else if (typeof window.app?.showAlert === 'function') {
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
        
        const response = await fetch('/api/chatwoot/templates/sync', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Sincronização bem-sucedida:', result);
            
            if (typeof window.app?.showAlert === 'function') {
                window.app.showAlert(result.message, 'success');
            }
            
            // Aguardar um pouco e recarregar templates
            setTimeout(() => {
                loadModelos();
            }, 2000);
            
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
        
        // Criar modal ou seção para exibir campanhas
        showCampanhasList(campanhas);
    } catch (error) {
        console.error('Erro ao carregar campanhas:', error);
        window.app.showAlert('Erro ao carregar campanhas', 'danger');
    }
}

// Exibir lista de campanhas com estatísticas detalhadas
function showCampanhasList(campanhas) {
    // Criar ou encontrar container para listagem
    let container = document.getElementById('campanhasContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'campanhasContainer';
        container.className = 'campanhas-list position-fixed top-0 start-0 w-100 h-100 bg-white z-3 p-4 overflow-auto';
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
        
        // Criar modal para mostrar erros
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">🚨 Erros da Campanha</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
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
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        <button type="button" class="btn btn-warning" onclick="reenviarCampanha(${campanhaId}); bootstrap.Modal.getInstance(this.closest('.modal')).hide();">
                            <i class="fas fa-redo"></i> Reenviar Todos
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Remover modal quando fechar
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
        
    } catch (error) {
        console.error('Erro ao carregar erros da campanha:', error);
        window.app.showAlert('Erro ao carregar erros da campanha', 'danger');
    }
}

// Função para fechar lista de campanhas
function fecharListaCampanhas() {
    const container = document.getElementById('campanhasContainer');
    if (container) {
        container.remove();
    }
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
        
        .tooltip {
            --bs-tooltip-max-width: 350px;
            font-size: 12px;
        }
        
        .tooltip-inner {
            text-align: left;
            background-color: #212529;
            border-radius: 6px;
            padding: 8px 12px;
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
    `;
    
    document.head.appendChild(style);
}