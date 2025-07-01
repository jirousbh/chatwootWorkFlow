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
        document.getElementById('app').classList.add('d-none');
        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
        loginModal.show();
        
        // Configurar formulário de login
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
    }

    showApp() {
        document.getElementById('loginModal').classList.remove('show');
        document.getElementById('app').classList.remove('d-none');
        document.getElementById('currentUser').textContent = this.user.username;
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
        await Promise.all([
            this.loadAccounts(),
            this.loadWorkflowTemplates(),
            this.loadActiveWorkflows()
        ]);
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
            const item = document.createElement('div');
            item.className = 'workflow-item';
            item.innerHTML = `
                <div class="workflow-info">
                    <h6 class="workflow-name">${workflow.workflow_name}</h6>
                    <p class="workflow-details">
                        Conta: ${workflow.account_id} | Caixa: ${workflow.inbox_id}
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

    showWorkflowEditor() {
        const accountId = document.getElementById('accountSelect').value;
        const inboxId = document.getElementById('inboxSelect').value;
        
        if (!accountId || !inboxId) {
            this.showAlert('Selecione uma conta e caixa de entrada primeiro', 'warning');
            return;
        }

        document.getElementById('workflowEditor').classList.remove('d-none');
        document.getElementById('workflowInfo').classList.add('d-none');
    }

    hideWorkflowEditor() {
        document.getElementById('workflowEditor').classList.add('d-none');
        document.getElementById('workflowInfo').classList.remove('d-none');
        document.getElementById('workflowName').value = '';
        document.getElementById('workflowConfig').value = '';
        document.getElementById('workflowPreview').innerHTML = '<p class="text-muted">Selecione um template ou cole uma configuração para visualizar o fluxo.</p>';
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
        } catch (error) {
            preview.innerHTML = '<p class="text-danger">Erro ao parsear JSON</p>';
        }
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
                            ${isStart ? 'Início' : isEnd ? 'Fim' : 'Bloco'}
                        </span>
                    </div>
                    <div class="block-message">${block.message || ''}</div>
                    ${block.buttons ? `
                        <div class="block-buttons">
                            ${block.buttons.map(btn => `
                                <span class="block-button">${btn.text}</span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        return html;
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
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChatwootWorkflowsApp();
    
    // Atualizar preview quando o usuário digitar no textarea
    document.getElementById('workflowConfig').addEventListener('input', () => {
        window.app.updateWorkflowPreview();
    });
});

// Funções globais para compatibilidade com onclick
function logout() {
    window.app.logout();
}

function loadInboxes() {
    window.app.loadInboxes();
}

function loadWorkflow() {
    window.app.loadWorkflow();
}

function showWorkflowEditor() {
    window.app.showWorkflowEditor();
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