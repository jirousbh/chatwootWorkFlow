// Função utilitária para corrigir interpretação de datas do backend
function parseDateFromBackend(dateString) {
    if (!dateString) return null;
    
    // Se a data já contém informação de timezone, usar diretamente
    if (dateString.includes('+') || dateString.includes('Z')) {
        return new Date(dateString);
    }
    
    // Para datas do PostgreSQL que vêm no formato "YYYY-MM-DD HH:MM:SS" 
    // o backend já está enviando no timezone correto, então não forçar UTC
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(dateString)) {
        // O backend já converteu para o timezone correto, usar como está
        return new Date(dateString);
    }
    
    // Para outros formatos, tentar interpretação normal
    return new Date(dateString);
}

// Função para formatar data no timezone do Brasil
function formatDateBrazil(date, options = {}) {
    if (!date) return '';
    
    const originalValue = date;
    const parsedDate = typeof date === 'string' ? parseDateFromBackend(date) : date;
    if (!parsedDate || isNaN(parsedDate.getTime())) return 'Data inválida';
    
    // Configurações padrão para exibir data e hora no Brasil
    const defaultOptions = {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        ...options
    };
    
    const result = parsedDate.toLocaleString('pt-BR', defaultOptions);
    
    return result;
}

// Função para formatar data de agendamento no timezone do Brasil
function formatDateScheduled(date, options = {}) {
    if (!date) return '';
    
    const parsedDate = typeof date === 'string' ? parseDateFromBackend(date) : date;
    if (!parsedDate || isNaN(parsedDate.getTime())) return 'Data inválida';
    
    // Configurações específicas para agendamento (sem segundos)
    const defaultOptions = {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        ...options
    };
    
    const result = parsedDate.toLocaleString('pt-BR', defaultOptions);
    
    return result;
}

// Funções utilitárias globais para identificação de caixas
function isWhatsAppAPIInbox(inbox) {
    return inbox.channel_type === 'Channel::Whatsapp';
}

function isEvolutionAPIInbox(inbox) {
    return inbox.channel_type === 'Channel::Api' || 
           inbox.channel_type === 'Channel::Webhook' ||
           (inbox.name && inbox.name.toLowerCase().includes('evolution')) ||
           (inbox.name && inbox.name.toLowerCase().includes('evo')) ||
           (inbox.provider_config && inbox.provider_config.webhook_url && 
            inbox.provider_config.webhook_url.includes('evolution'));
}

// Função utilitária para identificar caixas de entrada do tipo Website
function isWebsiteInbox(inbox) {
    return inbox.channel_type === 'Channel::Website' || 
           inbox.channel_type === 'Channel::Web' ||
           inbox.channel_type === 'Channel::LiveChat' ||
           inbox.channel_type === 'Channel::WebWidget' ||
           (inbox.name && inbox.name.toLowerCase().includes('website')) ||
           (inbox.name && inbox.name.toLowerCase().includes('site')) ||
           (inbox.name && inbox.name.toLowerCase().includes('web')) ||
           (inbox.name && inbox.name.toLowerCase().includes('livechat'));
}

function isSupportedInbox(inbox) {
    return isWhatsAppAPIInbox(inbox) || isEvolutionAPIInbox(inbox) || isWebsiteInbox(inbox);
}

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
        this.config = {
            ia_agent_url: 'http://localhost:3006', // Fallback padrão
            ia_agent_port: '3006' // Fallback padrão
        };
        
        this.init();
    }



    async init() {
        if (this.token) {
            await this.loadConfig();
            await this.checkAuth();
        } else {
            this.showLogin();
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.config = data.config;
                    console.log('✅ Configurações carregadas do backend:', this.config);
                    console.log(`🔗 IA Agent URL: ${this.config.ia_agent_url}`);
                    console.log(`🔗 IA Agent Port: ${this.config.ia_agent_port}`);
                }
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível carregar configurações, usando fallback:', error);
            console.log('🔗 Usando fallback - URL:', this.config.ia_agent_url, 'Port:', this.config.ia_agent_port);
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
            
        // Configurar interface baseada no perfil do usuário
        this.configureUIByRole();
            
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

    configureUIByRole() {
        const isAdmin = this.user.role === 'admin';
        
        // Controlar visibilidade dos cards e áreas baseado no perfil
        const configurationCard = document.getElementById('configurationCard');
        const activeWorkflowsCard = document.getElementById('activeWorkflowsCard');
        const userConfigurationCard = document.getElementById('userConfigurationCard');
        const adminMainArea = document.getElementById('adminMainArea');
        const userMainArea = document.getElementById('userMainArea');
        
        if (isAdmin) {
            // Admin: mostrar interface administrativa + dashboard de campanhas
            if (configurationCard) configurationCard.style.display = 'block';
            if (activeWorkflowsCard) activeWorkflowsCard.style.display = 'block';
            if (userConfigurationCard) userConfigurationCard.style.display = 'none';
            if (adminMainArea) adminMainArea.style.display = 'block';
            if (userMainArea) userMainArea.style.display = 'block'; // Admin vê dashboard de campanhas também
            
            // Configurar dashboard para admin (todas as campanhas)
            this.setupAdminInterface();
        } else {
            // Usuário comum: mostrar interface simplificada
            if (configurationCard) configurationCard.style.display = 'none';
            if (activeWorkflowsCard) activeWorkflowsCard.style.display = 'none';
            if (userConfigurationCard) userConfigurationCard.style.display = 'block';
            if (adminMainArea) adminMainArea.style.display = 'none';
            if (userMainArea) userMainArea.style.display = 'block';
            
            // Configurar eventos e dashboard para usuário
            this.setupUserInterface();
        }
        
        // Mostrar/ocultar menu de gerenciamento de usuários
        const userManagementItem = document.getElementById('menuGerenciarUsuariosItem');
        
        if (userManagementItem) {
            if (isAdmin) {
                userManagementItem.classList.remove('d-none');
            } else {
                userManagementItem.classList.add('d-none');
            }
        }
        
        // Mostrar/ocultar menu de gerenciamento de provedores
        const providerManagementItem = document.getElementById('menuGerenciarProvedoresItem');
        
        if (providerManagementItem) {
            if (isAdmin) {
                providerManagementItem.classList.remove('d-none');
            } else {
                providerManagementItem.classList.add('d-none');
            }
        }
        
        // Configurar interface está completo
    }

    setupUserInterface() {
        // Configurar botões de criar campanha para usuários
        this.setupCreateCampaignButtons();
        
        // Carregar dados nos selects do dashboard para usuários
        this.loadDashboardSelects();
        
        // Carregar estatísticas do dashboard (apenas campanhas do usuário)
        this.loadUserDashboardStats();
    }

    setupAdminInterface() {
        // Configurar botões de criar campanha para admin
        this.setupCreateCampaignButtons();
        
        // Carregar dados nos selects do dashboard para admin
        this.loadDashboardSelects();
        
        // Carregar estatísticas do dashboard (todas as campanhas)
        this.loadAdminDashboardStats();
    }

    // Carregar dados nos selects do dashboard (conta e caixa)
    async loadDashboardSelects() {
        try {
            
            // Carregar contas
            const accounts = await this.apiRequest('/api/accounts');
            if (Array.isArray(accounts) && accounts.length > 0) {
                this.populateDashboardAccountSelects(accounts);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar selects do dashboard:', error);
        }
    }

    // Popular selects de conta no dashboard
    populateDashboardAccountSelects(accounts) {
        
        // Usar IDs diferentes baseado no role
        const selectId = this.user.role === 'admin' ? 'accountSelect' : 'userAccountSelect';
        
        
        const select = document.getElementById(selectId);
        
        if (select) {
            select.innerHTML = '<option value="">Selecione uma conta...</option>';
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.name;
                select.appendChild(option);
            });
        } else {
        }
    }

    // Validar se conta e caixa foram selecionadas
    async validateAccountAndInboxSelection() {
        
        // Usar IDs diferentes baseado no role
        const accountSelectId = this.user.role === 'admin' ? 'accountSelect' : 'userAccountSelect';
        const inboxSelectId = this.user.role === 'admin' ? 'inboxSelect' : 'userInboxSelect';
    
        
        const accountSelect = document.getElementById(accountSelectId);
        const inboxSelect = document.getElementById(inboxSelectId);
        
        
        if (!accountSelect || !inboxSelect) {
            console.error('❌ Elementos de seleção não encontrados');
            this.showAlert('Erro: elementos de seleção não encontrados', 'danger');
            return false;
        }
        
        const selectedAccount = accountSelect.value;
        const selectedInbox = inboxSelect.value;
        
        if (!selectedAccount) {
            console.warn('⚠️ Conta não selecionada');
            this.showAlert('Por favor, selecione uma conta antes de criar uma campanha', 'warning');
            accountSelect.focus();
            return false;
        }
        
        if (!selectedInbox) {
            console.warn('⚠️ Caixa de entrada não selecionada');
            this.showAlert('Por favor, selecione uma caixa de entrada antes de criar uma campanha', 'warning');
            inboxSelect.focus();
            return false;
        }
        
        // Validar se a caixa de entrada é uma API oficial do WhatsApp ou EvolutionAPI
        try {
            
            // Buscar informações da caixa de entrada
            const inboxes = this.inboxes || [];
            const selectedInboxInfo = inboxes.find(inbox => String(inbox.id) === String(selectedInbox));
            
            if (!selectedInboxInfo) {
                console.warn('⚠️ Informações da caixa de entrada não encontradas, tentando buscar...');
                // Tentar buscar as informações da caixa
                const accountInboxes = await this.loadInboxesForAccount(selectedAccount);
                const inboxInfo = accountInboxes.find(inbox => String(inbox.id) === String(selectedInbox));
                
                if (!inboxInfo) {
                    console.error('❌ Não foi possível obter informações da caixa de entrada');
                    this.showAlert('Erro ao validar caixa de entrada. Tente selecionar novamente.', 'danger');
                    return false;
                }
                
                                 // Verificar se é uma caixa suportada (WhatsApp API ou EvolutionAPI)
                 if (!isSupportedInbox(inboxInfo)) {
                     console.warn(`⚠️ Caixa de entrada não é suportada: ${inboxInfo.channel_type}`);
                     this.showAlert(`Esta caixa de entrada (${inboxInfo.name}) não é suportada. Apenas caixas do WhatsApp API, Evolution API e Website são suportadas para campanhas.`, 'warning');
                     return false;
                 }
                 
                 if (isEvolutionAPIInbox(inboxInfo)) {
                     console.warn('⚠️ Campanhas não são permitidas com Evolution API');
                     this.showEvolutionAPIModal(inboxInfo.name);
                     return false;
                 } else {
                     console.log('✅ Caixa de entrada é uma API oficial do WhatsApp');
                 }
                         } else {
                 // Verificar se é uma caixa suportada (WhatsApp API ou EvolutionAPI)
                 if (!isSupportedInbox(selectedInboxInfo)) {
                     console.warn(`⚠️ Caixa de entrada não é suportada: ${selectedInboxInfo.channel_type}`);
                     this.showAlert(`Esta caixa de entrada (${selectedInboxInfo.name}) não é suportada. Apenas caixas do WhatsApp API, Evolution API e Website são suportadas para campanhas.`, 'warning');
                     return false;
                 }
                 
                 if (isEvolutionAPIInbox(selectedInboxInfo)) {
                     console.warn('⚠️ Campanhas não são permitidas com Evolution API');
                     this.showEvolutionAPIModal(selectedInboxInfo.name);
                     return false;
                 } else {
                     console.log('✅ Caixa de entrada é uma API oficial do WhatsApp');
                 }
             }
            
            console.log('✅ Caixa de entrada é uma API oficial do WhatsApp ou EvolutionAPI');
        } catch (error) {
            console.error('❌ Erro ao validar tipo da caixa de entrada:', error);
            this.showAlert('Erro ao validar caixa de entrada. Tente novamente.', 'danger');
            return false;
        }
        
        console.log(`✅ Validação aprovada: Conta ${selectedAccount}, Caixa ${selectedInbox} (WhatsApp API ou EvolutionAPI)`);
        return true;
    }

    setupCreateCampaignButtons() {
        const buttons = [
            document.getElementById('btnCriarCampanhaUser'),
            document.getElementById('dashboardCreateCampaign'),
            document.getElementById('btnCriarCampanha')
        ];
        
        buttons.forEach(button => {
            if (button && !button.hasAttribute('data-listener-added')) {
                button.addEventListener('click', async () => {
                    // Validar se conta e caixa foram selecionadas
                    if (!(await this.validateAccountAndInboxSelection())) {
                        return;
                    }
                    
                    // Mostrar indicador de carregamento
                    const originalText = button.innerHTML;
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Carregando...';
                    
                    try {
                        this.showUnifiedCampaignForm();
                    } catch (error) {
                        console.error('❌ Erro ao criar campanha:', error);
                        this.showAlert('Erro ao abrir interface de campanha', 'danger');
                    } finally {
                        // Restaurar botão
                        button.disabled = false;
                        button.innerHTML = originalText;
                    }
                });
                button.setAttribute('data-listener-added', 'true');
            }
        });
    }



    createUserCampaignArea() {
        // Verificar se já existe
        let campanhaArea = document.getElementById('userCampaignArea');
        if (campanhaArea) {
            campanhaArea.style.display = 'block';
            return campanhaArea;
        }

        campanhaArea = document.createElement('div');
        campanhaArea.id = 'userCampaignArea';
        campanhaArea.className = 'card';
        campanhaArea.style.display = 'block';

        campanhaArea.innerHTML = `
            <div class="card-header bg-success text-white">
                <div class="d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-plus me-2"></i>Nova Campanha WhatsApp
                    </h5>
                    <button class="btn btn-sm btn-light" onclick="window.app.hideUserCampaignInterface()">
                        <i class="fas fa-arrow-left me-2"></i>Voltar ao Dashboard
                    </button>
                </div>
            </div>
            <div class="card-body">
                <form id="userCampaignForm">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label for="userAccountSelect" class="form-label">
                                    <i class="fas fa-building me-1"></i>Conta Chatwoot
                                </label>
                                <select class="form-select" id="userAccountSelect" required>
                                    <option value="">Selecione uma conta...</option>
                                </select>
                                <small class="text-muted">Escolha a conta para enviar a campanha</small>
                            </div>

                            <div class="mb-3">
                                <label for="userInboxSelect" class="form-label">
                                    <i class="fas fa-inbox me-1"></i>Caixa de Entrada
                                </label>
                                <select class="form-select" id="userInboxSelect" required disabled>
                                    <option value="">Primeiro selecione uma conta</option>
                                </select>
                                <small class="text-muted">Caixa de entrada do WhatsApp para envio</small>
                            </div>

                            <div class="mb-3">
                                <label for="userCampanhaNome" class="form-label">
                                    <i class="fas fa-tag me-1"></i>Nome da Campanha
                                </label>
                                <input type="text" class="form-control" id="userCampanhaNome" required>
                                <small class="text-muted">Nome para identificar sua campanha</small>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="fas fa-users me-1"></i>Método de Envio
                                </label>
                                <div class="card">
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="form-check">
                                                    <input type="radio" class="form-check-input" id="userMetodoTag" name="userMetodoEnvio" value="tag" checked>
                                                    <label class="form-check-label" for="userMetodoTag">
                                                        <strong>Por Tag</strong><br>
                                                        <small class="text-muted">Enviar para contatos com tag específica</small>
                                                    </label>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-check">
                                                    <input type="radio" class="form-check-input" id="userMetodoLista" name="userMetodoEnvio" value="csv">
                                                    <label class="form-check-label" for="userMetodoLista">
                                                        <strong>Lista CSV</strong><br>
                                                        <small class="text-muted">Upload de arquivo com contatos</small>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="mb-3" id="userTagSection">
                                <label for="userTagNome" class="form-label">
                                    <i class="fas fa-tags me-1"></i>Nome da Tag
                                </label>
                                <select class="form-select" id="userTagNome">
                                    <option value="">Carregando tags...</option>
                                </select>
                            </div>

                            <div class="mb-3 d-none" id="userCsvSection">
                                <label for="userCsvContatos" class="form-label">
                                    <i class="fas fa-file-csv me-1"></i>Arquivo CSV
                                </label>
                                <input type="file" class="form-control" id="userCsvContatos" accept=".csv">
                                <small class="text-muted">Formato: nome,telefone (sem cabeçalho)</small>
                            </div>
                        </div>

                        <div class="col-md-6">
                            <div class="mb-3">
                                <label for="userModeloMensagem" class="form-label">
                                    <i class="fas fa-comment-dots me-1"></i>Template da Mensagem
                                </label>
                                <select class="form-select" id="userModeloMensagem" required>
                                    <option value="">Carregando templates...</option>
                                </select>
                                <small class="text-muted">Templates aprovados pelo WhatsApp</small>
                            </div>

                            <div class="mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="userAgendarEnvio">
                                    <label class="form-check-label" for="userAgendarEnvio">
                                        <i class="fas fa-clock me-1"></i>Agendar Envio
                                    </label>
                                </div>
                            </div>

                            <div class="row d-none" id="userAgendamentoSection">
                                <div class="col-12 mb-2">
                                    <div class="alert alert-info py-2 mb-3">
                                        <i class="fas fa-info-circle me-2"></i>
                                        <strong>Fuso Horário:</strong> Todos os agendamentos são no horário de Brasília (UTC-3).
                                        A campanha será executada no horário exato informado.
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label for="userDataEnvio" class="form-label">
                                            <i class="fas fa-calendar me-1"></i>Data
                                        </label>
                                        <input type="date" class="form-control" id="userDataEnvio">
                                        <small class="text-muted">Data do agendamento</small>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label for="userHoraEnvio" class="form-label">
                                            <i class="fas fa-clock me-1"></i>Hora (Brasília)
                                        </label>
                                        <input type="time" class="form-control" id="userHoraEnvio">
                                        <small class="text-muted">Horário de Brasília (UTC-3)</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="d-flex gap-2 justify-content-end">
                        <button type="button" class="btn btn-secondary" onclick="window.app.hideUserCampaignInterface()">
                            <i class="fas fa-times me-2"></i>Cancelar
                        </button>
                        <button type="submit" class="btn btn-success">
                            <i class="fas fa-paper-plane me-2"></i>Criar Campanha
                        </button>
                    </div>
                </form>
            </div>
        `;

        // Configurar event listeners
        this.setupUserCampaignForm(campanhaArea);

        // Garantir que o select seja populado após a criação completa
        setTimeout(() => {
            console.log('🔄 Verificação final: populando select de contas...');
            this.populateUserAccountSelect();
            
            // Se o checkbox de agendamento já estiver marcado, pré-preencher os campos
            const agendarCheckboxFinal = campanhaArea.querySelector('#userAgendarEnvio');
            const dataInputFinal = campanhaArea.querySelector('#userDataEnvio');
            const horaInputFinal = campanhaArea.querySelector('#userHoraEnvio');
            
            if (agendarCheckboxFinal && agendarCheckboxFinal.checked) {
                setTimeout(() => {
                    console.log('🔄 Pré-preenchendo data e hora atual (checkbox já marcado)...');
                    
                    if (dataInputFinal) {
                        const today = new Date().toISOString().split('T')[0];
                        dataInputFinal.value = today;
                        console.log('✅ Data preenchida (final):', today);
                    }
                    
                    if (horaInputFinal) {
                        const now = new Date();
                        const brazilTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
                        const hours = brazilTime.getHours().toString().padStart(2, '0');
                        const minutes = brazilTime.getMinutes().toString().padStart(2, '0');
                        const horaValue = `${hours}:${minutes}`;
                        horaInputFinal.value = horaValue;
                        console.log('✅ Hora preenchida (final):', horaValue);
                    }
                }, 200);
            }
        }, 300);

        return campanhaArea;
    }

    hideUserCampaignInterface() {
        const campanhaArea = document.getElementById('userCampaignArea');
        if (campanhaArea) campanhaArea.style.display = 'none';
        
        const userMainArea = document.getElementById('userMainArea');
        if (userMainArea) userMainArea.style.display = 'block';
    }

    setupUserCampaignForm(campanhaArea) {
        // Configurar mudança de método
        const metodoInputs = campanhaArea.querySelectorAll('input[name="userMetodoEnvio"]');
        metodoInputs.forEach(input => {
            input.addEventListener('change', () => {
                const tagSection = campanhaArea.querySelector('#userTagSection');
                const csvSection = campanhaArea.querySelector('#userCsvSection');
                
                if (input.value === 'tag') {
                    tagSection.classList.remove('d-none');
                    csvSection.classList.add('d-none');
                } else {
                    tagSection.classList.add('d-none');
                    csvSection.classList.remove('d-none');
                }
            });
        });

        // Configurar agendamento
        const agendarCheckbox = campanhaArea.querySelector('#userAgendarEnvio');
        const agendamentoSection = campanhaArea.querySelector('#userAgendamentoSection');
        const dataInput = campanhaArea.querySelector('#userDataEnvio');
        const horaInput = campanhaArea.querySelector('#userHoraEnvio');
        
        console.log('🔍 Debug - Elementos encontrados:', {
            agendarCheckbox: !!agendarCheckbox,
            agendamentoSection: !!agendamentoSection,
            dataInput: !!dataInput,
            horaInput: !!horaInput
        });
        
        // Função para pré-preencher data e hora atual
        const preencherDataHoraAtual = () => {
            console.log('🔄 Executando preencherDataHoraAtual...');
            
            if (dataInput) {
                const today = new Date().toISOString().split('T')[0];
                dataInput.value = today;
                console.log('✅ Data preenchida:', today);
            } else {
                console.log('❌ dataInput não encontrado');
            }
            
            if (horaInput) {
                const now = new Date();
                const brazilTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
                const hours = brazilTime.getHours().toString().padStart(2, '0');
                const minutes = brazilTime.getMinutes().toString().padStart(2, '0');
                const horaValue = `${hours}:${minutes}`;
                horaInput.value = horaValue;
                console.log('✅ Hora preenchida:', horaValue);
            } else {
                console.log('❌ horaInput não encontrado');
            }
        };
        
        // Definir data mínima como hoje
        if (dataInput) {
            const today = new Date().toISOString().split('T')[0];
            dataInput.min = today;
        }
        
        agendarCheckbox.addEventListener('change', () => {
            console.log('🔄 Checkbox de agendamento alterado:', agendarCheckbox.checked);
            
            if (agendarCheckbox.checked) {
                agendamentoSection.classList.remove('d-none');
                console.log('✅ Seção de agendamento exibida');
                
                // Pré-preencher com data e hora atual quando ativado
                setTimeout(() => {
                    console.log('⏰ Executando preenchimento após timeout...');
                    preencherDataHoraAtual();
                    
                    // Foco no campo de data
                    if (dataInput) {
                        dataInput.focus();
                        console.log('✅ Foco definido no campo de data');
                    }
                }, 100);
            } else {
                agendamentoSection.classList.add('d-none');
                console.log('✅ Seção de agendamento ocultada');
            }
        });
        
        // Validação em tempo real da data/hora
        // if (dataInput && horaInput) {
        //     const validateDateTime = () => {
        //         if (dataInput.value && horaInput.value) {
        //             const selectedDateTime = new Date(`${dataInput.value}T${horaInput.value}:00`);
        //             const now = new Date();
                    
        //             if (selectedDateTime <= now) {
        //                 horaInput.setCustomValidity('O horário deve ser no futuro');
        //                 horaInput.reportValidity();
        //             } else {
        //                 horaInput.setCustomValidity('');
        //             }
        //         }
        //     };
            
        //     dataInput.addEventListener('change', validateDateTime);
        //     horaInput.addEventListener('change', validateDateTime);
        // }

        // Configurar mudança de conta
        const accountSelect = campanhaArea.querySelector('#userAccountSelect');
        if (accountSelect) {
            accountSelect.addEventListener('change', async (e) => {
                console.log('🔄 Mudança de conta detectada via event listener');
                try {
                    await this.onUserAccountChange();
                } catch (error) {
                    console.error('❌ Erro ao processar mudança de conta:', error);
                    this.showAlert('Erro ao carregar caixas de entrada', 'danger');
                }
            });
        }

        // Configurar submit do formulário
        const form = campanhaArea.querySelector('#userCampaignForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitUserCampaign();
        });

        // Carregar dados iniciais
        this.loadUserCampaignData();
        
        // Aguardar um pouco para garantir que o DOM seja renderizado
        setTimeout(() => {
            // Garantir que as contas estejam carregadas antes de popular o select
            if (!this.accounts || this.accounts.length === 0) {
                console.log('🔄 Contas não carregadas, carregando agora...');
                this.loadAccounts().then(() => {
                    // Aguardar mais um pouco antes de popular o select
                    setTimeout(() => {
                        this.populateUserAccountSelect();
                    }, 100);
                });
            } else {
        this.populateUserAccountSelect();
            }
        }, 200);
    }

    async loadUserCampaignData() {
        // Carregar tags
        try {
            const response = await fetch('/api/chatwoot/tags', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const tags = await response.json();
            
            const tagSelect = document.getElementById('userTagNome');
            if (tagSelect) {
                if (Array.isArray(tags) && tags.length > 0) {
                tagSelect.innerHTML = '<option value="">Selecione uma tag</option>' + 
                        tags.map(tag => `<option value="${tag.title || tag.name}">${tag.title || tag.name}</option>`).join('');
                    console.log(`✅ ${tags.length} tags carregadas para usuário`);
                } else {
                    tagSelect.innerHTML = '<option value="">Nenhuma tag disponível</option>';
                    console.log('ℹ️ Nenhuma tag encontrada');
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar tags:', error);
            
            // Mostrar erro no select de tags
            const tagSelect = document.getElementById('userTagNome');
            if (tagSelect) {
                tagSelect.innerHTML = '<option value="">Erro ao carregar tags</option>';
            }
            
            // Mostrar alerta para o usuário
            this.showAlert('Erro ao carregar tags. Verifique sua conexão.', 'warning');
        }
    }

    populateUserAccountSelect() {
        const accountSelect = document.getElementById('userAccountSelect');
        if (!accountSelect) {
            console.warn('❌ Elemento userAccountSelect não encontrado');
            return;
        }

        // Debug completo das informações do usuário
        console.log('🔍 DEBUG - Informações do usuário:', {
            username: this.user.username,
            role: this.user.role,
            assigned_accounts: this.user.assigned_accounts,
            total_accounts: this.accounts ? this.accounts.length : 0,
            accounts: this.accounts
        });

        console.log(`🔍 Populando select de contas para usuário (${this.user.role}):`, this.accounts);

        accountSelect.innerHTML = '<option value="">Selecione uma conta...</option>';
        
        if (this.accounts && this.accounts.length > 0) {
            console.log(`✅ Carregando ${this.accounts.length} contas no select`);
            this.accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.name;
                accountSelect.appendChild(option);
                console.log(`📋 Conta adicionada: ${account.name} (ID: ${account.id})`);
            });
            
            // Se houver apenas uma conta, selecionar automaticamente e carregar inboxes
            if (this.accounts.length === 1) {
                console.log('🎯 Apenas uma conta disponível, selecionando automaticamente...');
                accountSelect.value = this.accounts[0].id;
                // Aguardar um pouco e depois carregar inboxes
                setTimeout(async () => {
                    await this.onUserAccountChange();
                    // Remover botões de debug após seleção automática
                    setTimeout(() => this.removeDebugButtons(), 1000);
                }, 100);
            }
        } else {
            console.warn('⚠️ Nenhuma conta encontrada para o usuário');
            // Adicionar opção informativa com botão para recarregar
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Nenhuma conta disponível - Clique em "Recarregar Contas" abaixo';
            option.disabled = true;
            accountSelect.appendChild(option);
            
            // Adicionar botão de debug/recarregar (temporário)
            this.addReloadAccountsButton();
        }
    }

    addReloadAccountsButton() {
        // Verificar se o botão já existe
        const existingButton = document.getElementById('reloadAccountsBtn');
        if (existingButton) return;
        
        // Encontrar container adequado
        const accountContainer = document.getElementById('userAccountSelect').parentElement;
        
        // Criar botão de recarregar
        const reloadButton = document.createElement('button');
        reloadButton.id = 'reloadAccountsBtn';
        reloadButton.type = 'button';
        reloadButton.className = 'btn btn-sm btn-warning mt-2';
        reloadButton.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Recarregar Contas';
        reloadButton.onclick = async () => {
            reloadButton.disabled = true;
            reloadButton.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Carregando...';
            
            try {
                console.log('🔄 Forçando reload das contas...');
                await this.loadAccounts();
                this.populateUserAccountSelect();
                
                // Remover o botão se deu certo
                if (this.accounts && this.accounts.length > 0) {
                    reloadButton.remove();
                }
            } catch (error) {
                console.error('❌ Erro ao recarregar contas:', error);
            } finally {
                reloadButton.disabled = false;
                reloadButton.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Recarregar Contas';
            }
        };
        
        accountContainer.appendChild(reloadButton);
        console.log('🔧 Botão de recarregar contas adicionado');
    }

    async loadInboxesForAccount(accountId) {
        try {
            console.log(`🔄 Carregando inboxes para conta ${accountId}`);
            const inboxes = await this.apiRequest(`/api/accounts/${accountId}/inboxes`);
            
            if (Array.isArray(inboxes) && inboxes.length > 0) {
                // Adicionar/atualizar inboxes desta conta no array global
                this.inboxes = this.inboxes || [];
                
                // Remover inboxes antigas desta conta
                this.inboxes = this.inboxes.filter(inbox => String(inbox.account_id) !== String(accountId));
                
                // Adicionar novas inboxes
                this.inboxes = this.inboxes.concat(inboxes);
                
                console.log(`✅ ${inboxes.length} inboxes carregadas para conta ${accountId}`);
                return inboxes;
            } else {
                console.warn(`⚠️ Nenhuma inbox encontrada para conta ${accountId}`);
                return [];
            }
        } catch (error) {
            console.error(`❌ Erro ao carregar inboxes para conta ${accountId}:`, error);
            throw error;
        }
    }

    async loadInboxesDirectlyForAccount(selectedAccountId) {
        try {
            const inboxes = await this.loadInboxesForAccount(selectedAccountId);
            const inboxSelect = document.getElementById('userInboxSelect');
            
            if (inboxes.length > 0) {
                inboxSelect.innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
                inboxes.forEach(inbox => {
                    const option = document.createElement('option');
                    option.value = inbox.id;
                    
                    // Adicionar indicador visual para diferentes tipos de caixas
                    // Usar funções utilitárias globais
                    if (isWhatsAppAPIInbox(inbox)) {
                        option.textContent = `📱 ${inbox.name} (WhatsApp API)`;
                        console.log(`📋 Caixa WhatsApp adicionada: ${inbox.name} (ID: ${inbox.id})`);
                    } else if (isEvolutionAPIInbox(inbox)) {
                        option.textContent = `🔄 ${inbox.name} (Evolution API)`;
                        console.log(`📋 Caixa Evolution API adicionada: ${inbox.name} (ID: ${inbox.id})`);
                    } else if (isWebsiteInbox(inbox)) {
                        option.textContent = `🌐 ${inbox.name} (Website)`;
                        console.log(`📋 Caixa Website adicionada: ${inbox.name} (ID: ${inbox.id})`);
                    } else {
                        option.textContent = `❌ ${inbox.name} (Não suportado)`;
                        option.disabled = true;
                        console.log(`📋 Caixa não suportada: ${inbox.name} (ID: ${inbox.id}) - Tipo: ${inbox.channel_type}`);
                    }
                    
                    inboxSelect.appendChild(option);
                });
                inboxSelect.disabled = false;
                console.log(`✅ ${inboxes.length} caixas carregadas diretamente no select`);
                
                // Remover botões de debug se tudo estiver funcionando
                setTimeout(() => this.removeDebugButtons(), 500);
            } else {
                inboxSelect.innerHTML = '<option value="">Nenhuma caixa de entrada encontrada</option>';
                inboxSelect.disabled = true;
                this.addReloadInboxesButton(selectedAccountId);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar inboxes diretamente:', error);
            const inboxSelect = document.getElementById('userInboxSelect');
            inboxSelect.innerHTML = '<option value="">Erro ao carregar caixas</option>';
            inboxSelect.disabled = true;
            this.addReloadInboxesButton(selectedAccountId);
        }
    }

    addReloadInboxesButton(accountId) {
        // Verificar se o botão já existe
        const existingButton = document.getElementById('reloadInboxesBtn');
        if (existingButton) return;
        
        // Encontrar container adequado
        const inboxContainer = document.getElementById('userInboxSelect').parentElement;
        
        // Criar botão de recarregar
        const reloadButton = document.createElement('button');
        reloadButton.id = 'reloadInboxesBtn';
        reloadButton.type = 'button';
        reloadButton.className = 'btn btn-sm btn-warning mt-2';
        reloadButton.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Recarregar Caixas';
        reloadButton.onclick = async () => {
            reloadButton.disabled = true;
            reloadButton.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Carregando...';
            
            try {
                console.log(`🔄 Forçando reload das caixas para conta ${accountId}...`);
                await this.loadInboxesDirectlyForAccount(accountId);
                
                // Remover o botão se deu certo
                const inboxSelect = document.getElementById('userInboxSelect');
                if (inboxSelect && !inboxSelect.disabled && inboxSelect.options.length > 1) {
                    reloadButton.remove();
                }
            } catch (error) {
                console.error('❌ Erro ao recarregar caixas:', error);
            } finally {
                reloadButton.disabled = false;
                reloadButton.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Recarregar Caixas';
            }
        };
        
        inboxContainer.appendChild(reloadButton);
        console.log('🔧 Botão de recarregar caixas adicionado');
    }

    removeDebugButtons() {
        // Remover botões de debug quando tudo estiver funcionando
        const reloadAccountsBtn = document.getElementById('reloadAccountsBtn');
        const reloadInboxesBtn = document.getElementById('reloadInboxesBtn');
        
        if (reloadAccountsBtn && this.accounts && this.accounts.length > 0) {
            reloadAccountsBtn.remove();
            console.log('🗑️ Botão de recarregar contas removido (funcionando)');
        }
        
        if (reloadInboxesBtn) {
            const inboxSelect = document.getElementById('userInboxSelect');
            if (inboxSelect && !inboxSelect.disabled && inboxSelect.options.length > 1) {
                reloadInboxesBtn.remove();
                console.log('🗑️ Botão de recarregar caixas removido (funcionando)');
            }
        }
    }

    async onUserAccountChange() {
        const accountSelect = document.getElementById('userAccountSelect');
        const inboxSelect = document.getElementById('userInboxSelect');
        const templateSelect = document.getElementById('userModeloMensagem');
        
        if (!accountSelect || !inboxSelect) {
            console.warn('❌ Elementos userAccountSelect ou userInboxSelect não encontrados');
            return;
        }

        const selectedAccountId = accountSelect.value;
        
        console.log(`🔄 Mudança de conta selecionada: ${selectedAccountId}`);
        
        // Resetar inbox e template
        inboxSelect.innerHTML = '<option value="">Carregando caixas de entrada...</option>';
        inboxSelect.disabled = true;
        
        if (templateSelect) {
            templateSelect.innerHTML = '<option value="">Primeiro selecione conta e caixa</option>';
        }

        if (selectedAccountId) {
            try {
                // Garantir que as inboxes estejam carregadas para esta conta
                if (!this.inboxes || this.inboxes.length === 0) {
                    console.log('🔄 Inboxes não carregadas, carregando agora...');
                    await this.loadInboxesForAccount(selectedAccountId);
                }
                
                // Filtrar caixas de entrada da conta selecionada
            const accountInboxes = this.inboxes.filter(inbox => 
                String(inbox.account_id) === String(selectedAccountId)
            );
            
                console.log(`📋 Caixas encontradas para conta ${selectedAccountId}:`, accountInboxes);
                
                // Popular select de inboxes
                inboxSelect.innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
                
                if (accountInboxes.length > 0) {
            accountInboxes.forEach(inbox => {
                const option = document.createElement('option');
                option.value = inbox.id;
                
                // Adicionar indicador visual para diferentes tipos de caixas
                // Usar funções utilitárias globais
                if (isWhatsAppAPIInbox(inbox)) {
                    option.textContent = `📱 ${inbox.name} (WhatsApp API)`;
                    console.log(`📋 Caixa WhatsApp adicionada: ${inbox.name} (ID: ${inbox.id})`);
                } else if (isEvolutionAPIInbox(inbox)) {
                    option.textContent = `🔄 ${inbox.name} (Evolution API)`;
                    console.log(`📋 Caixa Evolution API adicionada: ${inbox.name} (ID: ${inbox.id})`);
                } else if (isWebsiteInbox(inbox)) {
                    option.textContent = `🌐 ${inbox.name} (Website)`;
                    console.log(`📋 Caixa Website adicionada: ${inbox.name} (ID: ${inbox.id})`);
                } else {
                    option.textContent = `❌ ${inbox.name} (Não suportado)`;
                    option.disabled = true;
                    console.log(`📋 Caixa não suportada: ${inbox.name} (ID: ${inbox.id}) - Tipo: ${inbox.channel_type}`);
                }
                
                inboxSelect.appendChild(option);
                    });
                    inboxSelect.disabled = false;
                    console.log(`✅ ${accountInboxes.length} caixas carregadas no select`);
                    
                    // Remover botões de debug se tudo estiver funcionando
                    setTimeout(() => this.removeDebugButtons(), 500);
                } else {
                    // Se não há inboxes, tentar carregar da API diretamente
                    console.log('⚠️ Nenhuma caixa encontrada, tentando carregar da API...');
                    await this.loadInboxesDirectlyForAccount(selectedAccountId);
                }

            // Configurar listener para mudança de inbox
            inboxSelect.onchange = () => {
                if (inboxSelect.value) {
                        console.log(`🔄 Caixa selecionada: ${inboxSelect.value}`);
                    this.loadUserTemplates(selectedAccountId, inboxSelect.value);
                }
            };
                
            } catch (error) {
                console.error('❌ Erro ao carregar caixas de entrada:', error);
                inboxSelect.innerHTML = '<option value="">Erro ao carregar caixas - Clique em "Recarregar" abaixo</option>';
                inboxSelect.disabled = true;
                this.addReloadInboxesButton(selectedAccountId);
            }
        } else {
            inboxSelect.disabled = true;
        }
    }

    async loadUserTemplates(accountId, inboxId) {
        try {
            console.log(`🔄 Carregando templates para conta ${accountId}, inbox ${inboxId}`);
            
            const response = await fetch(`/api/whatsapp/templates?accountId=${accountId}&inboxId=${inboxId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const templates = await response.json();
            console.log(`📋 Templates recebidos:`, templates);
            
            const templateSelect = document.getElementById('userModeloMensagem');
            if (templateSelect) {
                if (Array.isArray(templates) && templates.length > 0) {
                templateSelect.innerHTML = '<option value="">Selecione um template</option>' + 
                        templates.map(template => 
                        `<option value="${template.name}">${template.displayName || template.name}</option>`
                    ).join('');
                    console.log(`✅ ${templates.length} templates carregados no select`);
                } else {
                    templateSelect.innerHTML = '<option value="">Nenhum template disponível</option>';
                    console.warn('⚠️ Nenhum template encontrado');
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar templates:', error);
            const templateSelect = document.getElementById('userModeloMensagem');
            if (templateSelect) {
                templateSelect.innerHTML = '<option value="">Erro ao carregar templates</option>';
            }
            this.showAlert('Erro ao carregar templates. Verifique as credenciais da API.', 'warning');
        }
    }

    async submitUserCampaign() {
        // Validar seleções obrigatórias
        const selectedAccountId = document.getElementById('userAccountSelect').value;
        const selectedInboxId = document.getElementById('userInboxSelect').value;
        
        if (!selectedAccountId) {
            this.showAlert('Por favor, selecione uma conta antes de criar a campanha', 'warning');
            return;
        }
        
        if (!selectedInboxId) {
            this.showAlert('Por favor, selecione uma caixa de entrada antes de criar a campanha', 'warning');
            return;
        }

        // Validar se a caixa de entrada não é Evolution API
        try {
            const accountInboxes = await this.loadInboxesForAccount(selectedAccountId);
            const selectedInboxInfo = accountInboxes.find(inbox => String(inbox.id) === String(selectedInboxId));
            
            if (selectedInboxInfo && isEvolutionAPIInbox(selectedInboxInfo)) {
                console.warn('⚠️ Campanhas não são permitidas com Evolution API');
                this.showEvolutionAPIModal(selectedInboxInfo.name);
                return;
            }
        } catch (error) {
            console.error('❌ Erro ao validar tipo da caixa de entrada:', error);
            this.showAlert('Erro ao validar caixa de entrada. Tente novamente.', 'danger');
            return;
        }

        const form = document.getElementById('userCampaignForm');
        const formData = new FormData(form);
        
        const campanhaData = {
            name: document.getElementById('userCampanhaNome').value,
            type: document.querySelector('input[name="userMetodoEnvio"]:checked').value,
            template_name: document.getElementById('userModeloMensagem').value,
            chatwoot_account_id: selectedAccountId,
            chatwoot_inbox_id: selectedInboxId
        };

        if (campanhaData.type === 'tag') {
            campanhaData.tag_name = document.getElementById('userTagNome').value;
        }

        if (document.getElementById('userAgendarEnvio').checked) {
            const data = document.getElementById('userDataEnvio').value;
            const hora = document.getElementById('userHoraEnvio').value;
            if (data && hora) {
                // Criar datetime como horário local do Brasil (sem conversão de fuso)
                const localDateTime = `${data}T${hora}:00`;
                
                // Interpretar como horário do Brasil e manter o mesmo
                const date = new Date(localDateTime);
                
                // Verificar se a data é válida
                if (isNaN(date.getTime())) {
                    this.showAlert('Data/hora inválida para agendamento', 'warning');
                    return;
                }
                
                // Verificar se não é uma data passada
                const now = new Date();
                if (date <= now) {
                    this.showAlert('A data/hora do agendamento deve ser no futuro', 'warning');
                    return;
                }
                
                // Enviar apenas o datetime local sem timezone (será interpretado como horário do Brasil)
                campanhaData.scheduled_at = localDateTime;
                
                console.log(`📅 Agendamento criado: ${localDateTime} (horário do Brasil)`);
                console.log(`📅 Valor enviado para API: ${campanhaData.scheduled_at}`);
            }
        }

        // Obter nomes da conta e caixa de entrada para exibir no modal
        const accountSelect = document.getElementById('userAccountSelect');
        const inboxSelect = document.getElementById('userInboxSelect');
        campanhaData.accountName = accountSelect.options[accountSelect.selectedIndex]?.text || 'N/A';
        campanhaData.inboxName = inboxSelect.options[inboxSelect.selectedIndex]?.text || 'N/A';

        // Mostrar modal de confirmação
        this.showCampaignConfirmationModal(campanhaData, async () => {
            try {
                const response = await this.apiRequest('/api/campaigns', {
                    method: 'POST',
                    body: JSON.stringify(campanhaData)
                });

                if (response.success) {
                    const campaignId = response.campaign.id;
                    
                    // Se for CSV, fazer upload
                    if (campanhaData.type === 'csv') {
                        const csvFile = document.getElementById('userCsvContatos').files[0];
                        if (csvFile) {
                            const uploadFormData = new FormData();
                            uploadFormData.append('file', csvFile);
                            
                            await fetch(`/api/campaigns/${campaignId}/upload-csv`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${this.token}` },
                                body: uploadFormData
                            });
                        }
                    }

                    // Se não for agendado, iniciar
                    if (!document.getElementById('userAgendarEnvio').checked) {
                        await this.apiRequest(`/api/campaigns/${campaignId}/start`, {
                            method: 'POST'
                        });
                    }

                    this.showAlert('Campanha criada com sucesso!', 'success');
                    this.hideUserCampaignInterface();
                    this.loadUserDashboardStats(); // Recarregar estatísticas
                } else {
                    this.showAlert(response.error || 'Erro ao criar campanha', 'danger');
                }
            } catch (error) {
                console.error('Erro ao criar campanha:', error);
                this.showAlert('Erro ao criar campanha', 'danger');
            }
        });
    }

    async loadUserDashboardStats() {
        try {
            const campaigns = await this.apiRequest('/api/campaigns');
            this.renderDashboardStats(campaigns, 'Minhas Campanhas');
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
        }
    }

    async loadAdminDashboardStats() {
        try {
            // Tentar primeiro o endpoint específico para admin
            let campaigns;
            try {
                campaigns = await this.apiRequest('/api/campaigns');
            } catch (error) {
                // Se não existir, usar o endpoint padrão (que pode retornar todas as campanhas para admin)
                console.log('Endpoint /api/campaigns não encontrado, usando endpoint padrão');
                campaigns = await this.apiRequest('/api/campaigns');
            }
            this.renderDashboardStats(campaigns, 'Todas as Campanhas');
        } catch (error) {
            console.error('Erro ao carregar estatísticas de admin:', error);
        }
    }

    renderDashboardStats(campaigns, title) {
        const container = document.getElementById('userDashboardStats');
        if (!container) return;
        
        // Calcular estatísticas
        const total = campaigns.length;
        const running = campaigns.filter(c => c.status === 'running').length;
        const completed = campaigns.filter(c => c.status === 'completed').length;
        const pending = campaigns.filter(c => c.status === 'pending').length;
        
        // Calcular total de contatos enviados
        const totalSent = campaigns.reduce((sum, c) => sum + (parseInt(c.sent_count) || 0), 0);
        
        // Calcular total de falhas de envio
        const totalFailed = campaigns.reduce((sum, c) => sum + (parseInt(c.failed_count) || 0), 0);
        
        // Atualizar texto de boas-vindas baseado no título
        const welcomeSection = document.querySelector('.welcome-section h4');
        if (welcomeSection) {
            if (title === 'Todas as Campanhas') {
                welcomeSection.innerHTML = '<i class="fas fa-chart-line me-2"></i>Dashboard Administrativo - Todas as Campanhas';
            } else {
                welcomeSection.innerHTML = '<i class="fas fa-hand-wave me-2"></i>Bem-vindo ao Sistema de Campanhas WhatsApp!';
            }
        }
        
        container.innerHTML = `
            <div class="col-12 mb-3">
                <h5 class="text-muted">
                    <i class="fas fa-chart-line me-2"></i>${title}
                </h5>
            </div>
            <div class="col-md-2 mb-3">
                <div class="card border-0 bg-primary text-white">
                    <div class="card-body text-center">
                        <i class="fas fa-chart-bar fa-2x mb-2"></i>
                        <h3 class="mb-0">${total}</h3>
                        <small>Total de Campanhas</small>
                    </div>
                </div>
            </div>
            <div class="col-md-2 mb-3">
                <div class="card border-0 bg-warning text-white">
                    <div class="card-body text-center">
                        <i class="fas fa-clock fa-2x mb-2"></i>
                        <h3 class="mb-0">${running + pending}</h3>
                        <small>Em Andamento</small>
                    </div>
                </div>
            </div>
            <div class="col-md-2 mb-3">
                <div class="card border-0 bg-success text-white">
                    <div class="card-body text-center">
                        <i class="fas fa-check-circle fa-2x mb-2"></i>
                        <h3 class="mb-0">${completed}</h3>
                        <small>Concluídas</small>
                    </div>
                </div>
            </div>
            <div class="col-md-2 mb-3">
                <div class="card border-0 bg-info text-white">
                    <div class="card-body text-center">
                        <i class="fas fa-paper-plane fa-2x mb-2"></i>
                        <h3 class="mb-0">${totalSent.toLocaleString()}</h3>
                        <small>Mensagens Enviadas</small>
                    </div>
                </div>
            </div>
            <div class="col-md-2 mb-3">
                <div class="card border-0 bg-danger text-white">
                    <div class="card-body text-center">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                        <h3 class="mb-0">${totalFailed.toLocaleString()}</h3>
                        <small>Falhas de Envio</small>
                    </div>
                </div>
            </div>
        `;
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

    async showUserManagement() {
        try {
            const users = await this.apiRequest('/api/users');
            const accounts = await this.apiRequest('/api/accounts');
            this.renderUserManagementModal(users, accounts);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            this.showAlert('Erro ao carregar usuários', 'danger');
        }
    }

    async showProviderManagement() {
        try {
            await loadProviders();
            showProviderManager();
        } catch (error) {
            console.error('Erro ao carregar provedores:', error);
            showAlert('Erro ao carregar provedores', 'danger');
        }
    }

    renderUserManagementModal(users, accounts) {
        // Criar modal se não existir
        let modal = document.getElementById('userManagementModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = 'userManagementModal';
            modal.innerHTML = `
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-users me-2"></i>Gerenciamento de Usuários
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <div>
                                    <h6 class="mb-0">Usuários do Sistema</h6>
                                    <small class="text-muted">Gerencie usuários e suas permissões de acesso</small>
                                </div>
                                <button class="btn btn-primary" onclick="window.app.showCreateUserForm()">
                                    <i class="fas fa-plus me-2"></i>Novo Usuário
                                </button>
                            </div>
                            <div id="usersList"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-2"></i>Fechar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Renderizar lista de usuários
        this.renderUsersList(users, accounts);
        
        // Mostrar modal
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
    }

    renderUsersList(users, accounts) {
        const container = document.getElementById('usersList');
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-users fa-3x mb-3"></i>
                    <h5>Nenhum usuário encontrado</h5>
                    <p>Clique em "Novo Usuário" para adicionar o primeiro usuário ao sistema.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-light">
                        <tr>
                            <th><i class="fas fa-user me-2"></i>Usuário</th>
                            <th><i class="fas fa-shield-alt me-2"></i>Perfil</th>
                            <th><i class="fas fa-building me-2"></i>Contas Atribuídas</th>
                            <th><i class="fas fa-calendar me-2"></i>Criado em</th>
                            <th><i class="fas fa-cogs me-2"></i>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        users.forEach(user => {
            const assignedAccounts = user.assigned_accounts || [];
            const accountNames = assignedAccounts.map(id => {
                const account = accounts.find(acc => acc.id === id);
                return account ? account.name : `Conta ${id}`;
            });

            const roleLabel = user.role === 'admin' ? 
                '<span class="badge bg-danger fs-6"><i class="fas fa-crown me-1"></i>Admin</span>' : 
                '<span class="badge bg-primary fs-6"><i class="fas fa-user me-1"></i>Usuário</span>';

            const canDelete = user.id !== this.user.id; // Não pode excluir a si mesmo

            const accountsDisplay = assignedAccounts.length === 0 ? 
                '<span class="text-muted"><i class="fas fa-ban me-1"></i>Nenhuma</span>' :
                user.role === 'admin' ? 
                '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Todas (Admin)</span>' :
                accountNames.map(name => `<span class="badge bg-light text-dark me-1">${name}</span>`).join('');

            html += `
                <tr>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="avatar-circle me-3">
                                ${user.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <strong>${user.username}</strong>
                                ${user.id === this.user.id ? '<br><small class="text-success"><i class="fas fa-check-circle me-1"></i>Você</small>' : ''}
                            </div>
                        </div>
                    </td>
                    <td>${roleLabel}</td>
                    <td>${accountsDisplay}</td>
                    <td>
                        <small class="text-muted">
                            ${new Date(user.created_at).toLocaleDateString('pt-BR')}
                            <br>
                            ${new Date(user.created_at).toLocaleTimeString('pt-BR')}
                        </small>
                    </td>
                    <td>
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-outline-primary" onclick="editUser(${user.id})" title="Editar usuário">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${canDelete ? `
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id}, '${user.username}')" title="Excluir usuário">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-outline-secondary" disabled title="Não é possível excluir seu próprio usuário">
                                    <i class="fas fa-lock"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        
        // Adicionar CSS para avatar circle se não existir
        if (!document.getElementById('avatarStyles')) {
            const style = document.createElement('style');
            style.id = 'avatarStyles';
            style.textContent = `
                .avatar-circle {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(45deg, #007bff, #0056b3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 16px;
                }
            `;
            document.head.appendChild(style);
        }
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
        try {
            // 1. Carregar contas
            await this.loadAccounts();
            
            // 2. Carregar inboxes de todas as contas
            this.inboxes = [];
            
            for (const account of this.accounts) {
                try {
                    
                    const inboxes = await this.apiRequest(`/api/accounts/${account.id}/inboxes`);
                    
                    if (Array.isArray(inboxes) && inboxes.length > 0) {
                        this.inboxes = this.inboxes.concat(inboxes);
                        
                    } else {
                        console.warn(`⚠️ Nenhuma inbox encontrada para conta ${account.name}`);
                    }
                } catch (e) {
                    console.warn(`❌ Erro ao carregar inboxes da conta ${account.name} (${account.id}):`, e);
                }
            }
            
            
            // 3. Populações dos selects (importante fazer depois de carregar dados)
            // Não popular selects do dashboard aqui, pois já são carregados por loadDashboardSelects
            // this.populateAccountSelect();
            // this.populateInboxSelect();
            
            // 4. Carregar templates apenas para admins (usuários comuns carregam templates específicos depois)
            if (this.user.role === 'admin') {
                try {
            await this.loadWorkflowTemplates();
                } catch (error) {
                    console.warn('⚠️ Erro ao carregar templates globais (continuando mesmo assim):', error);
                    this.workflowTemplates = []; // Inicializar como array vazio
                }
            } else {
                // Para usuários comuns, inicializar como array vazio
                // Templates serão carregados quando selecionarem conta/inbox específica
                this.workflowTemplates = [];
                
            }
            
            // 5. Carregar fluxos ativos apenas para admins
            if (this.user.role === 'admin') {
            await this.loadActiveWorkflows();
            } else {
                // Para usuários comuns, inicializar como array vazio
                this.activeWorkflows = [];
            }
            
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados iniciais:', error);
        }
    }

    async loadAccounts() {
        try {
            
            this.accounts = await this.apiRequest('/api/accounts');
            
            
            
            if (this.accounts && this.accounts.length > 0) {
               // console.log('✅ Contas disponíveis:', this.accounts.map(acc => ({ id: acc.id, name: acc.name })));
            } else {
                console.warn('⚠️ Nenhuma conta retornada pela API', this.accounts);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar contas:', error);
            this.showAlert('Erro ao carregar contas', 'danger');
            // Garantir que accounts seja um array vazio em caso de erro
            this.accounts = [];
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
            // Verificar se o usuário tem permissão para carregar templates globais
            if (this.user.role !== 'admin') {
                
                this.workflowTemplates = [];
                this.populateTemplateSelect();
                return;
            }
            
            // Para carregar templates globais, precisamos de uma conta e inbox selecionada
            // Como isso é chamado durante a inicialização, vamos pular e carregar depois
            
            this.workflowTemplates = [];
            this.populateTemplateSelect();
        } catch (error) {
            console.error('❌ Erro ao carregar templates:', error);
            // Inicializar como array vazio para evitar erros posteriores
            this.workflowTemplates = [];
            this.populateTemplateSelect();
        }
    }

    async loadActiveWorkflows(forceRefresh = false) {
        try {
            // Verificar se o usuário tem permissão para carregar workflows ativos
            if (this.user.role !== 'admin') {
                
                this.activeWorkflows = [];
                this.populateActiveWorkflows();
                return;
            }
            
            
            
            const headers = {};
            if (forceRefresh) {
                headers['Cache-Control'] = 'no-cache';
                headers['Pragma'] = 'no-cache';
            }
            
            this.activeWorkflows = await this.apiRequest('/api/inbox-workflows', { headers });
            this.populateActiveWorkflows();
            
           
        } catch (error) {
            console.error('❌ Erro ao carregar fluxos ativos:', error);
            // Inicializar como array vazio para evitar erros posteriores
            this.activeWorkflows = [];
            this.populateActiveWorkflows();
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
                await this.loadActiveWorkflowForEditor(accountId, inboxId);
            }
        } catch (error) {
            console.error('Erro ao carregar fluxo:', error);
        }
    }

    populateAccountSelect() {
        const select = document.getElementById('accountSelect');
        if (!select) {
            console.log('📋 Select de contas não encontrado (normal para usuários)');
            return; // Elemento pode não existir para usuários comuns
        }
        
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
        
        console.log(`📋 Select de contas populado com ${this.accounts.length} opções`);
    }

    populateInboxSelect() {
        const select = document.getElementById('inboxSelect');
        if (!select) {
            console.log('📋 Select de caixas não encontrado (normal para usuários)');
            return; // Elemento pode não existir para usuários comuns
        }
        
        select.innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
        

        
        this.inboxes.forEach(inbox => {
            const option = document.createElement('option');
            option.value = inbox.id;
            
            // Adicionar indicador visual para diferentes tipos de caixas
            // Usar funções utilitárias globais
            if (isWhatsAppAPIInbox(inbox)) {
                option.textContent = `📱 ${inbox.name} (WhatsApp API)`;
            } else if (isEvolutionAPIInbox(inbox)) {
                option.textContent = `🔄 ${inbox.name} (Evolution API)`;
            } else if (isWebsiteInbox(inbox)) {
                option.textContent = `🌐 ${inbox.name} (Website)`;
            } else {
                option.textContent = `❌ ${inbox.name} (Não suportado)`;
                option.disabled = true;
            }
            
            select.appendChild(option);
        });
        
        // Garantir que o select seja clicável
        select.style.pointerEvents = 'auto';
        select.style.zIndex = '1';
        
        console.log(`📋 Select de caixas populado com ${this.inboxes.length} opções`);
    }

    populateTemplateSelect() {
        const select = document.getElementById('workflowTemplate');
        if (!select) {
            console.log('📋 Select de templates não encontrado (normal para usuários)');
            return; // Elemento pode não existir para usuários comuns
        }
        
        select.innerHTML = '<option value="">Selecione um template...</option>';
        
        // Verificar se há templates carregados
        if (this.workflowTemplates && this.workflowTemplates.length > 0) {
        this.workflowTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.name;
                option.textContent = template.displayName || template.name;
            select.appendChild(option);
        });
            console.log(`📋 Select de templates populado com ${this.workflowTemplates.length} opções`);
        } else {
            // Se não há templates, mostrar mensagem informativa
            const option = document.createElement('option');
            option.value = '';
            option.textContent = this.user.role === 'admin' ? 
                'Nenhum template disponível' : 
                'Selecione uma conta e caixa de entrada primeiro';
            option.disabled = true;
            select.appendChild(option);
           
        }
    }

    populateActiveWorkflows() {
        const container = document.getElementById('activeWorkflows');
        if (!container) {
            console.log('📋 Container de workflows ativos não encontrado (normal para usuários)');
            return; // Elemento pode não existir para usuários comuns
        }
        
        container.innerHTML = '';
        
        // Verificar se há workflows ativos carregados
        if (!this.activeWorkflows || this.activeWorkflows.length === 0) {
            const message = this.user.role === 'admin' ? 
                'Nenhum fluxo ativo' : 
                'Workflows ativos disponíveis apenas para administradores';
            container.innerHTML = `<p class="text-muted text-center">${message}</p>`;
            return;
        }
        
        this.activeWorkflows.forEach(async (workflow) => {
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
            
            // Verificar se há agente IA vinculado
            let aiAgentInfo = '';
            try {
                const agentResponse = await fetch(`/api/workflows/${workflow.workflow_name}/ai-agent`, {
                    headers: {
                        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
                    }
                });
                if (agentResponse.ok) {
                    const agentData = await agentResponse.json();
                    if (agentData.agent) {
                        aiAgentInfo = `<span class="badge bg-warning ms-2"><i class="fas fa-robot me-1"></i>Agente IA: ${agentData.agent.name}</span>`;
                    }
                }
            } catch (error) {
                console.log('Erro ao verificar agente IA:', error);
            }
            
            const item = document.createElement('div');
            item.className = 'workflow-item';
            item.innerHTML = `
                <div class="workflow-info">
                    <h6 class="workflow-name">
                        ${workflow.workflow_name}
                        ${aiAgentInfo || '<span class="badge bg-info ms-2"><i class="fas fa-cogs me-1"></i>Fluxo Estático</span>'}
                    </h6>
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
        
        // Renderizar seção de Auto Follow-up se existir
        if (config.auto_followup) {
            html += this.renderAutoFollowupSection(config.auto_followup, config.blocks);
        }

        // Renderizar seção de Pause Bot se existir
        const blocksWithPauseBot = Object.values(config.blocks).filter(block => block.pause_bot === true);
        if (blocksWithPauseBot.length > 0) {
            html += this.renderPauseBotSection(blocksWithPauseBot);
        }
        
        // Função para detectar bloco inicial
        const getInitialBlock = (blocks) => {
            if (blocks.bloco_1) return 'bloco_1';
            if (blocks.bloco_01) return 'bloco_01';
            
            const blockKeys = Object.keys(blocks);
            const initialBlockPatterns = [
                'bloco_1', 'bloco_01', 'bloco_001',
                'inicio', 'start', 'welcome', 'boas_vindas'
            ];
            
            for (const pattern of initialBlockPatterns) {
                if (blockKeys.includes(pattern)) {
                    return pattern;
                }
            }
            
            return blockKeys[0] || null;
        };

        const initialBlockName = getInitialBlock(config.blocks);
        
        Object.entries(config.blocks).forEach(([blockId, block]) => {
            const isStart = blockId === initialBlockName;
            const isEnd = block.type === 'end';
            
            html += `
                <div class="workflow-block ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''} ${block.pause_bot ? 'pause-bot' : ''}">
                    <div class="block-header">
                        <h6 class="block-title">${block.name || blockId}</h6>
                        <span class="block-type ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''} default">
                            ${isStart ? 'Início' : isEnd ? 'Fim' : blockId}
                        </span>
                        ${block.pause_bot ? '<span class="pause-bot-indicator"><i class="fas fa-pause-circle"></i> Pause Bot</span>' : ''}
                    </div>
                    <div class="block-message">${block.message || ''}</div>
                    ${this.renderBlockMedia(block)}
                    ${this.renderBlockActions(block)}
                    ${this.renderBlockAutoFollowup(blockId, config.auto_followup)}
                    ${block.buttons ? `
                        <div class="block-buttons">
                            ${block.buttons.map(btn => this.renderButtonWithTooltip(btn, config.blocks)).join('')}
                        </div>
                    ` : ''}
                    ${!block.buttons && block.next_block ? this.renderBlockNextBlock(block, config.blocks) : ''}
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

    renderAutoFollowupSection(autoFollowupConfig, blocks) {
        if (!autoFollowupConfig || Object.keys(autoFollowupConfig).length === 0) {
            return '';
        }

        let html = `
            <div class="auto-followup-section">
                <div class="auto-followup-header">
                    <h6 class="auto-followup-title">
                        <i class="fas fa-clock me-2"></i>Auto Follow-up
                    </h6>
                    <span class="auto-followup-badge">Configurado</span>
                </div>
                <div class="auto-followup-content">
        `;

        Object.entries(autoFollowupConfig).forEach(([blockId, followup]) => {
            const block = blocks[blockId];
            const blockName = block ? (block.name || blockId) : blockId;
            const delayMinutes = Math.round(followup.delay / 60);
            const delayHours = Math.round(followup.delay / 3600);
            
            let delayText = '';
            if (delayHours >= 1) {
                delayText = `${delayHours}h ${Math.round((followup.delay % 3600) / 60)}min`;
            } else {
                delayText = `${delayMinutes}min`;
            }

            html += `
                <div class="auto-followup-item">
                    <div class="auto-followup-block-info">
                        <i class="fas fa-arrow-right me-2"></i>
                        <strong>${blockName}</strong>
                        <span class="auto-followup-delay">(${delayText})</span>
                    </div>
                    <div class="auto-followup-details">
                        <small class="text-muted">
                            <i class="fas fa-info-circle me-1"></i>
                            Delay: ${followup.delay} segundos
                            ${followup.condition ? `| Condição: ${followup.condition}` : ''}
                        </small>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    renderBlockAutoFollowup(blockId, autoFollowupConfig) {
        if (!autoFollowupConfig || !autoFollowupConfig[blockId]) {
            return '';
        }

        const followup = autoFollowupConfig[blockId];
        const delayMinutes = Math.round(followup.delay / 60);
        const delayHours = Math.round(followup.delay / 3600);
        
        let delayText = '';
        if (delayHours >= 1) {
            delayText = `${delayHours}h ${Math.round((followup.delay % 3600) / 60)}min`;
        } else {
            delayText = `${delayMinutes}min`;
        }

        return `
            <div class="block-auto-followup">
                <div class="auto-followup-indicator">
                    <i class="fas fa-clock me-2"></i>
                    <span class="auto-followup-text">
                        Auto Follow-up: ${delayText}
                    </span>
                    <small class="text-muted ms-2">
                        (${followup.delay}s)
                    </small>
                </div>
            </div>
        `;
    }

    renderBlockNextBlock(block, allBlocks) {
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

    renderPauseBotSection(blocksWithPauseBot) {
        return `
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
            </div>
        `;
    }

    renderButtonWithTooltip(button, allBlocks) {
        const tooltipInfo = this.generateButtonTooltip(button, allBlocks);
        
        // Verificar se o botão tem configuração de auto_followup
        const hasAutoFollowupConfig = button.auto_followup_disabled !== undefined;
        const autoFollowupIcon = hasAutoFollowupConfig 
            ? (button.auto_followup_disabled ? '🚫' : '✅')
            : '';
        
        return `
            <span class="block-button ${hasAutoFollowupConfig ? 'has-auto-followup' : ''}" 
                  data-tooltip="${tooltipInfo.replace(/"/g, '&quot;')}" 
                  title="${tooltipInfo.replace(/"/g, '&quot;')}">
                ${button.text}
                ${autoFollowupIcon ? `<span class="auto-followup-icon">${autoFollowupIcon}</span>` : ''}
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
        
        // Auto Follow-up settings
        if (button.auto_followup_disabled !== undefined) {
            if (button.auto_followup_disabled) {
                tooltipParts.push(`🚫 Desativar Auto Follow-up`);
            } else {
                tooltipParts.push(`✅ Ativar Auto Follow-up`);
            }
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
        let originalText = null;
        if (saveButton) {
            originalText = saveButton.innerHTML;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Salvando...';
            saveButton.disabled = true;
        }

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
            // Restaurar botão se existir
            if (saveButton && originalText) {
                saveButton.innerHTML = originalText;
                saveButton.disabled = false;
            }
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
                            <small class="text-muted">Salvo em: ${new Date().toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'})}</small>
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

    // Função para mostrar modal de confirmação de campanha
    showCampaignConfirmationModal(campaignData, submitFunction) {
        // Preencher detalhes da campanha
        document.getElementById('confirmCampaignName').textContent = campaignData.name || 'N/A';
        document.getElementById('confirmCampaignType').textContent = this.getCampaignTypeDisplay(campaignData.type);
        document.getElementById('confirmCampaignTemplate').textContent = campaignData.template_name || 'N/A';
        document.getElementById('confirmCampaignAccount').textContent = campaignData.accountName || 'N/A';
        document.getElementById('confirmCampaignInbox').textContent = campaignData.inboxName || 'N/A';
        
        // Informações de agendamento
        if (campaignData.scheduled_at) {
            const scheduledDate = new Date(campaignData.scheduled_at);
            const formattedDate = scheduledDate.toLocaleDateString('pt-BR');
            const formattedTime = scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            document.getElementById('confirmCampaignSchedule').textContent = `${formattedDate} às ${formattedTime}`;
        } else {
            document.getElementById('confirmCampaignSchedule').textContent = 'Envio imediato';
        }
        
        // Informações de destinatários
        document.getElementById('confirmRecipientMethod').textContent = this.getRecipientMethodDisplay(campaignData.type);
        
        // Quantidade estimada baseada no tipo
        let estimatedCount = 'N/A';
        let recipientDetails = '';
        
        if (campaignData.type === 'tag') {
            estimatedCount = 'Todos os contatos com a tag';
            recipientDetails = `<p><strong>Tag:</strong> ${campaignData.tag_name || 'N/A'}</p>`;
        } else if (campaignData.type === 'csv') {
            // Usar o ID correto do input de arquivo CSV
            const csvFile = document.getElementById('csvFile')?.files[0];
            if (csvFile) {
                estimatedCount = 'Contatos do arquivo CSV';
                recipientDetails = `<p><strong>Arquivo:</strong> ${csvFile.name}</p>`;
                
                // Tentar contar linhas do CSV (excluindo cabeçalho)
                const reader = new FileReader();
                reader.onload = function(e) {
                    const content = e.target.result;
                    const lines = content.split('\n').filter(line => line.trim() !== '');
                    const estimatedContacts = Math.max(0, lines.length - 1); // -1 para excluir cabeçalho
                    
                    if (estimatedContacts > 0) {
                        document.getElementById('confirmRecipientCount').textContent = `Aproximadamente ${estimatedContacts} contatos`;
                    }
                };
                reader.readAsText(csvFile);
            }
        } else if (campaignData.type === 'all') {
            estimatedCount = 'Todos os contatos da caixa de entrada';
        }
        
        document.getElementById('confirmRecipientCount').textContent = estimatedCount;
        document.getElementById('confirmRecipientDetails').innerHTML = recipientDetails;
        
        // Resetar checkboxes e botão
        const termsCheck = document.getElementById('confirmTermsCheck');
        const dataCheck = document.getElementById('confirmDataCheck');
        const confirmBtn = document.getElementById('confirmCampaignBtn');
        
        termsCheck.checked = false;
        dataCheck.checked = false;
        confirmBtn.disabled = true;
        
        // Função para atualizar estado do botão
        const updateConfirmButton = () => {
            const bothChecked = termsCheck.checked && dataCheck.checked;
            document.getElementById('confirmCampaignBtn').disabled = !bothChecked;
            console.log('Checkboxes:', { terms: termsCheck.checked, data: dataCheck.checked, buttonEnabled: bothChecked });
        };
        
        // Remover event listeners anteriores
        termsCheck.removeEventListener('change', updateConfirmButton);
        dataCheck.removeEventListener('change', updateConfirmButton);
        
        // Adicionar novos event listeners
        termsCheck.addEventListener('change', updateConfirmButton);
        dataCheck.addEventListener('change', updateConfirmButton);
        
        // Event listener para botão de confirmação
        // Adicionar event listener para fechar modal com ESC
        const modalElement = document.getElementById('campaignConfirmationModal');
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                    cleanupModal();
                }
            }
        };
        
        const cleanupModal = () => {
            // Remover backdrop
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            // Limpar classes do body
            document.body.classList.remove('modal-open');
            document.body.style.paddingRight = '';
            // Remover event listener
            document.removeEventListener('keydown', handleEscape);
        };
        
        document.addEventListener('keydown', handleEscape);
        
        // Adicionar event listener para quando o modal for fechado
        modalElement.addEventListener('hidden.bs.modal', cleanupModal);
        const handleConfirm = async () => {
            try {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Enviando...';
                
                // Fechar modal corretamente
                const modalElement = document.getElementById('campaignConfirmationModal');
                const modal = bootstrap.Modal.getInstance(modalElement);
                
                // Remover focus do botão antes de fechar o modal
                confirmBtn.blur();
                
                // Fechar modal
                modal.hide();
                
                // Remover backdrop manualmente se necessário
                setTimeout(() => {
                    cleanupModal();
                }, 150);
                
                // Executar função de submissão
                await submitFunction();
                
            } catch (error) {
                console.error('Erro ao confirmar campanha:', error);
                this.showAlert('Erro ao enviar campanha', 'danger');
            }
        };
        
        // Remover event listener anterior do botão
        const oldConfirmBtn = document.getElementById('confirmCampaignBtn');
        const newConfirmBtn = oldConfirmBtn.cloneNode(true);
        oldConfirmBtn.parentNode.replaceChild(newConfirmBtn, oldConfirmBtn);
        
        // Adicionar novo event listener
        newConfirmBtn.addEventListener('click', handleConfirm);
        
        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('campaignConfirmationModal'));
        modal.show();
    }
    
    // Função auxiliar para exibir tipo de campanha
    getCampaignTypeDisplay(type) {
        const types = {
            'tag': 'Envio por Tag',
            'csv': 'Envio por CSV',
            'all': 'Envio para Todos'
        };
        return types[type] || type;
    }
    
    // Função auxiliar para exibir método de destinatários
    getRecipientMethodDisplay(type) {
        const methods = {
            'tag': 'Contatos com tag específica',
            'csv': 'Contatos do arquivo CSV',
            'all': 'Todos os contatos da caixa'
        };
        return methods[type] || type;
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
        const divs = ['loginDiv', 'changePasswordDiv', 'mediaManagerDiv', 'campaignFormArea'];
        divs.forEach(divId => this.hideDiv(divId));
    }

    // Função para mostrar o formulário unificado de campanha
    showUnifiedCampaignForm() {
        // Obter valores selecionados no dashboard (usando IDs corretos baseado no role)
        const accountSelectId = this.user.role === 'admin' ? 'accountSelect' : 'userAccountSelect';
        const inboxSelectId = this.user.role === 'admin' ? 'inboxSelect' : 'userInboxSelect';
        
        const accountSelect = document.getElementById(accountSelectId);
        const inboxSelect = document.getElementById(inboxSelectId);
        const selectedAccountId = accountSelect.value;
        const selectedInboxId = inboxSelect.value;
        const selectedAccountName = accountSelect.options[accountSelect.selectedIndex]?.text;
        const selectedInboxName = inboxSelect.options[inboxSelect.selectedIndex]?.text;
        
        console.log(`📋 Valores selecionados: Conta ${selectedAccountName} (${selectedAccountId}), Caixa ${selectedInboxName} (${selectedInboxId})`);
        
        // Ocultar áreas principais baseadas no role
        if (this.user.role === 'admin') {
            // Admin: ocultar tanto adminMainArea quanto userMainArea
            const adminMainArea = document.getElementById('adminMainArea');
            const userMainArea = document.getElementById('userMainArea');
            
            console.log(`🔍 Procurando adminMainArea:`, adminMainArea ? '✅ Encontrado' : '❌ Não encontrado');
            console.log(`🔍 Procurando userMainArea:`, userMainArea ? '✅ Encontrado' : '❌ Não encontrado');
            
            if (adminMainArea) {
                adminMainArea.style.display = 'none';
                console.log('✅ adminMainArea ocultado');
            } else {
                console.error('❌ adminMainArea não encontrado!');
            }
            
            if (userMainArea) {
                userMainArea.style.display = 'none';
                console.log('✅ userMainArea ocultado');
            } else {
                console.error('❌ userMainArea não encontrado!');
            }
        } else {
            // User: ocultar apenas userMainArea
            const userMainArea = document.getElementById('userMainArea');
            console.log(`🔍 Procurando userMainArea:`, userMainArea ? '✅ Encontrado' : '❌ Não encontrado');
            if (userMainArea) {
                userMainArea.style.display = 'none';
                console.log('✅ userMainArea ocultado');
            } else {
                console.error('❌ userMainArea não encontrado!');
            }
        }
        
        // Mostrar formulário de campanha
        this.showDiv('campaignFormArea');
        this.setupUnifiedCampaignForm();
        this.loadUnifiedCampaignData(selectedAccountId, selectedInboxId);
    }

    // Configurar o formulário unificado
    setupUnifiedCampaignForm() {
        const form = document.getElementById('unifiedCampaignForm');
        if (!form) return;

        // Configurar mudança de método de envio
        const methodInputs = form.querySelectorAll('input[name="methodType"]');
        methodInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.toggleMethodDetails(input.value);
            });
        });

        // Configurar agendamento
        const scheduleCheckbox = document.getElementById('scheduleCampaign');
        const scheduleFields = document.getElementById('scheduleFields');
        const scheduleDate = document.getElementById('scheduleDate');
        const scheduleTime = document.getElementById('scheduleTime');
        const submitBtn = document.getElementById('submitCampaignBtn');

        if (scheduleCheckbox && scheduleFields) {
            scheduleCheckbox.addEventListener('change', () => {
                if (scheduleCheckbox.checked) {
                    scheduleFields.style.display = 'block';
                    submitBtn.innerHTML = '<i class="fas fa-calendar me-2"></i>Agendar Campanha';
                    this.fillCurrentDateTime(scheduleDate, scheduleTime);
                } else {
                    scheduleFields.style.display = 'none';
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Enviar Agora';
                }
            });
        }

            // Configurar mudança de conta (para ambos os roles)
    const accountSelect = document.getElementById('unifiedAccountSelect');
    if (accountSelect) {
        accountSelect.addEventListener('change', async (e) => {
            await this.onUnifiedAccountChange();
        });
    }

        // Configurar submit do formulário
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitUnifiedCampaign();
        });

        // Inicializar com CSV selecionado por padrão
        this.toggleMethodDetails('csv');

        // Configurar fechamento
        const closeBtn = document.getElementById('closeCampanha');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideDiv('campaignFormArea');
                // Mostrar área principal novamente baseada no role
                if (this.user.role === 'admin') {
                    const adminMainArea = document.getElementById('adminMainArea');
                    if (adminMainArea) adminMainArea.style.display = 'block';
                    // Admin não vê userMainArea por padrão
                } else {
                    const userMainArea = document.getElementById('userMainArea');
                    if (userMainArea) userMainArea.style.display = 'block';
                }
            });
        }
    }

    // Alternar detalhes do método de envio
    toggleMethodDetails(methodType) {
        const tagDetails = document.getElementById('tagDetails');
        const csvDetails = document.getElementById('csvDetails');
        const methodAllOption = document.getElementById('methodAllOption');

        // Mostrar opção "Todos os Contatos" apenas para admin
        if (methodAllOption) {
            methodAllOption.style.display = this.user.role === 'admin' ? 'block' : 'none';
        }

        if (methodType === 'tag') {
            tagDetails.style.display = 'block';
            csvDetails.style.display = 'none';
            // Carregar tags quando o método tag for selecionado
            this.loadUnifiedTags();
        } else if (methodType === 'csv') {
            tagDetails.style.display = 'none';
            csvDetails.style.display = 'block';
        } else if (methodType === 'all') {
            tagDetails.style.display = 'none';
            csvDetails.style.display = 'none';
        }
    }

    // Preencher data e hora atual
    fillCurrentDateTime(dateInput, timeInput) {
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
            dateInput.min = today;
        }
        
        if (timeInput) {
            const now = new Date();
            const brazilTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
            const hours = brazilTime.getHours().toString().padStart(2, '0');
            const minutes = brazilTime.getMinutes().toString().padStart(2, '0');
            const timeValue = `${hours}:${minutes}`;
            timeInput.value = timeValue;
        }
    }

    // Carregar dados para o formulário unificado
    async loadUnifiedCampaignData(selectedAccountId = null, selectedInboxId = null) {
        // Configurar interface baseada no role
        this.configureUnifiedInterfaceByRole();
        
        // Se temos valores pré-selecionados, usar eles
        if (selectedAccountId && selectedInboxId) {
            console.log(`📋 Usando valores pré-selecionados: Conta ${selectedAccountId}, Caixa ${selectedInboxId}`);
            
            // Popular selects com valores pré-selecionados
            await this.populateUnifiedSelectsWithPreselected(selectedAccountId, selectedInboxId);
        } else {
            // Carregar contas normalmente
            await this.loadUnifiedAccounts();
        }
        
        // Carregar templates
        await this.loadUnifiedTemplates(selectedAccountId, selectedInboxId);
        
        // Tags serão carregadas apenas quando o método "tag" for selecionado
    }

    // Carregar tags para o formulário unificado
    async loadUnifiedTags() {
        try {
            const response = await fetch('/api/chatwoot/tags', {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const tags = await response.json();
            
            // Implementar autocomplete simples ou datalist
            const input = document.getElementById('tagName');
            if (!input) {
                console.log('Input de tags não encontrado');
                return;
            }
            
            // Remover datalist anterior se existir
            const existingDatalist = document.getElementById('tagsList');
            if (existingDatalist) {
                existingDatalist.remove();
            }
            
            const datalist = document.createElement('datalist');
            datalist.id = 'tagsList';
            input.setAttribute('list', 'tagsList');
            
            if (Array.isArray(tags) && tags.length > 0) {
                tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.title || tag.name;
                    datalist.appendChild(option);
                });
                console.log(`✅ ${tags.length} tags carregadas para autocomplete`);
            } else {
                console.log('ℹ️ Nenhuma tag encontrada para autocomplete');
            }
            
            input.parentNode.appendChild(datalist);
        } catch (error) {
            console.error('❌ Erro ao carregar tags:', error);
            this.showAlert('Erro ao carregar tags. Verifique sua conexão.', 'warning');
        }
    }

    // Carregar templates para o formulário unificado
    async loadUnifiedTemplates(accountId = null, inboxId = null) {
        try {
            console.log('🔍 Carregando templates do WhatsApp para formulário unificado...');
            
            // Se não foram passados, obter dos selects do dashboard
            if (!accountId || !inboxId) {
                const accountSelectId = this.user.role === 'admin' ? 'accountSelect' : 'userAccountSelect';
                const inboxSelectId = this.user.role === 'admin' ? 'inboxSelect' : 'userInboxSelect';
                
                accountId = document.getElementById(accountSelectId)?.value;
                inboxId = document.getElementById(inboxSelectId)?.value;
            }
            
            console.log(`📋 Usando Account ID: ${accountId}, Inbox ID: ${inboxId}`);
            
            // Construir URL com parâmetros se disponíveis
            let url = '/api/whatsapp/templates';
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
            
            // Usar o ID correto do formulário unificado
            const select = document.getElementById('templateSelect');
            if (!select) {
                console.error('❌ Elemento templateSelect não encontrado!');
                return;
            }
            
            select.innerHTML = '<option value="">Selecione um modelo</option>';
            
            if (Array.isArray(templates) && templates.length > 0) {
                // Mostrar templates da API oficial
                const inboxSpecificTemplates = templates.filter(t => t.inboxId);
                let label = `🚀 API Oficial WhatsApp (${templates.length})`;
                if (inboxSpecificTemplates.length > 0) {
                    const inboxName = inboxSpecificTemplates[0].inboxName;
                    label = `🚀 ${inboxName} - API Oficial (${templates.length})`;
                }
                const optgroup = document.createElement('optgroup');
                optgroup.label = label;
                templates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.name;
                    option.textContent = template.displayName || template.name;
                    const sourceText = template.inboxName ? `Caixa: ${template.inboxName}` : 'API Oficial';
                    option.title = `Fonte: ${sourceText} | Status: ${template.status} | Categoria: ${template.category} | Idioma: ${template.language}`;
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
                // Mostrar indicador se templates são específicos de uma caixa
                if (inboxSpecificTemplates.length > 0) {
                    this.showInboxTemplateIndicator(inboxSpecificTemplates[0].inboxName, templates.length);
                }
                console.log(`✅ ${templates.length} templates carregados com sucesso`);
            } else {
                console.warn('⚠️ Nenhum template encontrado');
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Nenhum template disponível - Verifique as credenciais da API oficial e clique em Sincronizar';
                option.disabled = true;
                select.appendChild(option);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar modelos:', error);
            
            // Mostrar erro no select
            const select = document.getElementById('templateSelect');
            if (select) {
                select.innerHTML = '<option value="">Erro ao carregar templates - Verifique as credenciais da API oficial e clique em Sincronizar</option>';
            }
            
            this.showAlert('Erro ao carregar modelos de mensagem. Verifique as credenciais da API oficial e tente sincronizar os templates.', 'danger');
        }
    }

    // Mostrar indicador de templates específicos da caixa
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
        
        // Inserir após o select de templates (em uma linha separada)
        const templateSelect = document.getElementById('templateSelect');
        if (templateSelect && templateSelect.parentNode) {
            // Encontrar o container do campo (form-group ou div pai)
            const fieldContainer = templateSelect.closest('.form-group') || templateSelect.parentNode;
            // Inserir após o container do campo
            fieldContainer.parentNode.insertBefore(indicator, fieldContainer.nextSibling);
        }
    }

    hideSelectedAccountInboxIndicator() {
        // Remover indicador de template da caixa de entrada se existir
        const existingIndicator = document.getElementById('inboxTemplateIndicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
    }

    // Popular selects unificados com valores pré-selecionados
    async populateUnifiedSelectsWithPreselected(accountId, inboxId) {
        try {
            // Carregar contas para obter nomes
            const accounts = await this.apiRequest('/api/accounts');
            const account = accounts.find(acc => acc.id == accountId);
            
            // Carregar caixas para obter nome
            const inboxes = await this.loadInboxesForAccount(accountId);
            const inbox = inboxes.find(inb => inb.id == inboxId);
            
            // Mostrar informações selecionadas
            const accountDisplay = document.getElementById('selectedAccountDisplay');
            const inboxDisplay = document.getElementById('selectedInboxDisplay');
            
            if (accountDisplay && account) {
                accountDisplay.innerHTML = `<i class="fas fa-building me-2"></i>${account.name}`;
            }
            
            if (inboxDisplay && inbox) {
                inboxDisplay.innerHTML = `<i class="fas fa-inbox me-2"></i>${inbox.name}`;
            }
            
            console.log(`✅ Informações exibidas: Conta ${account?.name}, Caixa ${inbox?.name}`);
        } catch (error) {
            console.error('❌ Erro ao aplicar valores pré-selecionados:', error);
        }
    }

    // Carregar contas para o formulário unificado
    async loadUnifiedAccounts() {
        try {
            console.log('🔄 Carregando contas para formulário unificado...');
            const accounts = await this.apiRequest('/api/accounts');
            console.log('📋 Resposta da API de contas:', accounts);
            
            if (Array.isArray(accounts) && accounts.length > 0) {
                console.log(`✅ ${accounts.length} contas recebidas da API`);
                this.populateUnifiedAccountSelect(accounts);
            } else {
                console.warn('⚠️ Resposta da API não contém contas válidas:', accounts);
                this.showAlert('Nenhuma conta encontrada', 'warning');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar contas:', error);
            this.showAlert('Erro ao carregar contas', 'danger');
        }
    }

    // Popular select unificado de contas
    populateUnifiedAccountSelect(accounts) {
        console.log('🔄 Populando select unificado de contas...');
        const accountSelect = document.getElementById('unifiedAccountSelect');
        
        if (!accountSelect) {
            console.error('❌ Elemento unifiedAccountSelect não encontrado!');
            return;
        }
        
        console.log('📋 Contas recebidas para popular:', accounts);
        
        if (accounts && accounts.length > 0) {
            accountSelect.innerHTML = '<option value="">Selecione uma conta...</option>';
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.name;
                accountSelect.appendChild(option);
            });
            accountSelect.disabled = false;
            console.log(`✅ ${accounts.length} contas carregadas no select unificado`);
        } else {
            accountSelect.innerHTML = '<option value="">Nenhuma conta encontrada</option>';
            accountSelect.disabled = true;
            console.warn('⚠️ Nenhuma conta para popular no select');
        }
    }

    // Configurar interface baseada no role
    configureUnifiedInterfaceByRole() {
        const methodAllOption = document.getElementById('methodAllOption');
        
        // Mostrar opção "Todos os Contatos" apenas para admin
        if (methodAllOption) {
            methodAllOption.style.display = this.user.role === 'admin' ? 'block' : 'none';
        }
    }

    // Mudança de conta no formulário unificado (ambos os roles)
    async onUnifiedAccountChange() {
        const accountId = document.getElementById('unifiedAccountSelect').value;
        const inboxSelect = document.getElementById('unifiedInboxSelect');
        
        if (!accountId) {
            inboxSelect.innerHTML = '<option value="">Primeiro selecione uma conta</option>';
            return;
        }

        try {
            const inboxes = await this.loadInboxesForAccount(accountId);
            this.populateUnifiedInboxSelect(inboxes);
        } catch (error) {
            console.error('Erro ao carregar caixas de entrada:', error);
            this.showAlert('Erro ao carregar caixas de entrada', 'danger');
        }
    }

    // Mudança de conta no dashboard (unificado para ambos os roles)
    async onAccountChange() {
        // Usar IDs diferentes baseado no role
        const accountSelectId = this.user.role === 'admin' ? 'accountSelect' : 'userAccountSelect';
        const inboxSelectId = this.user.role === 'admin' ? 'inboxSelect' : 'userInboxSelect';
        
        const accountId = document.getElementById(accountSelectId).value;
        const inboxSelect = document.getElementById(inboxSelectId);
        
        if (!accountId) {
            inboxSelect.innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
            return;
        }

        try {
            console.log(`🔄 Carregando caixas para conta ${accountId} (${this.user.role})...`);
            const inboxes = await this.loadInboxesForAccount(accountId);
            
            if (Array.isArray(inboxes) && inboxes.length > 0) {
                inboxSelect.innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
                inboxes.forEach(inbox => {
                    const option = document.createElement('option');
                    option.value = inbox.id;
                    
                    // Adicionar indicador visual para diferentes tipos de caixas
                    // Usar funções utilitárias globais
                    if (isWhatsAppAPIInbox(inbox)) {
                        option.textContent = `📱 ${inbox.name} (WhatsApp API)`;
                    } else if (isEvolutionAPIInbox(inbox)) {
                        option.textContent = `🔄 ${inbox.name} (Evolution API)`;
                    } else if (isWebsiteInbox(inbox)) {
                        option.textContent = `🌐 ${inbox.name} (Website)`;
                    } else {
                        option.textContent = `❌ ${inbox.name} (Não suportado)`;
                        option.disabled = true;
                    }
                    
                    inboxSelect.appendChild(option);
                });
                console.log(`✅ ${inboxes.length} caixas carregadas para ${this.user.role}`);
            } else {
                inboxSelect.innerHTML = '<option value="">Nenhuma caixa encontrada</option>';
                console.warn('⚠️ Nenhuma caixa encontrada para esta conta');
            }
        } catch (error) {
            console.error(`❌ Erro ao carregar caixas para ${this.user.role}:`, error);
            inboxSelect.innerHTML = '<option value="">Erro ao carregar caixas</option>';
            this.showAlert('Erro ao carregar caixas de entrada', 'danger');
        }
    }

    // Popular select unificado de inboxes
    populateUnifiedInboxSelect(inboxes) {
        const inboxSelect = document.getElementById('unifiedInboxSelect');
        
        if (inboxes.length > 0) {
            inboxSelect.innerHTML = '<option value="">Selecione uma caixa de entrada...</option>';
            inboxes.forEach(inbox => {
                const option = document.createElement('option');
                option.value = inbox.id;
                
                // Adicionar indicador visual para diferentes tipos de caixas
                // Usar funções utilitárias globais
                if (isWhatsAppAPIInbox(inbox)) {
                    option.textContent = `📱 ${inbox.name} (WhatsApp API)`;
                } else if (isEvolutionAPIInbox(inbox)) {
                    option.textContent = `🔄 ${inbox.name} (Evolution API)`;
                } else {
                    option.textContent = `❌ ${inbox.name} (Não suportado)`;
                    option.disabled = true;
                }
                
                inboxSelect.appendChild(option);
            });
            inboxSelect.disabled = false;
            console.log(`✅ ${inboxes.length} caixas carregadas no select unificado`);
        } else {
            inboxSelect.innerHTML = '<option value="">Nenhuma caixa de entrada encontrada</option>';
            inboxSelect.disabled = true;
        }
    }



    // Submeter campanha unificada
    async submitUnifiedCampaign() {
        const formData = new FormData(document.getElementById('unifiedCampaignForm'));
        
        // Validar campos obrigatórios
        const campaignName = formData.get('campaignName');
        const methodType = formData.get('methodType');
        const templateSelect = formData.get('templateSelect');
        
        if (!campaignName || !methodType || !templateSelect) {
            this.showAlert('Por favor, preencha todos os campos obrigatórios', 'warning');
            return;
        }

        // Obter valores selecionados no dashboard (usando IDs corretos baseado no role)
        const accountSelectId = this.user.role === 'admin' ? 'accountSelect' : 'userAccountSelect';
        const inboxSelectId = this.user.role === 'admin' ? 'inboxSelect' : 'userInboxSelect';
        
        const accountSelect = document.getElementById(accountSelectId);
        const inboxSelect = document.getElementById(inboxSelectId);
        const accountId = accountSelect.value;
        const inboxId = inboxSelect.value;
        const accountName = accountSelect.options[accountSelect.selectedIndex]?.text;
        const inboxName = inboxSelect.options[inboxSelect.selectedIndex]?.text;
        
        if (!accountId || !inboxId) {
            this.showAlert('Por favor, selecione uma conta e caixa de entrada no dashboard', 'warning');
            return;
        }

        // Validar se a caixa de entrada não é Evolution API
        try {
            const accountInboxes = await this.loadInboxesForAccount(accountId);
            const selectedInboxInfo = accountInboxes.find(inbox => String(inbox.id) === String(inboxId));
            
            if (selectedInboxInfo && isEvolutionAPIInbox(selectedInboxInfo)) {
                console.warn('⚠️ Campanhas não são permitidas com Evolution API');
                this.showEvolutionAPIModal(selectedInboxInfo.name);
                return;
            }
        } catch (error) {
            console.error('❌ Erro ao validar tipo da caixa de entrada:', error);
            this.showAlert('Erro ao validar caixa de entrada. Tente novamente.', 'danger');
            return;
        }

        // Preparar dados da campanha
        const campaignData = {
            name: campaignName,
            type: methodType,
            template_name: templateSelect
        };

        // Adicionar dados da conta e caixa (ambos os roles)
        campaignData.chatwoot_account_id = accountId;
        campaignData.chatwoot_inbox_id = inboxId;

        // Adicionar dados específicos do método
        if (methodType === 'tag') {
            campaignData.tag_name = formData.get('tagName');
        }

        // Adicionar dados de agendamento
        if (document.getElementById('scheduleCampaign').checked) {
            const scheduleDate = formData.get('scheduleDate');
            const scheduleTime = formData.get('scheduleTime');
            
            if (scheduleDate && scheduleTime) {
                const localDateTime = `${scheduleDate}T${scheduleTime}:00`;
                const date = new Date(localDateTime);
                
                if (isNaN(date.getTime())) {
                    this.showAlert('Data/hora inválida para agendamento', 'warning');
                    return;
                }
                
                const now = new Date();
                if (date <= now) {
                    this.showAlert('A data/hora do agendamento deve ser no futuro', 'warning');
                    return;
                }
                
                campaignData.scheduled_at = localDateTime;
            }
        }

        // Usar nomes obtidos do dashboard
        campaignData.accountName = accountName || 'N/A';
        campaignData.inboxName = inboxName || 'N/A';

        // Mostrar modal de confirmação
        this.showCampaignConfirmationModal(campaignData, async () => {
            try {
                const response = await this.apiRequest('/api/campaigns', {
                    method: 'POST',
                    body: JSON.stringify(campaignData)
                });

                if (response.success) {
                    const campaignId = response.campaign.id;
                    
                    // Upload de CSV se necessário
                    if (methodType === 'csv') {
                        const csvFile = document.getElementById('csvFile').files[0];
                        if (csvFile) {
                            const uploadFormData = new FormData();
                            uploadFormData.append('file', csvFile);
                            
                            await fetch(`/api/campaigns/${campaignId}/upload-csv`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${this.token}` },
                                body: uploadFormData
                            });
                        }
                    }
                    
                    // Iniciar campanha se não for agendada
                    if (!document.getElementById('scheduleCampaign').checked) {
                        await this.apiRequest(`/api/campaigns/${campaignId}/start`, {
                            method: 'POST'
                        });
                    }
                    
                    this.showAlert('Campanha criada com sucesso!', 'success');
                    this.hideDiv('campaignFormArea');
                    this.hideSelectedAccountInboxIndicator();
                    
                    // Retornar às áreas principais baseado no role do usuário
                    if (this.user.role === 'admin') {
                        // Admin: mostrar adminMainArea (editor de fluxo)
                        const adminMainArea = document.getElementById('adminMainArea');
                        if (adminMainArea) {
                            adminMainArea.style.display = 'block';
                            console.log('✅ Retornando para adminMainArea (editor de fluxo)');
                        }
                    }
                    
                    // Ambos os roles: mostrar userMainArea (dashboard de campanhas)
                    const userMainArea = document.getElementById('userMainArea');
                    if (userMainArea) {
                        userMainArea.style.display = 'block';
                        console.log('✅ Retornando para userMainArea (dashboard de campanhas)');
                    }
                    
                    // Recarregar estatísticas
                    if (this.user.role === 'user') {
                        this.loadUserDashboardStats();
                    } else if (this.user.role === 'admin') {
                        this.loadAdminDashboardStats();
                    }
                } else {
                    this.showAlert(response.error || 'Erro ao criar campanha', 'danger');
                }
            } catch (error) {
                console.error('Erro ao criar campanha:', error);
                this.showAlert('Erro ao criar campanha', 'danger');
            }
        });
    }

    showCreateUserForm() {
        showCreateUserForm();
    }

    showEvolutionAPIModal(inboxName) {
        // Remover modal existente se houver
        const existingModal = document.getElementById('evolutionAPIModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Criar modal
        const modal = document.createElement('div');
        modal.id = 'evolutionAPIModal';
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('aria-labelledby', 'evolutionAPIModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title" id="evolutionAPIModalLabel">
                            <i class="fas fa-exclamation-triangle me-2"></i>Campanhas não disponíveis
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-4">
                            <i class="fas fa-robot fa-3x text-warning mb-3"></i>
                            <h5 class="text-warning">Campanhas não são permitidas com Evolution API</h5>
                        </div>
                        
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Caixa selecionada:</strong> ${inboxName}
                        </div>
                        
                        <p class="mb-3">
                            As campanhas de WhatsApp só podem ser criadas usando a <strong>API oficial do WhatsApp</strong>.
                        </p>
                        
                        <div class="alert alert-warning">
                            <h6><i class="fas fa-lightbulb me-2"></i>O que você pode fazer:</h6>
                            <ul class="mb-0">
                                <li>Selecione uma caixa de entrada que use a <strong>API oficial do WhatsApp</strong></li>
                                <li>Configure uma nova caixa de entrada com a API oficial do WhatsApp</li>
                                <li>Entre em contato com o administrador para configurar uma caixa compatível</li>
                            </ul>
                        </div>
                        
                        <div class="alert alert-secondary">
                            <small>
                                <i class="fas fa-question-circle me-1"></i>
                                <strong>Por que essa limitação?</strong><br>
                                A Evolution API é uma solução de terceiros que não suporta o envio de campanhas em massa 
                                através do nosso sistema. Para campanhas, é necessário usar a API oficial do WhatsApp Business.
                            </small>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-2"></i>Entendi
                        </button>
                        <button type="button" class="btn btn-primary" onclick="window.app.showHelpModal()">
                            <i class="fas fa-question-circle me-2"></i>Preciso de ajuda
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar ao DOM
        document.body.appendChild(modal);
        
        // Mostrar modal
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
        
        // Limpar modal quando fechado
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
        
        console.log('📋 Modal de Evolution API exibido');
    }

    showHelpModal() {
        // Modal simples com informações de ajuda
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-question-circle me-2"></i>Precisa de ajuda?
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <h6><i class="fas fa-phone me-2"></i>Contato do Suporte</h6>
                        <p>Entre em contato com nossa equipe de suporte para obter ajuda:</p>
                        <ul>
                            <li><strong>Email:</strong> suporte@inovai.com.br</li>
                            <li><strong>WhatsApp:</strong> (11) 99999-9999</li>
                            <li><strong>Horário:</strong> Segunda a Sexta, 8h às 18h</li>
                        </ul>
                        
                        <div class="alert alert-info">
                            <i class="fas fa-lightbulb me-2"></i>
                            <strong>Dica:</strong> Para usar campanhas, você precisa de uma conta WhatsApp Business 
                            conectada através da API oficial do WhatsApp.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">
                            <i class="fas fa-check me-2"></i>Entendi
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
        
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }
}

// Funções de gerenciamento de usuários
function showCreateUserForm() {
    if (!window.app || window.app.user.role !== 'admin') return;
    
    const modal = document.getElementById('userFormModal') || createUserFormModal();
    document.getElementById('userFormTitle').textContent = 'Novo Usuário';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    
    // Carregar contas para seleção
    loadAccountsForUserForm();
    
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
}

function createUserFormModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'userFormModal';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title" id="userFormTitle">
                        <i class="fas fa-user-plus me-2"></i>Novo Usuário
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="userForm">
                        <input type="hidden" id="userId">
                        
                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="userUsername" class="form-label">
                                        <i class="fas fa-user me-1"></i>Nome de Usuário
                                    </label>
                                    <input type="text" class="form-control" id="userUsername" required>
                                    <small class="text-muted">Nome único para login no sistema</small>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="userRole" class="form-label">
                                        <i class="fas fa-shield-alt me-1"></i>Perfil de Acesso
                                    </label>
                                    <select class="form-select" id="userRole" required>
                                        <option value="user">👤 Usuário - Acesso limitado</option>
                                        <option value="admin">👑 Admin - Acesso total</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label for="userPassword" class="form-label">
                                <i class="fas fa-lock me-1"></i>Senha
                            </label>
                            <input type="password" class="form-control" id="userPassword" required>
                            <small class="text-muted">Mínimo 6 caracteres. Para edição, deixe em branco para manter atual.</small>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">
                                <i class="fas fa-building me-1"></i>Contas Atribuídas
                            </label>
                            <div class="card">
                                <div class="card-body">
                                    <div id="accountsCheckboxes"></div>
                                    <small class="text-muted mt-2 d-block">
                                        <i class="fas fa-info-circle me-1"></i>
                                        Selecione as contas do Chatwoot que o usuário pode acessar. Admins sempre têm acesso total.
                                    </small>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        <i class="fas fa-times me-2"></i>Cancelar
                    </button>
                    <button type="button" class="btn btn-success" onclick="saveUser()">
                        <i class="fas fa-save me-2"></i>Salvar Usuário
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

async function loadAccountsForUserForm() {
    try {
        const accounts = await window.app.apiRequest('/api/accounts');
        const container = document.getElementById('accountsCheckboxes');
        
        if (accounts.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Nenhuma conta disponível
                </div>
            `;
            return;
        }
        
        container.innerHTML = accounts.map(account => `
            <div class="form-check form-check-inline me-4 mb-2">
                <input class="form-check-input" type="checkbox" value="${account.id}" id="account_${account.id}">
                <label class="form-check-label" for="account_${account.id}">
                    <i class="fas fa-building me-1 text-primary"></i>
                    <strong>${account.name}</strong>
                    <br>
                    <small class="text-muted">ID: ${account.id} • ${account.domain}</small>
                </label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar contas:', error);
        const container = document.getElementById('accountsCheckboxes');
        container.innerHTML = `
            <div class="text-center text-danger py-3">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar contas
            </div>
        `;
    }
}

async function saveUser() {
    const userId = document.getElementById('userId').value;
    const username = document.getElementById('userUsername').value.trim();
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    
    const assignedAccounts = Array.from(document.querySelectorAll('#accountsCheckboxes input:checked'))
        .map(cb => parseInt(cb.value));
    
    // Validações
    if (!username) {
        window.app.showAlert('Nome de usuário é obrigatório', 'warning');
        document.getElementById('userUsername').focus();
        return;
    }
    
    if (!userId && !password) {
        window.app.showAlert('Senha é obrigatória para novos usuários', 'warning');
        document.getElementById('userPassword').focus();
        return;
    }
    
    if (password && password.length < 6) {
        window.app.showAlert('Senha deve ter pelo menos 6 caracteres', 'warning');
        document.getElementById('userPassword').focus();
        return;
    }
    
    if (!role) {
        window.app.showAlert('Selecione um perfil de acesso', 'warning');
        return;
    }
    
    // Desabilitar botão para evitar duplo clique
    const saveBtn = document.querySelector('#userFormModal .btn-success');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Salvando...';
    
    try {
        const url = userId ? `/api/users/${userId}` : '/api/users';
        const method = userId ? 'PUT' : 'POST';
        
        const body = { username, role, assigned_accounts: assignedAccounts };
        if (password) body.password = password;
        
        const response = await window.app.apiRequest(url, {
            method,
            body: JSON.stringify(body)
        });
        
        if (response.success) {
            window.app.showAlert(
                `✅ Usuário "${username}" ${userId ? 'atualizado' : 'criado'} com sucesso!`, 
                'success'
            );
            bootstrap.Modal.getInstance(document.getElementById('userFormModal')).hide();
            
            // Aguardar um pouco antes de recarregar para mostrar o feedback
            setTimeout(() => {
                window.app.showUserManagement();
            }, 500);
        } else {
            window.app.showAlert(response.error || 'Erro ao salvar usuário', 'danger');
        }
    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
        window.app.showAlert('Erro de conexão. Tente novamente.', 'danger');
    } finally {
        // Reabilitar botão
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

async function editUser(userId) {
    try {
        const users = await window.app.apiRequest('/api/users');
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            window.app.showAlert('Usuário não encontrado', 'danger');
            return;
        }
        
        const modal = document.getElementById('userFormModal') || createUserFormModal();
        document.getElementById('userFormTitle').textContent = 'Editar Usuário';
        document.getElementById('userId').value = user.id;
        document.getElementById('userUsername').value = user.username;
        document.getElementById('userPassword').value = ''; // Não mostrar senha atual
        document.getElementById('userPassword').placeholder = 'Deixe em branco para manter atual';
        document.getElementById('userPassword').required = false;
        document.getElementById('userRole').value = user.role;
        
        // Carregar contas e marcar as atribuídas
        await loadAccountsForUserForm();
        
        const assignedAccounts = user.assigned_accounts || [];
        assignedAccounts.forEach(accountId => {
            const checkbox = document.getElementById(`account_${accountId}`);
            if (checkbox) checkbox.checked = true;
        });
        
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
    } catch (error) {
        console.error('Erro ao editar usuário:', error);
        window.app.showAlert('Erro ao carregar dados do usuário', 'danger');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${username}"?`)) return;
    
    try {
        const response = await window.app.apiRequest(`/api/users/${userId}`, {
            method: 'DELETE'
        });
        
        if (response.success) {
            window.app.showAlert('Usuário excluído com sucesso!', 'success');
            window.app.showUserManagement(); // Recarregar lista
        } else {
            window.app.showAlert(response.error || 'Erro ao excluir usuário', 'danger');
        }
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        window.app.showAlert('Erro ao excluir usuário', 'danger');
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
    
    // Configurar validação de data/hora para interface administrativa
    setupDateTimeValidation();
});

function setupDateTimeValidation() {
    const dataInput = document.getElementById('dataEnvio');
    const horaInput = document.getElementById('horaEnvio');
    
    // Definir data mínima como hoje
    if (dataInput) {
        const today = new Date().toISOString().split('T')[0];
        dataInput.min = today;
        
        console.log('📅 Data mínima definida para campos administrativos:', today);
    }
    
    // Validação em tempo real da data/hora
    // if (dataInput && horaInput) {
    //     const validateDateTime = () => {
    //         if (dataInput.value && horaInput.value) {
    //             const selectedDateTime = new Date(`${dataInput.value}T${horaInput.value}:00`);
    //             const now = new Date();
                
    //             if (selectedDateTime <= now) {
    //                 horaInput.setCustomValidity('O horário deve ser no futuro (horário de Brasília)');
    //                 horaInput.reportValidity();
    //             } else {
    //                 horaInput.setCustomValidity('');
    //                 console.log(`📅 Horário válido selecionado: ${selectedDateTime.toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
    //             }
    //         }
    //     };
        
    //     dataInput.addEventListener('change', validateDateTime);
    //     horaInput.addEventListener('change', validateDateTime);
        
    //     console.log('✅ Validação de data/hora configurada para interface administrativa');
    // }
}

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
        
        
        // Verificar se os elementos existem antes de adicionar listeners
        const btnCriarCampanha = document.getElementById('btnCriarCampanha');
        const closeCampanha = document.getElementById('closeCampanha');
        const formCampanha = document.getElementById('formCampanha');
        const agendarEnvio = document.getElementById('agendarEnvio');
        const menuListarCampanhas = document.getElementById('menuListarCampanhas');
        const metodoEnvioRadios = document.getElementsByName('metodoEnvio');

        if (btnCriarCampanha) {
            btnCriarCampanha.addEventListener('click', async function() {
                // Validar se conta e caixa foram selecionadas
                if (!(await window.app.validateAccountAndInboxSelection())) {
                    return;
                }
                
                // Usar formulário unificado
                window.app.showUnifiedCampaignForm();
            });
        }

        if (closeCampanha) {
            closeCampanha.addEventListener('click', function() {
                // Remover indicador de conta/caixa selecionada
                const indicator = document.getElementById('selectedAccountInboxIndicator');
                if (indicator) {
                    indicator.remove();
                }
                
                window.app.hideDiv('campaignFormArea');
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

                        //preencher data e hora atual
                        const dataInputFinal = document.getElementById('dataEnvio');
                        const horaInputFinal = document.getElementById('horaEnvio');
                        if (dataInputFinal) {
                            const today = new Date().toISOString().split('T')[0];
                            dataInputFinal.value = today;
                            console.log('✅ Data preenchida (final):', today);
                        }
                        
                        if (horaInputFinal) {
                            const now = new Date();
                            const brazilTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
                            const hours = brazilTime.getHours().toString().padStart(2, '0');
                            const minutes = brazilTime.getMinutes().toString().padStart(2, '0');
                            const horaValue = `${hours}:${minutes}`;
                            horaInputFinal.value = horaValue;
                            console.log('✅ Hora preenchida (final):', horaValue);
                        }
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
                        // Criar datetime como horário local do Brasil (sem conversão de fuso)
                        const localDateTime = `${dataEnvio}T${horaEnvio}:00`;
                        
                        // Interpretar como horário do Brasil e manter o mesmo
                        const date = new Date(localDateTime);
                        
                        // Verificar se a data é válida
                        if (isNaN(date.getTime())) {
                            window.app.showAlert('Data/hora inválida para agendamento', 'warning');
                            return;
                        }
                        
                        // Verificar se não é uma data passada
                        const now = new Date();
                        if (date <= now) {
                            window.app.showAlert('A data/hora do agendamento deve ser no futuro', 'warning');
                            return;
                        }
                        
                        // Enviar apenas o datetime local sem timezone (será interpretado como horário do Brasil)
                        campanhaData.scheduled_at = localDateTime;
                        
                        console.log(`📅 Agendamento criado: ${localDateTime} (horário do Brasil)`);
                        console.log(`📅 Valor enviado para API: ${campanhaData.scheduled_at}`);
                    }
                }
                
                // Obter nomes da conta e caixa de entrada para exibir no modal
                const accountSelect = document.getElementById('accountSelect');
                const inboxSelect = document.getElementById('inboxSelect');
                campanhaData.accountName = accountSelect.options[accountSelect.selectedIndex]?.text || 'N/A';
                campanhaData.inboxName = inboxSelect.options[inboxSelect.selectedIndex]?.text || 'N/A';

                // Mostrar modal de confirmação
                window.app.showCampaignConfirmationModal(campanhaData, async () => {
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
                            window.app.hideDiv('campaignFormArea');
                            this.reset();
                        } else {
                            window.app.showAlert('Erro ao criar campanha: ' + result.error, 'error');
                        }
                    } catch (error) {
                        console.error('Erro ao criar campanha:', error);
                        window.app.showAlert('Erro ao criar campanha', 'error');
                    }
                });
            });
        }

        // Listar campanhas (menu dropdown)
        if (menuListarCampanhas) {
            menuListarCampanhas.addEventListener('click', function() {
                loadCampanhasList();
            });
        }
        
      
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
    // Usar a função da classe se disponível
    if (window.app && typeof window.app.loadUnifiedTemplates === 'function') {
        await window.app.loadUnifiedTemplates();
    } else {
        console.error('❌ Função loadUnifiedTemplates não disponível');
    }
}


// Função para mostrar indicador de templates específicos da caixa
function showInboxTemplateIndicator(inboxName, templateCount) {
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
    
    // Adicionar após o container flex (d-flex gap-2) para que apareça em linha separada
    const selectContainer = document.getElementById('modeloMensagem').parentElement;
    const flexContainer = selectContainer.parentElement; // Container pai (d-flex gap-2)
    
    // Criar um elemento de quebra de linha para separar visualmente
    const lineBreak = document.createElement('div');
    lineBreak.style.height = '10px'; // Espaçamento adicional
    lineBreak.style.clear = 'both';
    
    // Adicionar quebra de linha e indicador após o container flex
    flexContainer.appendChild(lineBreak);
    flexContainer.appendChild(indicator);
    
    // Auto-remover após 8 segundos
    setTimeout(() => {
        if (indicator && indicator.parentNode) {
            indicator.remove();
        }
    }, 8000);
}
// Carregar tags disponíveis via API para autocomplete
async function loadTags() {
    try {
        const response = await fetch('/api/chatwoot/tags', {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const tags = await response.json();
        
        // Implementar autocomplete simples ou datalist
        const input = document.getElementById('tagName');
        if (!input) {
            console.log('Input de tags não encontrado');
            return;
        }
        
        // Remover datalist anterior se existir
        const existingDatalist = document.getElementById('tagsList');
        if (existingDatalist) {
            existingDatalist.remove();
        }
        
        const datalist = document.createElement('datalist');
        datalist.id = 'tagsList';
        input.setAttribute('list', 'tagsList');
        
        if (Array.isArray(tags) && tags.length > 0) {
        tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.title || tag.name;
            datalist.appendChild(option);
        });
            console.log(`✅ ${tags.length} tags carregadas para autocomplete`);
        } else {
            console.log('ℹ️ Nenhuma tag encontrada para autocomplete');
        }
        
        input.parentNode.appendChild(datalist);
    } catch (error) {
        console.error('❌ Erro ao carregar tags:', error);
        
        // Mostrar alerta se a função showAlert existir
        if (typeof window.app?.showAlert === 'function') {
            window.app.showAlert('Erro ao carregar tags. Verifique sua conexão.', 'warning');
        }
    }
}

// Carregar lista de campanhas
async function loadCampanhasList() {
    try {
        // Verificar se é admin para carregar todas as campanhas
        const isAdmin = window.app.user && window.app.user.role === 'admin';
        let endpoint = '/api/campaigns';
        
        if (isAdmin) {
            // Tentar primeiro o endpoint específico para admin
            try {
                const response = await fetch('/api/campaigns/all', {
                    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                });
                if (response.ok) {
                    endpoint = '/api/campaigns/all';
                }
            } catch (error) {
                console.log('Endpoint /api/campaigns/all não encontrado, usando endpoint padrão');
            }
        }
        
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const campanhas = await response.json();
        
        // DEBUG: Log para verificar dados que chegam do backend
        const campanhaComAgendamento = campanhas.find(c => c.scheduled_at);
        if (campanhaComAgendamento) {
            console.log('🔍 DEBUG - Campanha com agendamento:');
            console.log('   📅 scheduled_at (bruto):', campanhaComAgendamento.scheduled_at);
            console.log('   📅 formatDateBrazil (corrigido):', formatDateBrazil(campanhaComAgendamento.scheduled_at));
        }
        
        // Criar div para exibir campanhas
        showCampanhasList(campanhas, isAdmin);
    } catch (error) {
        console.error('Erro ao carregar campanhas:', error);
        window.app.showAlert('Erro ao carregar campanhas', 'danger');
    }
}

// Exibir lista de campanhas com estatísticas detalhadas
function showCampanhasList(campanhas, isAdmin = false) {
    // Criar div para listagem de campanhas
    let container = document.getElementById('campanhasListDiv');
    if (!container) {
        container = document.createElement('div');
        container.id = 'campanhasListDiv';
        container.className = 'position-fixed top-0 start-0 w-100 h-100 bg-white z-3 p-4 overflow-auto';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }
    
    const title = isAdmin ? 'Todas as Campanhas WhatsApp' : 'Minhas Campanhas WhatsApp';
    
    container.innerHTML = `
        <div class="container">
            <div class="row">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h3>${title}</h3>
                        <div>
                            <button class="btn btn-warning me-2" onclick="corrigirCampanhasPresas()" title="Corrigir campanhas presas no status 'running'">
                                <i class="fas fa-wrench"></i> Corrigir Presas
                            </button>
                            <button class="btn btn-secondary" onclick="fecharListaCampanhas()">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                        </div>
                    </div>
                    <div class="row">
                        ${campanhas.map(campanha => {
                            const totalContacts = parseInt(campanha.total_contacts || 0);
                            const sentCount = parseInt(campanha.sent_count || 0);
                            const failedCount = parseInt(campanha.failed_count || 0);
                            const pendingCount = parseInt(campanha.pending_count || 0);
                            const successRate = totalContacts > 0 ? ((sentCount / totalContacts) * 100).toFixed(1) : 0;
                            
                            // Informação do usuário (se disponível)
                            const userInfo = campanha.user_name || campanha.username || campanha.created_by || 'N/A';
                            const userDisplay = isAdmin ? `
                                <p class="card-text mb-2">
                                    <strong><i class="fas fa-user me-1"></i>Criado por:</strong> 
                                    <span class="badge bg-secondary">${userInfo}</span>
                                </p>
                            ` : '';
                            
                            return `
                                <div class="col-md-6 mb-3">
                                    <div class="card">
                                        <div class="card-body">
                                            <h5 class="card-title">${campanha.name}</h5>
                                            ${userDisplay}
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
                                                <strong>Criada:</strong> ${formatDateBrazil(campanha.created_at)}
                                                ${campanha.scheduled_at ? `<br><strong>Agendada:</strong> ${formatDateScheduled(campanha.scheduled_at)}` : ''}
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
                                                ${window.app && window.app.user && window.app.user.role === 'admin' ? `
                                                    <button class="btn btn-sm btn-danger" onclick="deleteCampanha(${campanha.id})">
                                                        <i class="fas fa-trash"></i> Excluir
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
        console.log(`🔍 Carregando status detalhado da campanha ${campanhaId}...`);
        console.log(`🔍 URL do endpoint: /api/campaigns/${campanhaId}/status`);
        
        // Mostrar indicador de carregamento
        showLoadingStatusModal();
        
        const response = await fetch(`/api/campaigns/${campanhaId}/status`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        console.log(`📡 Resposta da API: Status ${response.status} - ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        let status = await response.json();
        console.log(`📊 Dados brutos recebidos:`, status);
        console.log(`📊 Tipo de dados: ${typeof status}, É array: ${Array.isArray(status)}, Tamanho: ${status.length || 'N/A'}`);
        
        // Verificar se há dados válidos
        if (!Array.isArray(status)) {
            console.warn('⚠️ Resposta não é um array, convertendo...');
            status = [status].filter(item => item && Object.keys(item).length > 0);
        }
        
        if (status.length === 0) {
            console.warn(`⚠️ Nenhum dado de status encontrado para campanha ${campanhaId}`);
            console.log('🔍 Verificando se a campanha existe e tem dados...');
            
            // Verificar se há dados de envio em outras tabelas
            await checkCampaignLogs(campanhaId);
            
            // NOVA FUNCIONALIDADE: Buscar contatos da campanha mesmo quando pending
            console.log('📞 Buscando contatos da campanha para exibir como pending...');
            const campaignContacts = await checkCampaignContacts(campanhaId);
            
            if (campaignContacts && campaignContacts.length > 0) {
                console.log(`✅ Encontrados ${campaignContacts.length} contatos para exibir como pending`);
                
                // Converter contatos em formato de status pending
                status = campaignContacts.map(contact => ({
                    id: contact.id || `contact_${contact.phone}`,
                    contact_phone: contact.phone,
                    contact_name: contact.name,
                    name: contact.name,
                    status: 'pending',
                    created_at: contact.created_at || new Date().toISOString(),
                    sent_at: null,
                    error_message: null,
                    tag: contact.tag || null
                }));
                
                console.log(`📊 Convertidos ${status.length} contatos para formato de status pending`);
            } else {
                console.log('❌ Nenhum contato encontrado na campanha');
            }
            
            // Log especial para o usuário APÓS verificações
            console.log(`
🔧 DIAGNÓSTICO RÁPIDO - CAMPANHA ${campanhaId}:

1. ✅ Endpoint /api/campaigns/${campanhaId}/status funciona (retornou resposta válida)
2. ❌ Nenhum dado na tabela 'campaign_status'
3. 🔍 Verificações adicionais executadas (veja logs acima)
4. 📞 Contatos da campanha: ${campaignContacts ? campaignContacts.length : 0} encontrados

📋 PRÓXIMOS PASSOS:
• Analise os logs detalhados acima para entender o problema específico
• Clique em "Informações de Debug" para dados completos em JSON
• Use "Verificar Banco de Dados" para análise completa das tabelas
• Se há contatos mas não envios, use "Tentar Executar Novamente"

🚀 AÇÕES RÁPIDAS:
• Botão "Tentar Executar Novamente" → força execução da campanha
• Botão "Verificar Banco de Dados" → análise completa das tabelas
• Botão "Informações de Debug" → dados técnicos completos
            `);
        }
        
        // Buscar informações da campanha também
        let campaignInfo = {};
        try {
            console.log('🔍 Buscando informações da campanha...');
            const campaignResponse = await fetch(`/api/campaigns`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            
            if (campaignResponse.ok) {
                const campaigns = await campaignResponse.json();
                //console.log(`📋 Campanhas encontradas: ${campaigns.length}`);
                
                if (Array.isArray(campaigns)) {
                    campaignInfo = campaigns.find(c => String(c.id) === String(campanhaId)) || {};
                    //console.log(`📋 Campanha específica encontrada:`, campaignInfo);
                } else if (campaigns && campaigns.id) {
                    campaignInfo = campaigns;
                }
            }
    } catch (error) {
            console.warn('⚠️ Erro ao carregar informações da campanha (continuando sem elas):', error);
        }
        
        showDetailedStatusModal(campanhaId, status, campaignInfo);
        
    } catch (error) {
        console.error('❌ Erro ao carregar status:', error);
        
        // Fechar modal de carregamento se existir
        const loadingModal = document.getElementById('detailedStatusModal');
        if (loadingModal) {
            loadingModal.remove();
        }
        
        window.app.showAlert('Erro ao carregar status da campanha: ' + error.message, 'danger');
    }
}

// Nova função para verificar logs da campanha em outras fontes
async function checkCampaignLogs(campanhaId) {
    try {
        console.log(`🔍 Verificando logs alternativos para campanha ${campanhaId}...`);
        
        // Primeiro, verificar detalhes específicos da campanha
        try {
            console.log(`🔍 Verificando detalhes específicos da campanha...`);
            const campaignResponse = await fetch(`/api/campaigns/${campanhaId}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            
            if (campaignResponse.ok) {
                const campaign = await campaignResponse.json();
                console.log(`📋 Detalhes específicos da campanha:`, campaign);
                console.log(`📋 Status: ${campaign.status || 'N/A'}`);
                console.log(`📋 Total de contatos: ${campaign.total_contacts || 'N/A'}`);
                console.log(`📋 Total de envios: ${campaign.total_sends || 0}`);
                console.log(`📋 Enviados: ${campaign.sent_count || 0}`);
                console.log(`📋 Falhas: ${campaign.failed_count || 0}`);
                console.log(`📋 Pendentes: ${campaign.pending_count || 0}`);
                console.log(`📋 Tipo: ${campaign.type || 'N/A'}`);
                console.log(`📋 Template: ${campaign.template_name || 'N/A'}`);
                
                if (campaign.total_contacts && campaign.total_contacts > 0) {
                    console.log(`✅ Campanha tem ${campaign.total_contacts} contatos configurados`);
                    
                    if (campaign.total_sends === 0) {
                        console.log(`⚠️ Contatos existem, mas nenhum envio foi iniciado ainda`);
                        if (campaign.status === 'pending') {
                            console.log(`📌 Campanha está PENDENTE - precisa ser executada`);
                        } else if (campaign.status === 'running') {
                            console.log(`🔄 Campanha está EXECUTANDO - aguarde os envios`);
                        }
                    } else {
                        console.log(`📊 ${campaign.total_sends} registros de envio encontrados`);
                        if (campaign.status === 'completed') {
                            console.log(`✅ Campanha CONCLUÍDA com dados de envio`);
                        }
                    }
                } else {
                    console.log(`❌ Campanha SEM CONTATOS - verificando diretamente na tabela...`);
                    
                    // Verificar contatos diretamente da tabela
                    await checkCampaignContacts(campanhaId);
                }
            } else {
                console.log(`❌ Erro ao buscar detalhes: ${campaignResponse.status} ${campaignResponse.statusText}`);
            }
        } catch (e) {
            console.log(`❌ Não foi possível verificar detalhes da campanha: ${e.message}`);
        }
        
        // Verificar outros endpoints alternativos
        const alternativeEndpoints = [
            `/api/campaigns/${campanhaId}/contacts`,
            `/api/campaigns/${campanhaId}/logs`,
            `/api/campaigns/${campanhaId}/messages`,
            `/api/campaigns/${campanhaId}/sends`
        ];
        
        for (const endpoint of alternativeEndpoints) {
            try {
                console.log(`🔍 Tentando endpoint: ${endpoint}`);
                const response = await fetch(endpoint, {
                    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Dados encontrados em ${endpoint}:`, data);
                    
                    if (Array.isArray(data) && data.length > 0) {
                        console.log(`📊 Encontrados ${data.length} registros em ${endpoint}`);
                        return data;
                    }
                }
            } catch (e) {
                console.log(`❌ Endpoint ${endpoint} não disponível: ${e.message}`);
            }
        }
        
        console.log('ℹ️ Nenhum dado encontrado em endpoints alternativos');
        
        // Verificar se a campanha foi realmente executada
        await checkCampaignExecution(campanhaId);
        
    } catch (error) {
        console.error('❌ Erro ao verificar logs alternativos:', error);
    }
}

// Função para verificar contatos diretamente da tabela
async function checkCampaignContacts(campanhaId) {
    try {
        console.log(`📞 Verificando contatos diretamente para campanha ${campanhaId}...`);
        
        const contactsResponse = await fetch(`/api/campaigns/${campanhaId}/contacts`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        if (contactsResponse.ok) {
            const contacts = await contactsResponse.json();
            console.log(`📞 Resposta da API de contatos:`, contacts);
            
            if (Array.isArray(contacts) && contacts.length > 0) {
                console.log(`✅ CORREÇÃO: Encontrados ${contacts.length} contatos na tabela campaign_contacts!`);
                console.log(`📞 Contatos encontrados:`, contacts.map(c => `${c.name} (${c.phone})`).join(', '));
                console.log(`🔧 O problema anterior era no cálculo do endpoint /api/campaigns/${campanhaId}`);
                
                return contacts;
            } else {
                console.log(`❌ Realmente não há contatos na tabela campaign_contacts para esta campanha`);
            }
        } else {
            console.log(`❌ Erro ao buscar contatos: ${contactsResponse.status} ${contactsResponse.statusText}`);
        }
    } catch (error) {
        console.error('❌ Erro ao verificar contatos diretamente:', error);
    }
    
    return [];
}

// Função para verificar se a campanha foi executada
async function checkCampaignExecution(campanhaId) {
    try {
        console.log(`🔍 Verificando se campanha ${campanhaId} foi executada...`);
        
        // Buscar informações detalhadas da campanha
        const response = await fetch(`/api/campaigns`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        if (response.ok) {
            const campaigns = await response.json();
            const campaign = campaigns.find(c => String(c.id) === String(campanhaId));
            
            if (campaign) {
                console.log(`📋 Status da campanha: ${campaign.status}`);
                console.log(`📋 Contadores: Enviados: ${campaign.sent_count || 0}, Falhas: ${campaign.failed_count || 0}, Pendentes: ${campaign.pending_count || 0}`);
                console.log(`📋 Dados completos da campanha:`, campaign);
                
                if (campaign.status === 'pending') {
                    console.log('⚠️ Campanha ainda está pendente - pode não ter sido executada ainda');
                } else if (campaign.status === 'running') {
                    console.log('🔄 Campanha está em execução - dados podem estar sendo gerados');
                } else if (campaign.status === 'completed' && (!campaign.sent_count || campaign.sent_count == 0)) {
                    console.log('⚠️ Campanha marcada como completa mas sem contadores de envio');
                }
            } else {
                console.log('❌ Campanha não encontrada na lista');
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar execução da campanha:', error);
    }
}

function showDetailedStatusModal(campanhaId, statusData, campaignInfo) {
    // Criar modal para status detalhado
    const modalId = 'detailedStatusModal';
    let modal = document.getElementById(modalId);
    
    if (modal) {
        modal.remove();
    }
    
    modal = document.createElement('div');
    modal.className = 'position-fixed top-0 start-0 w-100 h-100 bg-white overflow-auto';
    modal.style.zIndex = '99999';
    modal.id = modalId;
    
    // Calcular estatísticas
    const stats = calculateCampaignStats(statusData);
    
    modal.innerHTML = `
        <div class="container-fluid p-4">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h4>
                        <i class="fas fa-chart-line me-2"></i>Status Detalhado da Campanha
                    </h4>
                    ${campaignInfo.name ? `<h6 class="text-muted">${campaignInfo.name}</h6>` : ''}
                    <small class="text-muted">
                        <i class="fas fa-sync-alt me-1"></i>
                        Última atualização: ${formatDateBrazil(new Date())}
                    </small>
                </div>
                <div>
                    <button class="btn btn-outline-primary me-2" onclick="refreshCampaignStatus(${campanhaId})">
                        <i class="fas fa-sync-alt me-2"></i>Atualizar
                    </button>
                    <button class="btn btn-secondary" onclick="closeDetailedStatusModal()">
                        <i class="fas fa-times me-2"></i>Fechar
                    </button>
                </div>
            </div>
            
            <div id="campaignStatusContent">
                ${renderCampaignSummary(stats, campaignInfo)}
                ${renderStatusFilters()}
                ${renderStatusTable(statusData, campanhaId)}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Configurar filtros
    setupStatusFilters(statusData);
    
    // Adicionar funcionalidade de atualização automática a cada 30 segundos
    if (statusData.some(item => ['pending', 'queued'].includes(item.status))) {
        console.log('📊 Há envios pendentes, configurando atualização automática...');
        setupAutoRefresh(campanhaId);
    }
    
    console.log(`✅ Modal de status detalhado exibido para campanha ${campanhaId}`);
}

function refreshCampaignStatus(campanhaId) {
    const refreshBtn = document.querySelector('button[onclick*="refreshCampaignStatus"]');
    const originalText = refreshBtn.innerHTML;
    
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Atualizando...';
    
    // Chamar a função principal novamente
    verStatusCampanha(campanhaId).finally(() => {
        // Restaurar botão (se ainda existir)
        const newRefreshBtn = document.querySelector('button[onclick*="refreshCampaignStatus"]');
        if (newRefreshBtn) {
            newRefreshBtn.disabled = false;
            newRefreshBtn.innerHTML = originalText;
        }
    });
}

function setupAutoRefresh(campanhaId) {
    // Limpar refresh anterior se existir
    if (window.campaignStatusRefreshInterval) {
        clearInterval(window.campaignStatusRefreshInterval);
    }
    
    // Configurar novo refresh automático
    window.campaignStatusRefreshInterval = setInterval(() => {
        const modal = document.getElementById('detailedStatusModal');
        if (!modal) {
            // Modal foi fechado, cancelar refresh
            clearInterval(window.campaignStatusRefreshInterval);
            return;
        }
        
        console.log('🔄 Atualizando status da campanha automaticamente...');
        refreshCampaignStatus(campanhaId);
    }, 30000); // 30 segundos
    
    console.log('⏰ Atualização automática configurada para cada 30 segundos');
}

function showLoadingStatusModal() {
    const modalId = 'detailedStatusModal';
    let modal = document.getElementById(modalId);
    
    if (modal) {
        modal.remove();
    }
    
    modal = document.createElement('div');
    modal.className = 'position-fixed top-0 start-0 w-100 h-100 bg-white overflow-auto d-flex align-items-center justify-content-center';
    modal.style.zIndex = '99999';
    modal.id = modalId;
    
    modal.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            <h5>Carregando detalhes da campanha...</h5>
            <p class="text-muted">Buscando status de todos os envios...</p>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function calculateCampaignStats(statusData) {
    const stats = {
        total: statusData.length,
        sent: 0,
        failed: 0,
        pending: 0,
        other: 0
    };
    
    statusData.forEach(item => {
        switch (item.status) {
            case 'sent':
            case 'delivered':
            case 'read':
                stats.sent++;
                break;
            case 'failed':
            case 'error':
                stats.failed++;
                break;
            case 'pending':
            case 'queued':
                stats.pending++;
                break;
            default:
                stats.other++;
        }
    });
    
    return stats;
}

function renderCampaignSummary(stats, campaignInfo) {
    const successRate = stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : 0;
    const isEmptyStatus = stats.total === 0;
    
    return `
        <div class="row mb-4">
            <div class="col-md-12">
                <div class="card border-0 ${isEmptyStatus ? 'bg-warning bg-opacity-10 border-warning' : 'bg-light'}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="card-title mb-0">
                                <i class="fas fa-chart-pie me-2"></i>Resumo da Campanha
                                ${isEmptyStatus ? '<span class="badge bg-warning text-dark ms-2">Sem Dados de Envio</span>' : ''}
                            </h6>
                            ${campaignInfo.status ? `
                                <span class="badge ${getCampaignStatusBadge(campaignInfo.status)} fs-6">
                                    ${campaignInfo.status.toUpperCase()}
                                </span>
                            ` : ''}
                        </div>
                        
                        ${isEmptyStatus ? `
                            <div class="alert alert-info mb-3">
                                <i class="fas fa-info-circle me-2"></i>
                                <strong>Status da Campanha:</strong> ${campaignInfo.status || 'Desconhecido'}
                                ${campaignInfo.total_contacts ? `| <strong>Contatos Previstos:</strong> ${campaignInfo.total_contacts}` : ''}
                                ${campaignInfo.sent_count !== undefined ? `| <strong>Contador Enviados:</strong> ${campaignInfo.sent_count}` : ''}
                            </div>
                        ` : ''}
                        
                        <div class="row text-center">
                            <div class="col-md-2">
                                <div class="border-end">
                                    <h4 class="${isEmptyStatus ? 'text-warning' : 'text-primary'} mb-1">${stats.total}</h4>
                                    <small class="text-muted">Total</small>
                                </div>
                            </div>
                            <div class="col-md-2">
                                <div class="border-end">
                                    <h4 class="text-success mb-1">${stats.sent}</h4>
                                    <small class="text-muted">Enviados</small>
                                </div>
                            </div>
                            <div class="col-md-2">
                                <div class="border-end">
                                    <h4 class="text-danger mb-1">${stats.failed}</h4>
                                    <small class="text-muted">Falharam</small>
                                </div>
                            </div>
                            <div class="col-md-2">
                                <div class="border-end">
                                    <h4 class="text-warning mb-1">${stats.pending}</h4>
                                    <small class="text-muted">Pendentes</small>
                                </div>
                            </div>
                            <div class="col-md-2">
                                <div class="border-end">
                                    <h4 class="text-info mb-1">${stats.other}</h4>
                                    <small class="text-muted">Outros</small>
                                </div>
                            </div>
                            <div class="col-md-2">
                                <h4 class="${isEmptyStatus ? 'text-warning' : 'text-primary'} mb-1">${successRate}%</h4>
                                <small class="text-muted">Taxa Sucesso</small>
                            </div>
                        </div>
                        ${campaignInfo.created_at ? `
                            <div class="mt-3 pt-3 border-top">
                                <small class="text-muted">
                                    <i class="fas fa-calendar me-1"></i>
                                    Criada em: ${formatDateBrazil(campaignInfo.created_at)}
                                    ${campaignInfo.scheduled_at ? `| Agendada para: ${formatDateScheduled(campaignInfo.scheduled_at)}` : ''}
                                </small>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getCampaignStatusBadge(status) {
    const badges = {
        'pending': 'bg-warning text-dark',
        'running': 'bg-primary',
        'completed': 'bg-success',
        'cancelled': 'bg-secondary',
        'failed': 'bg-danger',
        'error': 'bg-danger'
    };
    return badges[status] || 'bg-secondary';
}

function renderStatusFilters() {
    return `
        <div class="row mb-3">
            <div class="col-md-6">
                <div class="input-group">
                    <span class="input-group-text">
                        <i class="fas fa-search"></i>
                    </span>
                    <input type="text" class="form-control" id="statusSearch" placeholder="Buscar por nome ou telefone...">
                </div>
            </div>
            <div class="col-md-3">
                <select class="form-select" id="statusFilter">
                    <option value="">Todos os status</option>
                    <option value="sent">Enviados</option>
                    <option value="delivered">Entregues</option>
                    <option value="read">Lidos</option>
                    <option value="failed">Falharam</option>
                    <option value="error">Erro</option>
                    <option value="pending">Pendentes</option>
                    <option value="queued">Na fila</option>
                </select>
            </div>
            <div class="col-md-3">
                <button class="btn btn-outline-secondary" onclick="exportStatusToCSV()">
                    <i class="fas fa-download me-1"></i>Exportar CSV
                </button>
            </div>
        </div>
    `;
}

function renderStatusTable(statusData, campanhaId) {
    if (!statusData || statusData.length === 0) {
        return `
            <div class="card">
                <div class="card-body">
                    <div class="text-center py-5">
                        <i class="fas fa-search fa-3x text-muted mb-3"></i>
                        <h5 class="text-muted">Nenhum registro de envio encontrado</h5>
                        <p class="text-muted mb-4">Esta campanha não possui dados de envio na tabela de status.</p>
                        
                        <div class="alert alert-warning text-start">
                            <h6><i class="fas fa-lightbulb me-2"></i>Possíveis causas:</h6>
                            <ul class="mb-2">
                                <li><strong>Campanha não executada:</strong> A campanha pode estar pendente ou agendada</li>
                                <li><strong>Tabela não criada:</strong> A tabela 'campaign_status' pode não existir no banco</li>
                                <li><strong>Processo de envio:</strong> O sistema pode não estar gravando logs de envio</li>
                                <li><strong>Configuração:</strong> Problema na configuração da API do WhatsApp</li>
                            </ul>
                            <div class="border-top pt-2">
                                <small><strong>💡 Dica:</strong> Execute o script <code>create-campaign-tables.sql</code> no seu banco PostgreSQL para criar as tabelas necessárias.</small>
                            </div>
                        </div>
                        
                        <div class="alert alert-info text-start mb-3">
                            <h6><i class="fas fa-terminal me-2"></i>Diagnóstico Rápido:</h6>
                            <p class="mb-2">Abra o <strong>Console do Navegador</strong> (F12 → Console) e veja os logs detalhados desta função.</p>
                            <code class="d-block bg-dark text-light p-2 rounded">
                                📊 Logs específicos foram gerados para ajudar no diagnóstico
                            </code>
                        </div>
                        
                        <div class="d-flex gap-2 justify-content-center flex-wrap">
                            <button class="btn btn-primary" onclick="forceCampaignExecution(${campanhaId || 'null'})">
                                <i class="fas fa-play me-2"></i>Tentar Executar Novamente
                            </button>
                            <button class="btn btn-outline-secondary" onclick="checkDatabaseStatus(${campanhaId || 'null'})">
                                <i class="fas fa-database me-2"></i>Verificar Banco de Dados
                            </button>
                            <button class="btn btn-outline-info" onclick="showDebugInfo(${campanhaId || 'null'})">
                                <i class="fas fa-bug me-2"></i>Informações de Debug
                            </button>
                            <button class="btn btn-outline-warning" onclick="window.location.reload()">
                                <i class="fas fa-sync me-2"></i>Recarregar Página
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Verificar se todos os itens são pending (campanha não executada)
    const allPending = statusData.every(item => item.status === 'pending');
    const pendingInfo = allPending ? `
        <div class="alert alert-info mb-3">
            <i class="fas fa-info-circle me-2"></i>
            <strong>Campanha Pendente:</strong> Esta campanha ainda não foi executada. 
            Os contatos abaixo serão enviados quando a campanha for processada.
        </div>
    ` : '';

    return `
        <div class="card">
            ${pendingInfo}
            <div class="card-header bg-light">
                 <div class="d-flex justify-content-between align-items-center">
                     <h6 class="mb-0">
                         <i class="fas fa-list me-2"></i>Detalhes dos Envios
                         <span class="badge bg-primary ms-2" id="totalVisible">${statusData.length}</span>
                         <small class="text-muted ms-2">de ${statusData.length} total</small>
                         ${allPending ? '<span class="badge bg-warning text-dark ms-2">Pendente</span>' : ''}
                     </h6>
                     <small class="text-muted">
                         <i class="fas fa-info-circle me-1"></i>
                         ${allPending ? 'Contatos que serão enviados' : 'Clique em um erro para ver detalhes completos'}
                     </small>
                 </div>
             </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0" id="statusTable">
                        <thead class="table-light">
                            <tr>
                                <th style="width: 5%;">#</th>
                                <th style="width: 25%;">
                                    <i class="fas fa-user me-1"></i>Contato
                                </th>
                                <th style="width: 15%;">
                                    <i class="fas fa-phone me-1"></i>Telefone
                                </th>
                                <th style="width: 15%;">
                                    <i class="fas fa-traffic-light me-1"></i>Status
                                </th>
                                <th style="width: 20%;">
                                    <i class="fas fa-clock me-1"></i>Data/Hora Envio
                                </th>
                                <th style="width: 20%;">
                                    <i class="fas fa-info-circle me-1"></i>Detalhes
                                </th>
                            </tr>
                        </thead>
                        <tbody id="statusTableBody">
                            ${statusData.map((item, index) => renderStatusRow(item, index + 1)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderStatusRow(item, index) {
    //console.log(item);
    const statusConfig = getStatusConfig(item.status);
    const formattedDate = item.created_at ? 
        formatDateBrazil(item.created_at) : 
        'Data não disponível';
    const formattedDateSent = item.sent_at ? 
        formatDateBrazil(item.sent_at) : 
        'Data não disponível';
    
    const errorMessage = item.error_message || item.error || '';
    const phone = item.contact_phone ? formatPhoneNumber(item.contact_phone) : 'N/A';
    const name = item.name || item.contact_name || 'Nome não disponível';
    
    return `
        <tr class="status-row" data-status="${item.status}" data-phone="${phone}" data-name="${name.toLowerCase()}">
            <td>
                <small class="text-muted">#${index}</small>
            </td>
                         <td>
                 <div class="d-flex align-items-center">
                     <div class="avatar-circle-small me-2 ${getAvatarClass(item.status)}" title="Status: ${statusConfig.text}">
                         ${name.charAt(0).toUpperCase()}
                     </div>
                     <div>
                         <div class="fw-medium">${name}</div>
                         ${item.tag ? `<small class="text-muted"><i class="fas fa-tag me-1"></i>${item.tag}</small>` : ''}
                     </div>
                 </div>
             </td>
            <td>
                <span class="font-monospace">${(phone)}</span>
            </td>
            <td>
                <span class="badge ${statusConfig.class} fs-6">
                    <i class="${statusConfig.icon} me-1"></i>
                    ${statusConfig.text}
                </span>
            </td>
            <td>
                <small class="text-muted">
                    ${item.status === 'pending' ? 'Aguardando envio' : formattedDateSent}
                </small>
            </td>
            <td>
                ${item.status === 'pending' ? `
                    <small class="text-warning">
                        <i class="fas fa-clock me-1"></i>
                        Aguardando processamento
                    </small>
                ` : errorMessage ? `
                    <div class="text-danger">
                        <small>
                            <i class="fas fa-exclamation-triangle me-1"></i>
                            ${truncateText(errorMessage, 50)}
                        </small>
                        ${errorMessage.length > 50 ? `
                            <br><button class="btn btn-sm btn-outline-danger mt-1" onclick="showFullError('${escapeHtml(errorMessage)}')">
                                Ver erro completo
                            </button>
                        ` : ''}
                    </div>
                ` : `
                    <small class="text-success">
                        <i class="fas fa-check-circle me-1"></i>
                        Processado com sucesso
                    </small>
                `}
            </td>
        </tr>
    `;
}

function getStatusConfig(status) {
    const configs = {
        'sent': { class: 'bg-success', icon: 'fas fa-check', text: 'Enviado' },
        'delivered': { class: 'bg-success', icon: 'fas fa-check-double', text: 'Entregue' },
        'read': { class: 'bg-info', icon: 'fas fa-eye', text: 'Lido' },
        'failed': { class: 'bg-danger', icon: 'fas fa-times', text: 'Falhou' },
        'error': { class: 'bg-danger', icon: 'fas fa-exclamation', text: 'Erro' },
        'pending': { class: 'bg-warning', icon: 'fas fa-clock', text: 'Pendente' },
        'queued': { class: 'bg-secondary', icon: 'fas fa-hourglass', text: 'Na Fila' }
    };
    
    return configs[status] || { class: 'bg-secondary', icon: 'fas fa-question', text: status || 'Desconhecido' };
}

function getAvatarClass(status) {
    const avatarClasses = {
        'sent': 'avatar-success',
        'delivered': 'avatar-success',
        'read': 'avatar-info',
        'failed': 'avatar-danger',
        'error': 'avatar-danger',
        'pending': 'avatar-warning',
        'queued': 'avatar-secondary'
    };
    
    return avatarClasses[status] || 'avatar-secondary';
}

function formatPhoneNumber(phone) {
    if (!phone) return 'N/A';
    
    // Formatação básica para números brasileiros
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.length === 13 && cleanPhone.startsWith('55')) {
        // +55 (11) 99999-9999
        return `+${cleanPhone.substring(0,2)} (${cleanPhone.substring(2,4)}) ${cleanPhone.substring(4,9)}-${cleanPhone.substring(9)}`;
    } else if (cleanPhone.length === 11) {
        // (11) 99999-9999
        return `(${cleanPhone.substring(0,2)}) ${cleanPhone.substring(2,7)}-${cleanPhone.substring(7)}`;
    }
    
    return phone;
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function setupStatusFilters(originalData) {
    const searchInput = document.getElementById('statusSearch');
    const statusFilter = document.getElementById('statusFilter');
    const tableBody = document.getElementById('statusTableBody');
    const totalVisible = document.getElementById('totalVisible');
    
    function filterTable() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusValue = statusFilter.value;
        
        const rows = document.querySelectorAll('.status-row');
        let visibleCount = 0;
        
        rows.forEach(row => {
            const name = row.dataset.name || '';
            const phone = row.dataset.phone || '';
            const status = row.dataset.status || '';
            
            const matchesSearch = name.includes(searchTerm) || phone.includes(searchTerm);
            const matchesStatus = !statusValue || status === statusValue;
            
            if (matchesSearch && matchesStatus) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });
        
        totalVisible.textContent = visibleCount;
    }
    
    searchInput.addEventListener('input', filterTable);
    statusFilter.addEventListener('change', filterTable);
    
    // Adicionar CSS para avatar pequeno
    if (!document.getElementById('avatarSmallStyles')) {
        const style = document.createElement('style');
        style.id = 'avatarSmallStyles';
        style.textContent = `
            .avatar-circle-small {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: linear-gradient(45deg, #007bff, #0056b3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 12px;
                flex-shrink: 0;
                transition: all 0.2s ease;
            }
            
            .avatar-circle-small.avatar-success {
                background: linear-gradient(45deg, #198754, #146c43);
            }
            
            .avatar-circle-small.avatar-danger {
                background: linear-gradient(45deg, #dc3545, #bb2d3b);
            }
            
            .avatar-circle-small.avatar-warning {
                background: linear-gradient(45deg, #ffc107, #e0a800);
                color: #000;
            }
            
            .avatar-circle-small.avatar-info {
                background: linear-gradient(45deg, #0dcaf0, #31d2f2);
                color: #000;
            }
            
            .avatar-circle-small.avatar-secondary {
                background: linear-gradient(45deg, #6c757d, #5c636a);
            }
            
            .status-row:hover .avatar-circle-small {
                transform: scale(1.1);
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }
        `;
        document.head.appendChild(style);
    }
}

function closeDetailedStatusModal() {
    // Limpar refresh automático se existir
    if (window.campaignStatusRefreshInterval) {
        clearInterval(window.campaignStatusRefreshInterval);
        window.campaignStatusRefreshInterval = null;
        console.log('⏰ Atualização automática cancelada');
    }
    
    const modal = document.getElementById('detailedStatusModal');
    if (modal) {
        modal.remove();
        console.log('✅ Modal de status fechado');
    }
}

function showFullError(errorMessage) {
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modal.style.zIndex = '999999';
    
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title">
                        <i class="fas fa-exclamation-triangle me-2"></i>Detalhes do Erro
                    </h5>
                    <button type="button" class="btn-close btn-close-white" onclick="this.closest('.modal').remove()"></button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-danger">
                        <strong>Mensagem de erro:</strong><br>
                        <code>${escapeHtml(errorMessage)}</code>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function exportStatusToCSV() {
    const rows = document.querySelectorAll('.status-row:not([style*="display: none"])');
    
    if (rows.length === 0) {
        window.app.showAlert('Nenhum dado visível para exportar', 'warning');
        return;
    }
    
    let csv = 'Nome,Telefone,Status,Data/Hora,Erro\n';
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const name = row.dataset.name || '';
        const phone = row.dataset.phone || '';
        const status = row.dataset.status || '';
        const dateTime = cells[4].textContent.trim();
        const error = cells[5].textContent.includes('Erro') ? 
            cells[5].textContent.replace(/\s+/g, ' ').trim() : '';
        
        csv += `"${name}","${phone}","${status}","${dateTime}","${error}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `status_campanha_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    window.app.showAlert('Arquivo CSV exportado com sucesso!', 'success');
}

// Função para forçar execução da campanha
async function forceCampaignExecution(campanhaId) {
    if (!campanhaId || campanhaId === 'null') {
        window.app.showAlert('ID da campanha não disponível', 'warning');
        return;
    }
    
    if (!confirm('Tem certeza que deseja tentar executar esta campanha novamente?')) {
        return;
    }
    
    try {
        console.log(`🔄 Forçando execução da campanha ${campanhaId}...`);
        
        const response = await fetch(`/api/campaigns/${campanhaId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Resposta da execução:', result);
            
            if (result.success) {
                window.app.showAlert('Execução da campanha iniciada com sucesso!', 'success');
                
                // Aguardar um pouco e recarregar o status
                setTimeout(() => {
                    refreshCampaignStatus(campanhaId);
                }, 3000);
            } else {
                window.app.showAlert(`Erro ao executar campanha: ${result.error || 'Erro desconhecido'}`, 'danger');
            }
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('❌ Erro ao forçar execução:', error);
        window.app.showAlert(`Erro ao executar campanha: ${error.message}`, 'danger');
    }
}

// Função para verificar status do banco de dados
async function checkDatabaseStatus(campanhaId) {
    try {
        console.log(`🔍 Verificando status do banco para campanha ${campanhaId}...`);
        
        // Tentar criar/verificar tabela campaign_status
        const response = await fetch('/api/campaigns/check-database', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ campaignId })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('📊 Status do banco:', result);
            
            const modal = document.createElement('div');
            modal.className = 'modal fade show';
            modal.style.display = 'block';
            modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
            modal.style.zIndex = '999999';
            
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-database me-2"></i>Status do Banco de Dados
                            </h5>
                            <button type="button" class="btn-close btn-close-white" onclick="this.closest('.modal').remove()"></button>
                        </div>
                        <div class="modal-body">
                            <pre class="bg-light p-3 rounded">${JSON.stringify(result, null, 2)}</pre>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        } else {
            window.app.showAlert('Endpoint de verificação do banco não disponível', 'warning');
        }
    } catch (error) {
        console.error('❌ Erro ao verificar banco:', error);
        window.app.showAlert(`Erro ao verificar banco: ${error.message}`, 'danger');
    }
}

// Função para mostrar informações de debug
async function showDebugInfo(campanhaId) {
    try {
        console.log(`🐛 Coletando informações de debug para campanha ${campanhaId}...`);
        
        const debugInfo = {
            campanhaId: campanhaId,
            timestamp: new Date().toISOString(),
            browser: navigator.userAgent,
            url: window.location.href,
            localStorage: {
                authToken: !!localStorage.getItem('authToken'),
                user: localStorage.getItem('user')
            }
        };
        
        // Buscar informações da campanha
        try {
            const response = await fetch('/api/campaigns', {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (response.ok) {
                const campaigns = await response.json();
                const campaign = campaigns.find(c => String(c.id) === String(campanhaId));
                debugInfo.campaign = campaign || 'Não encontrada';
                debugInfo.totalCampaigns = campaigns.length;
            }
        } catch (e) {
            debugInfo.campaignError = e.message;
        }
        
        // Testar endpoint de status
        try {
            const statusResponse = await fetch(`/api/campaigns/${campanhaId}/status`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            debugInfo.statusEndpoint = {
                status: statusResponse.status,
                statusText: statusResponse.statusText,
                ok: statusResponse.ok
            };
            
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                debugInfo.statusData = {
                    type: typeof statusData,
                    isArray: Array.isArray(statusData),
                    length: statusData.length,
                    sample: statusData.slice(0, 2) // Primeiros 2 registros
                };
            }
        } catch (e) {
            debugInfo.statusError = e.message;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal fade show';
        modal.style.display = 'block';
        modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
        modal.style.zIndex = '999999';
        
        modal.innerHTML = `
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header bg-dark text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-bug me-2"></i>Informações de Debug - Campanha ${campanhaId}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" onclick="this.closest('.modal').remove()"></button>
                    </div>
                    <div class="modal-body">
                        <div class="d-flex gap-2 mb-3">
                            <button class="btn btn-sm btn-outline-primary" onclick="copyDebugInfo()">
                                <i class="fas fa-copy me-1"></i>Copiar
                            </button>
                            <button class="btn btn-sm btn-outline-success" onclick="downloadDebugInfo()">
                                <i class="fas fa-download me-1"></i>Download
                            </button>
                        </div>
                        <pre id="debugInfoContent" class="bg-dark text-light p-3 rounded" style="max-height: 500px; overflow-y: auto;">${JSON.stringify(debugInfo, null, 2)}</pre>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Armazenar debug info globalmente para funções de cópia/download
        window.currentDebugInfo = debugInfo;
        
    } catch (error) {
        console.error('❌ Erro ao coletar debug info:', error);
        window.app.showAlert(`Erro ao coletar informações: ${error.message}`, 'danger');
    }
}

function copyDebugInfo() {
    const content = document.getElementById('debugInfoContent').textContent;
    navigator.clipboard.writeText(content).then(() => {
        window.app.showAlert('Informações de debug copiadas!', 'success');
    }).catch(() => {
        window.app.showAlert('Erro ao copiar informações', 'danger');
    });
}

function downloadDebugInfo() {
    const content = JSON.stringify(window.currentDebugInfo, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `debug_campanha_${window.currentDebugInfo.campanhaId}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.app.showAlert('Arquivo de debug baixado!', 'success');
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
                                                    ${formatDateBrazil(erro.created_at)}
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
        const campanhaHeader = document.querySelector('#campaignFormArea .modal-header h5, #campaignFormArea .card-header h5');
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
    const uploadDate = formatDateBrazil(file.upload_date);
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
    const uploadDate = formatDateBrazil(file.upload_date);
    
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

// ... após a definição da função showInboxTemplateIndicator ...
window.showInboxTemplateIndicator = showInboxTemplateIndicator;
// ...

// Função para excluir campanha e todos os logs relacionados
async function deleteCampanha(campanhaId) {
    if (!confirm('Tem certeza que deseja excluir esta campanha e todos os registros relacionados?')) return;
    try {
        const response = await fetch(`/api/campaigns/${campanhaId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const result = await response.json();
        if (result.success) {
            window.app.showAlert('Campanha excluída com sucesso!', 'success');
            loadCampanhasList();
        } else {
            window.app.showAlert('Erro ao excluir campanha: ' + (result.error || 'Erro desconhecido'), 'danger');
        }
    } catch (error) {
        console.error('Erro ao excluir campanha:', error);
        window.app.showAlert('Erro ao excluir campanha', 'danger');
    }
}

// Função para corrigir campanhas presas no status "running"
async function corrigirCampanhasPresas() {
    if (!confirm('Verificar e corrigir campanhas que estão presas no status "running"?\n\nEsta ação irá:\n- Marcar como "completed" campanhas que já terminaram\n- Marcar como "failed" campanhas com muitos erros\n- Tentar reprocessar campanhas com contatos pendentes')) return;
    
    try {
        window.app.showAlert('Verificando campanhas presas...', 'info');
        
        const response = await fetch('/api/campaigns/fix-stuck', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (result.fixed === 0) {
                window.app.showAlert('✅ Nenhuma campanha presa encontrada!', 'success');
            } else {
                let message = `✅ ${result.fixed} campanha(s) corrigida(s):\n\n`;
                result.campaigns.forEach(campaign => {
                    message += `• ${campaign.name} → ${campaign.status} (${campaign.reason})\n`;
                });
                window.app.showAlert(message, 'success');
                
                // Recarregar lista após correção
                setTimeout(() => loadCampanhasList(), 1000);
            }
        } else {
            window.app.showAlert('Erro ao corrigir campanhas: ' + (result.error || 'Erro desconhecido'), 'danger');
        }
    } catch (error) {
        console.error('Erro ao corrigir campanhas presas:', error);
        window.app.showAlert('Erro ao corrigir campanhas presas', 'danger');
    }
}

// ==================== FUNÇÕES PARA AGENTES IA ====================

// Variáveis globais para agentes IA
let currentEditingAgent = null;
let availableModels = [];

// Mostrar gerenciador de agentes IA
function showAIAgentManager() {
    document.getElementById('aiAgentManagerDiv').classList.remove('d-none');
    loadAIAgents();
}

// Fechar gerenciador de agentes IA
function hideAIAgentManager() {
    document.getElementById('aiAgentManagerDiv').classList.add('d-none');
}

// Carregar lista de agentes IA
async function loadAIAgents() {
    try {
        const response = await fetch('/api/ai-agents', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('authToken')
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar agentes IA');
        }
        
        const data = await response.json();
        displayAIAgents(data.agents || []);
    } catch (error) {
        console.error('Erro ao carregar agentes IA:', error);
        document.getElementById('aiAgentsList').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Erro ao carregar agentes IA: ${error.message}
            </div>
        `;
    }
}

// Exibir lista de agentes IA
function displayAIAgents(agents) {
    const container = document.getElementById('aiAgentsList');
    
    if (!agents || agents.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-robot fa-3x mb-3"></i>
                <p>Nenhum agente IA cadastrado ainda.</p>
                <p>Clique em "Novo Agente IA" para criar o primeiro.</p>
            </div>
        `;
        return;
    }
    
    const agentsHtml = agents.map(agent => `
        <div class="card mb-3">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <h6 class="mb-1">
                            <i class="fas fa-robot me-2"></i>${agent.name}
                            ${agent.is_active ? '<span class="badge bg-success ms-2">Ativo</span>' : '<span class="badge bg-secondary ms-2">Inativo</span>'}
                        </h6>
                        <p class="text-muted mb-1">
                            <strong>Modelo:</strong> ${agent.model} | 
                            <strong>Provedor:</strong> ${agent.api_provider}
                        </p>
                        <p class="text-muted mb-0">
                            <strong>Criado por:</strong> ${agent.created_by_name || 'N/A'} | 
                            <strong>Data:</strong> ${formatDateBrazil(agent.created_at)}
                        </p>
                        ${agent.pdf_filename ? `<p class="text-muted mb-0"><strong>PDF:</strong> ${agent.pdf_filename}</p>` : ''}
                    </div>
                    <div class="col-md-4 text-end">
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-outline-primary" onclick="editAIAgent('${agent.id}')">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteAIAgent('${agent.id}', '${escapeHtml(agent.name)}')">
                                <i class="fas fa-trash"></i> Deletar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = agentsHtml;
}

// Mostrar formulário de criação de agente IA
async function showCreateAIAgentForm() {
    currentEditingAgent = null;
    
    const titleElement = document.getElementById('aiAgentFormTitle');
    if (titleElement) {
        titleElement.textContent = 'Novo Agente IA';
    }
    
    const formElement = document.getElementById('aiAgentForm');
    if (formElement) {
        formElement.reset();
        
        // Resetar configurações de calendário
        const calendarEnabled = document.getElementById('calendarEnabled');
        const calendarConfig = document.getElementById('calendarConfig');
        if (calendarEnabled && calendarConfig) {
            calendarEnabled.checked = false;
            calendarConfig.classList.add('d-none');
        }
    }
    
    const activeCheckbox = document.getElementById('agentActive');
    if (activeCheckbox) {
        activeCheckbox.checked = true;
    }
    
    // Carregar modelos disponíveis
    await loadAvailableProviders();
    
    // Mostrar formulário
    const formDiv = document.getElementById('aiAgentFormDiv');
    if (formDiv) {
        formDiv.classList.remove('d-none');
    }
    
    hideAIAgentManager();
}

// Editar agente IA
async function editAIAgent(agentId) {
    try {
        const response = await fetch(`/api/ai-agents/${agentId}`, {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('authToken')
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar agente IA');
        }
        
        const data = await response.json();
        const agent = data.agent;
        
        currentEditingAgent = agent;
        
        const titleElement = document.getElementById('aiAgentFormTitle');
        if (titleElement) {
            titleElement.textContent = 'Editar Agente IA';
        }
        
        // Preencher formulário
        const nameInput = document.getElementById('agentName');
        if (nameInput) nameInput.value = agent.name;
        
        // Preencher configurações de calendário
        const calendarEnabled = document.getElementById('calendarEnabled');
        const calendarConfig = document.getElementById('calendarConfig');
        if (calendarEnabled && calendarConfig) {
            calendarEnabled.checked = agent.calendar_enabled || false;
            if (agent.calendar_enabled) {
                calendarConfig.classList.remove('d-none');
            } else {
                calendarConfig.classList.add('d-none');
            }
        }
        
        const calendarIdInput = document.getElementById('calendarId');
        if (calendarIdInput) calendarIdInput.value = agent.calendar_id || '';
        
        const calendarCredentialsTextarea = document.getElementById('calendarCredentials');
        if (calendarCredentialsTextarea) calendarCredentialsTextarea.value = agent.calendar_credentials || '';
        
        const calendarStartHourInput = document.getElementById('calendarStartHour');
        if (calendarStartHourInput) calendarStartHourInput.value = agent.calendar_start_hour || 9;
        
        const calendarEndHourInput = document.getElementById('calendarEndHour');
        if (calendarEndHourInput) calendarEndHourInput.value = agent.calendar_end_hour || 18;
        
        const calendarDurationInput = document.getElementById('calendarDuration');
        if (calendarDurationInput) calendarDurationInput.value = agent.calendar_duration_minutes || 60;
        
        const calendarWorkdaysSelect = document.getElementById('calendarWorkdays');
        if (calendarWorkdaysSelect) calendarWorkdaysSelect.value = agent.calendar_workdays || '1,2,3,4,5';
        
        const useGoogleMeetingCheckbox = document.getElementById('useGoogleMeeting');
        if (useGoogleMeetingCheckbox) useGoogleMeetingCheckbox.checked = agent.use_google_meeting || false;
        
        const temperatureInput = document.getElementById('agentTemperature');
        if (temperatureInput) temperatureInput.value = agent.temperature || 0.10;
        
        const systemPromptTextarea = document.getElementById('agentSystemPrompt');
        if (systemPromptTextarea) systemPromptTextarea.value = agent.system_prompt;
        
        const activeCheckbox = document.getElementById('agentActive');
        if (activeCheckbox) activeCheckbox.checked = agent.is_active;
        
        // Carregar provedores e selecionar o atual
        await loadAvailableProviders();
        
        const providerSelect = document.getElementById('agentProvider');
        if (providerSelect) {
            providerSelect.value = agent.api_provider;
            
            // Carregar modelos do provedor selecionado
            await loadModelsForProvider();
            
            // Selecionar o modelo após carregar
            const modelSelect = document.getElementById('agentModel');
            if (modelSelect) {
                setTimeout(() => {
                    modelSelect.value = agent.model;
                }, 500); // Aguardar mais tempo para garantir que os modelos foram carregados
            }
        }
        
        // Mostrar formulário
        const formDiv = document.getElementById('aiAgentFormDiv');
        if (formDiv) {
            formDiv.classList.remove('d-none');
        }
        
        hideAIAgentManager();
        
    } catch (error) {
        console.error('Erro ao carregar agente IA:', error);
        window.app.showAlert('Erro ao carregar agente IA: ' + error.message, 'danger');
    }
}

// Carregar modelos disponíveis
// Carregar provedores de IA disponíveis
async function loadAvailableProviders() {
    try {
        // Usar o endpoint local do chatbot-workflow-system
        const response = await fetch('/providers', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar provedores');
        }
        
        const data = await response.json();
        const providers = data.providers || [];
        
        const select = document.getElementById('agentProvider');
        if (select) {
            select.innerHTML = '<option value="">Selecione um provedor...</option>';
            
            providers.forEach(provider => {
                if (provider.is_active) {
                    const option = document.createElement('option');
                    option.value = provider.name;
                    option.textContent = `${provider.display_name} (${provider.name})`;
                    select.appendChild(option);
                }
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar provedores:', error);
        const select = document.getElementById('agentProvider');
        if (select) {
            select.innerHTML = '<option value="">Erro ao carregar provedores</option>';
        }
    }
}

// Carregar modelos de um provedor específico (função global)
window.loadModelsForProvider = async function loadModelsForProvider() {
    const providerSelect = document.getElementById('agentProvider');
    const modelSelect = document.getElementById('agentModel');
    
    if (!providerSelect || !modelSelect) {
        return;
    }
    
    const selectedProvider = providerSelect.value;
    
    if (!selectedProvider) {
        modelSelect.innerHTML = '<option value="">Selecione um provedor primeiro</option>';
        modelSelect.disabled = true;
        return;
    }
    
    try {
        modelSelect.innerHTML = '<option value="">Carregando modelos...</option>';
        modelSelect.disabled = true;
        
        const response = await fetch(`/providers/${selectedProvider}/models`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar modelos');
        }
        
        const data = await response.json();
        const models = data.models || [];
        
        modelSelect.innerHTML = '<option value="">Selecione um modelo...</option>';
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = `${model.name} (${model.description})`;
            modelSelect.appendChild(option);
        });
        
        modelSelect.disabled = false;
        
    } catch (error) {
        console.error('Erro ao carregar modelos:', error);
        modelSelect.innerHTML = '<option value="">Erro ao carregar modelos</option>';
        modelSelect.disabled = true;
    }
};

// Função legada - manter para compatibilidade
async function loadAvailableModels() {
    // Esta função agora é substituída por loadModelsForProvider
    // Mas mantemos para compatibilidade com código existente
    await loadAvailableProviders();
}

// Fechar formulário de agente IA
function hideAIAgentForm() {
    const formDiv = document.getElementById('aiAgentFormDiv');
    if (formDiv) {
        formDiv.classList.add('d-none');
    }
    
    // Resetar formulário
    const form = document.getElementById('aiAgentForm');
    if (form) {
        form.reset();
    }
    
    // Resetar selects
    const providerSelect = document.getElementById('agentProvider');
    const modelSelect = document.getElementById('agentModel');
    
    if (providerSelect) {
        providerSelect.innerHTML = '<option value="">Selecione um provedor...</option>';
    }
    
    if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Selecione um provedor primeiro</option>';
        modelSelect.disabled = true;
    }
    
    currentEditingAgent = null;
}

// Deletar agente IA
async function deleteAIAgent(agentId, agentName) {
    if (!confirm(`Tem certeza que deseja deletar o agente IA "${agentName}"?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/ai-agents/${agentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('authToken')
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao deletar agente IA');
        }
        
        window.app.showAlert('Agente IA deletado com sucesso!', 'success');
        loadAIAgents();
        
    } catch (error) {
        console.error('Erro ao deletar agente IA:', error);
        window.app.showAlert('Erro ao deletar agente IA: ' + error.message, 'danger');
    }
}

// Event listeners para agentes IA
document.addEventListener('DOMContentLoaded', function() {
    // Fechar gerenciador de agentes IA
    const closeAIAgentManagerBtn = document.getElementById('closeAIAgentManager');
    if (closeAIAgentManagerBtn) {
        closeAIAgentManagerBtn.addEventListener('click', hideAIAgentManager);
    }
    
    // Formulário de agente IA
    const aiAgentForm = document.getElementById('aiAgentForm');
    if (aiAgentForm) {
        aiAgentForm.addEventListener('submit', handleAIAgentSubmit);
    }
    
    // Event listener para checkbox de calendário
    const calendarEnabled = document.getElementById('calendarEnabled');
    const calendarConfig = document.getElementById('calendarConfig');
    if (calendarEnabled && calendarConfig) {
        calendarEnabled.addEventListener('change', function() {
            if (this.checked) {
                calendarConfig.classList.remove('d-none');
            } else {
                calendarConfig.classList.add('d-none');
            }
        });
    }
    
    // Validação de arquivo PDF
    const agentPdfFile = document.getElementById('agentPdfFile');
    if (agentPdfFile) {
        agentPdfFile.addEventListener('change', validatePdfFile);
    }
    
    // Atualizar valor da temperatura quando o slider mudar
    const temperatureSlider = document.getElementById('agentTemperature');
    const temperatureValue = document.getElementById('temperatureValue');
    if (temperatureSlider && temperatureValue) {
        temperatureSlider.addEventListener('input', function() {
            temperatureValue.textContent = this.value;
        });
    }
});

// Validar arquivo PDF
function validatePdfFile(event) {
    const file = event.target.files[0];
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (file) {
        if (file.type !== 'application/pdf') {
            window.app.showAlert('Apenas arquivos PDF são aceitos!', 'danger');
            event.target.value = '';
            return;
        }
        
        if (file.size > maxSize) {
            window.app.showAlert('O arquivo deve ter no máximo 50MB!', 'danger');
            event.target.value = '';
            return;
        }
        
        // Mostrar informações do arquivo
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        const infoElement = document.getElementById('pdfUploadInfo');
        if (infoElement) {
            infoElement.innerHTML = `
                <i class="fas fa-info-circle me-2"></i>
                Arquivo selecionado: ${file.name} (${sizeInMB} MB)
            `;
            infoElement.classList.remove('d-none');
        }
    }
}

// Submeter formulário de agente IA
async function handleAIAgentSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const saveBtn = document.getElementById('saveAgentBtn');
    
    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Salvando...';
        }
        
        // Mostrar progresso
        const progressDiv = document.getElementById('pdfUploadProgress');
        if (progressDiv) {
            progressDiv.classList.remove('d-none');
            const progressBar = progressDiv.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = '0%';
            }
        }
        
        const url = currentEditingAgent ? `/api/ai-agents/${currentEditingAgent.id}` : '/api/ai-agents';
        const method = currentEditingAgent ? 'PUT' : 'POST';
        
        // Converter FormData para JSON (exceto o arquivo PDF)
        const agentData = {
            name: formData.get('name'),
            api_provider: formData.get('api_provider'),
            model: formData.get('model'),
            system_prompt: formData.get('system_prompt'),
            is_active: formData.get('is_active') === 'on',
            calendar_enabled: formData.has('calendar_enabled'),
            calendar_credentials: formData.get('calendar_credentials'),
            calendar_id: formData.get('calendar_id'),
            calendar_start_hour: parseInt(formData.get('calendar_start_hour')) || 9,
            calendar_end_hour: parseInt(formData.get('calendar_end_hour')) || 18,
            calendar_workdays: formData.get('calendar_workdays') || '1,2,3,4,5',
            calendar_duration_minutes: parseInt(formData.get('calendar_duration_minutes')) || 60,
            use_google_meeting: formData.has('use_google_meeting'),
            temperature: parseFloat(formData.get('temperature')) || 0.10
        };
        const requestBody = JSON.stringify(agentData);
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('authToken'),
                'Content-Type': 'application/json'
            },
            body: requestBody
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao salvar agente IA');
        }
        
        const data = await response.json();
        
        // Fazer upload do PDF se houver arquivo selecionado (criação ou edição)
        const pdfFile = formData.get('pdf_file');
        if (pdfFile && pdfFile.size > 0) {
            await uploadPdfToAgent(data.agent.id, pdfFile);
        }
        
        window.app.showAlert(
            currentEditingAgent ? 'Agente IA atualizado com sucesso!' : 'Agente IA criado com sucesso!', 
            'success'
        );
        
        hideAIAgentForm();
        showAIAgentManager();
        loadAIAgents();
        
    } catch (error) {
        console.error('Erro ao salvar agente IA:', error);
        window.app.showAlert('Erro ao salvar agente IA: ' + error.message, 'danger');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar Agente';
        }
        const progressDiv = document.getElementById('pdfUploadProgress');
        if (progressDiv) {
            progressDiv.classList.add('d-none');
        }
    }
}

// Upload de PDF para agente IA (direto para a API do ia-agent)
async function uploadPdfToAgent(agentId, pdfFile) {
    try {
        const formData = new FormData();
        formData.append('pdf_file', pdfFile);
        
        // Simular progresso
        const progressDiv = document.getElementById('pdfUploadProgress');
        if (progressDiv) {
            const progressBar = progressDiv.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = '50%';
            }
        }
        
        // Upload direto para a API do ia-agent (sem proxy)
        const response = await fetch(`/agents/${agentId}/upload-pdf`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Erro ao fazer upload do PDF');
        }
        
        const data = await response.json();
        
        if (progressDiv) {
            const progressBar = progressDiv.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = '100%';
            }
        }
        
        const successElement = document.getElementById('pdfUploadSuccess');
        if (successElement) {
            successElement.innerHTML = `
                <i class="fas fa-check-circle me-2"></i>
                PDF enviado com sucesso! Agente IA está pronto para uso.
            `;
            successElement.classList.remove('d-none');
        }
        
        return data;
        
    } catch (error) {
        console.error('Erro no upload do PDF:', error);
        const errorElement = document.getElementById('pdfUploadError');
        if (errorElement) {
            errorElement.innerHTML = `
                <i class="fas fa-exclamation-triangle me-2"></i>
                Erro no upload do PDF: ${error.message}
            `;
            errorElement.classList.remove('d-none');
        }
        throw error;
    }
}

// ==================== FUNÇÕES PARA EDITOR DE WORKFLOW ====================

// Alternar entre tipo de fluxo estático e IA
function toggleWorkflowType() {
    const staticType = document.getElementById('workflowTypeStatic');
    const aiType = document.getElementById('workflowTypeAI');
    const aiAgentSelection = document.getElementById('aiAgentSelection');
    const templateSelection = document.getElementById('templateSelection');
    const workflowConfig = document.getElementById('workflowConfig');
    
    if (aiType && aiType.checked) {
        // Mostrar seleção de agente IA e ocultar template
        if (aiAgentSelection) aiAgentSelection.style.display = 'block';
        if (templateSelection) templateSelection.style.display = 'none';
        if (workflowConfig) {
            workflowConfig.disabled = true;
            workflowConfig.placeholder = 'Configuração desabilitada para Agentes IA';
        }
        
        // Carregar agentes IA disponíveis
        loadAvailableAIAgents();
    } else {
        // Mostrar template e ocultar seleção de agente IA
        if (aiAgentSelection) aiAgentSelection.style.display = 'none';
        if (templateSelection) templateSelection.style.display = 'block';
        if (workflowConfig) {
            workflowConfig.disabled = false;
            workflowConfig.placeholder = 'Cole aqui a configuração JSON do fluxo';
        }
    }
}

// Carregar agentes IA disponíveis para seleção
async function loadAvailableAIAgents() {
    try {
        const response = await fetch('/api/ai-agents', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('authToken')
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar agentes IA');
        }
        
        const data = await response.json();
        const agents = data.agents || [];
        
        const select = document.getElementById('aiAgentSelect');
        if (select) {
            select.innerHTML = '<option value="">Selecione um agente IA...</option>';
            
            agents.forEach(agent => {
                if (agent.is_active) {
                    const option = document.createElement('option');
                    option.value = agent.id;
                    option.textContent = `${agent.name} (${agent.model})`;
                    select.appendChild(option);
                }
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar agentes IA:', error);
        const select = document.getElementById('aiAgentSelect');
        if (select) {
            select.innerHTML = '<option value="">Erro ao carregar agentes IA</option>';
        }
    }
}

// Salvar workflow com suporte a agentes IA
async function saveWorkflowWithAI() {
    const accountId = document.getElementById('accountSelect').value;
    const inboxId = document.getElementById('inboxSelect').value;
    const workflowName = document.getElementById('workflowName').value;
    const workflowType = document.querySelector('input[name="workflowType"]:checked').value;
    
    if (!accountId || !inboxId || !workflowName) {
        window.app.showAlert('Preencha todos os campos obrigatórios', 'warning');
        return;
    }
    
    try {
        if (workflowType === 'ai') {
            // Salvar workflow com agente IA
            const aiAgentSelect = document.getElementById('aiAgentSelect');
        const agentId = aiAgentSelect ? aiAgentSelect.value : null;
            if (!agentId) {
                window.app.showAlert('Selecione um agente IA', 'warning');
                return;
            }
            
            // Criar workflow básico
            const workflowData = {
                accountId: parseInt(accountId),
                inboxId: parseInt(inboxId),
                workflowName: workflowName,
                workflowConfig: JSON.stringify({
                    type: 'ai_agent',
                    agent_id: agentId, // UUID como string, não converter para inteiro
                    blocks: [] // Sem blocos - o agente IA vai responder diretamente
                })
            };
            
            // Salvar workflow
            const response = await fetch('/api/inbox-workflows', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('authToken')
                },
                body: JSON.stringify(workflowData)
            });
            
            if (!response.ok) {
                throw new Error('Erro ao salvar workflow');
            }
            
            // Vincular agente IA ao workflow
            const linkResponse = await fetch(`/api/workflows/${workflowName}/ai-agent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('authToken')
                },
                body: JSON.stringify({ agent_id: agentId }) // UUID como string, não converter para inteiro
            });
            
            if (!linkResponse.ok) {
                throw new Error('Erro ao vincular agente IA ao workflow');
            }
            
            window.app.showAlert('Workflow com Agente IA salvo com sucesso!', 'success');
            
        } else {
            // Salvar workflow estático (comportamento original)
            await window.app.saveWorkflow();
        }
        
        // Recarregar lista de workflows ativos
        await window.app.loadActiveWorkflows(true);
        window.app.hideWorkflowEditor();
        
    } catch (error) {
        console.error('Erro ao salvar workflow:', error);
        window.app.showAlert('Erro ao salvar workflow: ' + error.message, 'danger');
    }
}

// ===== FUNÇÕES DE GERENCIAMENTO DE PROVEDORES IA =====

// Variáveis globais para provedores
let currentProviderId = null;
let providers = [];

// Mostrar gerenciador de provedores
function showProviderManager() {
    document.getElementById('providerManagerDiv').classList.remove('d-none');
    document.getElementById('app').classList.add('d-none');
}

// Esconder gerenciador de provedores
function hideProviderManager() {
    document.getElementById('providerManagerDiv').classList.add('d-none');
    document.getElementById('app').classList.remove('d-none');
}

// Mostrar formulário de criação/edição de provedor
function showCreateProviderForm() {
    currentProviderId = null;
    document.getElementById('providerFormTitle').innerHTML = '<i class="fas fa-server me-2"></i>Novo Provedor IA';
    document.getElementById('providerForm').reset();
    document.getElementById('providerActive').checked = true;
    document.getElementById('providerMaxTokens').value = '4096';
    
    // Limpar checkboxes de capacidades
    document.getElementById('providerStreaming').checked = false;
    document.getElementById('providerEmbeddings').checked = false;
    document.getElementById('providerVision').checked = false;
    
    document.getElementById('providerManagerDiv').classList.add('d-none');
    document.getElementById('providerFormDiv').classList.remove('d-none');
}

// Esconder formulário de provedor
function hideProviderForm() {
    document.getElementById('providerFormDiv').classList.add('d-none');
    document.getElementById('providerManagerDiv').classList.remove('d-none');
    currentProviderId = null;
}

// Carregar lista de provedores
async function loadProviders() {
    try {
        const response = await fetch('/providers', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        providers = data.providers;
        displayProviders(providers);
        
    } catch (error) {
        console.error('Erro ao carregar provedores:', error);
        showAlert('Erro ao carregar provedores: ' + error.message, 'danger');
    }
}

// Exibir lista de provedores
function displayProviders(providersList) {
    const providersListDiv = document.getElementById('providersList');
    
    if (!providersList || providersList.length === 0) {
        providersListDiv.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-server fa-3x mb-3"></i>
                <h5>Nenhum provedor cadastrado</h5>
                <p>Clique em "Novo Provedor IA" para adicionar o primeiro provedor.</p>
            </div>
        `;
        return;
    }
    
    const providersHtml = providersList.map(provider => `
        <div class="card mb-3">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <div class="d-flex align-items-center mb-2">
                            <h6 class="mb-0 me-3">${provider.display_name}</h6>
                            <span class="badge ${provider.is_active ? 'bg-success' : 'bg-secondary'}">
                                ${provider.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                        </div>
                        <p class="text-muted mb-2">
                            <strong>Nome:</strong> ${provider.name} | 
                            <strong>URL:</strong> ${provider.api_base_url}
                        </p>
                        <p class="text-muted mb-2">
                            <strong>Capacidades:</strong>
                            ${provider.supports_streaming ? '<span class="badge bg-info me-1">Streaming</span>' : ''}
                            ${provider.supports_embeddings ? '<span class="badge bg-info me-1">Embeddings</span>' : ''}
                            ${provider.supports_vision ? '<span class="badge bg-info me-1">Visão</span>' : ''}
                        </p>
                        ${provider.description ? `<p class="text-muted mb-0"><small>${provider.description}</small></p>` : ''}
                    </div>
                    <div class="col-md-4 text-end">
                        <div class="btn-group" role="group">
                            <button class="btn btn-outline-primary btn-sm" onclick="editProvider('${provider.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-info btn-sm" onclick="viewProviderModels('${provider.name}')" title="Ver Modelos">
                                <i class="fas fa-list"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="deleteProvider('${provider.id}', '${provider.display_name}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    providersListDiv.innerHTML = providersHtml;
}

// Editar provedor
function editProvider(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
        showAlert('Provedor não encontrado', 'danger');
        return;
    }
    
    currentProviderId = providerId;
    document.getElementById('providerFormTitle').innerHTML = '<i class="fas fa-server me-2"></i>Editar Provedor IA';
    
    // Preencher formulário
    document.getElementById('providerName').value = provider.name;
    document.getElementById('providerDisplayName').value = provider.display_name;
    document.getElementById('providerApiUrl').value = provider.api_base_url;
    document.getElementById('providerApiKey').value = provider.api_key || '';
    document.getElementById('providerDescription').value = provider.description || '';
    document.getElementById('providerActive').checked = provider.is_active;
    document.getElementById('providerMaxTokens').value = provider.max_tokens;
    document.getElementById('providerDefaultModel').value = provider.default_model || '';
    
    // Preencher checkboxes de capacidades
    document.getElementById('providerStreaming').checked = provider.supports_streaming;
    document.getElementById('providerEmbeddings').checked = provider.supports_embeddings;
    document.getElementById('providerVision').checked = provider.supports_vision;
    
    document.getElementById('providerManagerDiv').classList.add('d-none');
    document.getElementById('providerFormDiv').classList.remove('d-none');
}

// Ver modelos do provedor
async function viewProviderModels(providerName) {
    try {
        const response = await fetch(`/providers/${providerName}/models`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Criar modal para mostrar modelos
        const modalHtml = `
            <div class="modal fade" id="providerModelsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-list me-2"></i>Modelos do Provedor: ${providerName}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p><strong>Total de modelos:</strong> ${data.total_models}</p>
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>ID do Modelo</th>
                                            <th>Descrição</th>
                                            <th>Max Tokens</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.models.map(model => `
                                            <tr>
                                                <td><code>${model.id}</code></td>
                                                <td>${model.description}</td>
                                                <td>${model.max_tokens.toLocaleString()}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remover modal existente se houver
        const existingModal = document.getElementById('providerModelsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Adicionar modal ao DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('providerModelsModal'));
        modal.show();
        
    } catch (error) {
        console.error('Erro ao carregar modelos:', error);
        showAlert('Erro ao carregar modelos: ' + error.message, 'danger');
    }
}

// Excluir provedor
async function deleteProvider(providerId, providerName) {
    if (!confirm(`Tem certeza que deseja excluir o provedor "${providerName}"?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/providers/${providerId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`);
        }
        
        showAlert('Provedor excluído com sucesso!', 'success');
        await loadProviders();
        
    } catch (error) {
        console.error('Erro ao excluir provedor:', error);
        showAlert('Erro ao excluir provedor: ' + error.message, 'danger');
    }
}

// Salvar provedor (criar ou atualizar)
async function handleProviderSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const providerData = {
        name: formData.get('name'),
        display_name: formData.get('display_name'),
        api_base_url: formData.get('api_base_url'),
        api_key: formData.get('api_key'),
        description: formData.get('description'),
        is_active: formData.get('is_active') === 'on',
        max_tokens: parseInt(formData.get('max_tokens')),
        default_model: formData.get('default_model'),
        supports_streaming: formData.get('supports_streaming') === 'on',
        supports_embeddings: formData.get('supports_embeddings') === 'on',
        supports_vision: formData.get('supports_vision') === 'on'
    };
    
    try {
        const url = currentProviderId 
            ? `/providers/${currentProviderId}`
            : '/providers';
        
        const method = currentProviderId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(providerData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const action = currentProviderId ? 'atualizado' : 'criado';
        
        showAlert(`Provedor ${action} com sucesso!`, 'success');
        hideProviderForm();
        await loadProviders();
        
    } catch (error) {
        console.error('Erro ao salvar provedor:', error);
        showAlert('Erro ao salvar provedor: ' + error.message, 'danger');
    }
}

// Event listeners para provedores
document.addEventListener('DOMContentLoaded', function() {
    // Formulário de provedor
    const providerForm = document.getElementById('providerForm');
    if (providerForm) {
        providerForm.addEventListener('submit', handleProviderSubmit);
    }
    
    // Botão fechar gerenciador de provedores
    const closeProviderManagerBtn = document.getElementById('closeProviderManager');
    if (closeProviderManagerBtn) {
        closeProviderManagerBtn.addEventListener('click', hideProviderManager);
    }
});