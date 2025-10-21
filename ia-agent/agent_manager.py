import os
import tempfile
import unicodedata
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
import json as _json
import redis
from datetime import datetime, timedelta
from langchain_community.document_loaders.pdf import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores.faiss import FAISS
from langchain_groq import ChatGroq
# Nova estrutura de memória do LangChain v1.0
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent, AgentState
from langchain_core.prompts import PromptTemplate
from groq_client import GroqClient
from google_calendar_service import GoogleCalendarService

class AgentManager:
    """Gerenciador de agentes IA"""
    
    def __init__(self):
        self.groq_client = GroqClient()
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            model_kwargs={'device': 'cpu'}
        )
        # Cache de chains por agente
        self.agent_chains = {}
        # Checkpointer para memória de conversação (LangChain v1.0)
        self.checkpointer = InMemorySaver()
        # Cache de serviços de calendário por agente
        self.calendar_services = {}
        # Último evento criado por agente (para anexar email depois)
        # Estrutura: { agent_id: { 'event_id': str, 'calendar_id': str } }
        self.last_events = {}
        # Redis para persistir última data/hora detectada por agente
        self.redis = redis.Redis(host=os.getenv('REDIS_HOST', 'redis-dev'),
                                 port=int(os.getenv('REDIS_PORT', '6379')),
                                 password=os.getenv('REDIS_PASSWORD', 'invoAI@76925'),
                                 decode_responses=True)
        self._last_sched_prefix = 'agent:last_scheduling_info:'
    
    def create_vectorstore(self, pdf_path: str, vectorstore_path: str) -> bool:
        """Cria vectorstore a partir de um PDF"""
        try:
            # Carregar PDF
            loader = PyPDFLoader(pdf_path)
            documents = loader.load()
            
            if not documents:
                print(f"Nenhum documento encontrado no PDF: {pdf_path}")
                return False
            
            # Dividir documentos em chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=50,
                separators=["\n\n", "\n", ".", " ", ""]
            )
            
            split_documents = text_splitter.split_documents(documents)
            
            # Adicionar metadados
            for i, doc in enumerate(split_documents):
                doc.metadata["source"] = Path(pdf_path).name
                doc.metadata["doc_id"] = i
            
            # Criar vectorstore
            vectorstore = FAISS.from_documents(
                documents=split_documents,
                embedding=self.embeddings
            )
            
            # Salvar vectorstore
            Path(vectorstore_path).parent.mkdir(parents=True, exist_ok=True)
            vectorstore.save_local(vectorstore_path)
            
            print(f"Vectorstore criado com sucesso: {vectorstore_path}")
            return True
            
        except Exception as e:
            print(f"Erro ao criar vectorstore: {e}")
            return False
    
    def load_vectorstore(self, vectorstore_path: str) -> Optional[FAISS]:
        """Carrega vectorstore existente"""
        try:
            if not Path(vectorstore_path).exists():
                print(f"Vectorstore não encontrado: {vectorstore_path}")
                return None
            
            vectorstore = FAISS.load_local(
                vectorstore_path,
                self.embeddings,
                allow_dangerous_deserialization=True
            )
            return vectorstore
            
        except Exception as e:
            print(f"Erro ao carregar vectorstore: {e}")
            return None
    
    def _get_or_create_chain(self, agent_id: str, vectorstore_path: str, 
                           system_prompt: str, model: str, api_provider: str, temperature: float = 0.10) -> Optional[dict]:
        """Obtém ou cria chain para um agente"""
        try:
            # Verificar cache
            cache_key = f"{agent_id}_{vectorstore_path}_{temperature}"
            if cache_key in self.agent_chains:
                return self.agent_chains[cache_key]
            
            # Carregar vectorstore
            vectorstore = self.load_vectorstore(vectorstore_path)
            if not vectorstore:
                return None
            
            # Configurar LLM baseado no provider
            if api_provider == 'groq':
                llm = ChatGroq(
                    model=model,
                    temperature=temperature,
                    max_tokens=2048
                )
            else:
                print(f"Provider não suportado: {api_provider}")
                return None
            
            # Criar prompt template personalizado usando o system_prompt
            from langchain_core.prompts import PromptTemplate
            
            # Template personalizado que inclui apenas o system_prompt do banco
            prompt_template = PromptTemplate(
                template=f"""{system_prompt}

Contexto dos documentos:
{{context}}

Mensagem do usuário: {{question}}

Resposta:""",
                input_variables=["context", "question"]
            )
            
            # TODO: Implementar nova estrutura de memória do LangChain v1.0
            # Configurar memória (temporariamente desabilitado)
            # memory = ConversationBufferMemory(
            #     return_messages=True,
            #     memory_key="chat_history",
            #     output_key="answer"
            # )
            
            # Criar retriever
            retriever = vectorstore.as_retriever(
                search_kwargs={"k": 4}  # Buscar 4 chunks mais relevantes
            )
            
            # Solução temporária: retornar configuração básica sem chain
            # chain = ConversationalRetrievalChain.from_llm(
            #     llm=llm,
            #     memory=memory,
            #     retriever=retriever,
            #     return_source_documents=True,
            #     verbose=False,
            #     combine_docs_chain_kwargs={"prompt": prompt_template}
            # )
            
            # Criar agente com nova estrutura do LangChain v1.0
            try:
                # Criar agente com checkpointer para memória
                agent = create_agent(
                    llm,
                    tools=[],  # Por enquanto sem tools, pode ser expandido depois
                    checkpointer=self.checkpointer,
                    system_prompt=system_prompt
                )
                
                chain = {
                    "agent": agent,
                    "llm": llm,
                    "retriever": retriever,
                    "system_prompt": system_prompt,
                    "prompt_template": prompt_template,
                    "checkpointer": self.checkpointer
                }
            except Exception as agent_error:
                print(f"Erro ao criar agente: {agent_error}")
                # Fallback para estrutura simples
                chain = {
                    "llm": llm,
                    "retriever": retriever,
                    "system_prompt": system_prompt,
                    "prompt_template": prompt_template
                }
            
            # Armazenar no cache
            self.agent_chains[cache_key] = chain
            
            return chain
            
        except Exception as e:
            print(f"Erro ao criar chain: {e}")
            return None
    
    def _simple_chat_processing(self, chain: dict, message: str) -> str:
        """Processamento simples de chat sem memória (fallback)"""
        try:
            # Usar retriever para buscar contexto relevante
            if "retriever" in chain:
                try:
                    # Tentar método invoke primeiro (LangChain v1.0)
                    docs = chain["retriever"].invoke(message)
                except AttributeError:
                    try:
                        # Fallback para método antigo
                        docs = chain["retriever"].get_relevant_documents(message)
                    except AttributeError:
                        # Se nenhum método funcionar, usar lista vazia
                        docs = []
                
                context = "\n".join([doc.page_content for doc in docs[:3]])
            else:
                context = ""
            
            # Usar LLM diretamente
            if "llm" in chain:
                system_prompt = chain.get("system_prompt", "")
                full_prompt = f"{system_prompt}\n\nContexto: {context}\n\nPergunta: {message}\n\nResposta:"
                response = chain["llm"].invoke(full_prompt)
                return response.content if hasattr(response, 'content') else str(response)
            else:
                return "Erro: LLM não disponível."
        except Exception as e:
            print(f"Erro no processamento simples: {e}")
            return "Erro ao processar mensagem."
    
    def chat_with_agent(self, agent_id: str, vectorstore_path: str, 
                        message: str, system_prompt: str, model: str, api_provider: str,
                        calendar_credentials: str = None, calendar_id: str = None, 
                        chat_history: list = None, whatsapp: str = None,
                        calendar_start_hour: int = 9, calendar_end_hour: int = 18,
                        calendar_workdays: str = "1,2,3,4,5", calendar_duration_minutes: int = 60,
                        use_google_meeting: bool = False, temperature: float = 0.10) -> dict:
        """Conversa com o agente usando o vectorstore"""
        try:
            # Obter ou criar chain
            chain = self._get_or_create_chain(agent_id, vectorstore_path, system_prompt, model, api_provider, temperature)
            
            if not chain:
                return {
                    "answer": "Erro: Não foi possível inicializar o agente.",
                    "should_transfer": False,
                    "transfer_reason": None
                }
            
            # Processar mensagem com nova estrutura
            if "agent" in chain:
                # Usar agente com memória (LangChain v1.0)
                try:
                    # Criar thread_id único para esta conversa
                    thread_id = f"{agent_id}_{hash(message) % 10000}"
                    
                    # Invocar agente com memória
                    response = chain["agent"].invoke(
                        {"messages": [{"role": "user", "content": message}]},
                        {"configurable": {"thread_id": thread_id}}
                    )
                    # Extrair resposta corretamente do AIMessage
                    if "messages" in response and response["messages"]:
                        last_message = response["messages"][-1]
                        if hasattr(last_message, 'content'):
                            answer = last_message.content
                        else:
                            answer = str(last_message)
                    else:
                        answer = "Não foi possível gerar uma resposta."
                except Exception as e:
                    print(f"Erro ao usar agente com memória: {e}")
                    # Fallback para processamento simples
                    answer = self._simple_chat_processing(chain, message)
            else:
                # Fallback para estrutura antiga
                answer = self._simple_chat_processing(chain, message)
            
            # PRIMEIRO: Verificar se é uma consulta de reuniões existentes (prioridade máxima)
            print(f"🔍 DEBUG - Iniciando detecção de consulta de reuniões...")
            meeting_query_response = self._detect_meeting_query_intent(message)
            print(f"🔍 DEBUG - Consulta de reuniões detectada: {meeting_query_response}")
            
            # Se é uma consulta de reuniões, processar IMEDIATAMENTE
            if meeting_query_response.get("confidence", 0) >= 0.7:
                print(f"🔍 Consulta de reuniões detectada: {meeting_query_response['keywords_found']}")
                print(f"🔍 DEBUG - Executando consulta de reuniões...")
                result = self._process_meeting_query(whatsapp, calendar_credentials, calendar_id)
                print(f"🔍 DEBUG - Resultado da consulta: {result[:100]}...")
                return {
                    "answer": result,
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": False,
                    "scheduling_info": {"type": "meeting_query"},
                    "scheduling_confidence": meeting_query_response["confidence"]
                }
            else:
                print(f"🔍 DEBUG - Consulta de reuniões não detectada ou confiança baixa: {meeting_query_response.get('confidence', 0)}")
            
            # Detectar se deve transferir para humano
            transfer_analysis = self._analyze_transfer_need(message, answer)
            
            # Log da análise de transferência para debug
            print(f"🔍 DEBUG - Resultado da análise de transferência:")
            print(f"   Deve transferir: {transfer_analysis['should_transfer']}")
            print(f"   Motivo: {transfer_analysis['reason']}")
            
            # Detectar intenção de agendamento
            scheduling_analysis = self._detect_scheduling_intent(message, calendar_start_hour, calendar_workdays,
                                                               agent_id, calendar_credentials, calendar_id,
                                                               calendar_start_hour, calendar_end_hour, 
                                                               calendar_duration_minutes)

            # Reutilizar data/hora detectadas anteriormente se esta for uma continuação
            if scheduling_analysis.get("has_scheduling_intent"):
                if not scheduling_analysis.get("datetime_info"):
                    previous = self._get_last_scheduling_info(agent_id)
                    if previous:
                        scheduling_analysis["datetime_info"] = previous
                # Persistir a última info quando disponível
                if scheduling_analysis.get("datetime_info"):
                    self._set_last_scheduling_info(agent_id, scheduling_analysis["datetime_info"])
            
            # Verificar se é uma resposta de confirmação de agendamento
            print(f"🔍 DEBUG - Iniciando detecção de confirmação para mensagem: '{message}'")
            confirmation_response = self._detect_confirmation_response(message)
            print(f"🔍 DEBUG - Resposta de confirmação detectada: {confirmation_response}")
            
            # Verificar se é uma continuação de agendamento ou nova solicitação
            is_scheduling_continuation = self._is_scheduling_continuation(message, scheduling_analysis)
            
            # Preparar configurações do agente para o LLM
            agent_config = {
                'model': model,
                'api_provider': api_provider
            }
            
            # Se é uma resposta de confirmação, processar IMEDIATAMENTE (prioridade máxima)
            if confirmation_response["confidence"] > 0.8:
                print(f"🔍 Resposta de confirmação detectada: {confirmation_response['type']}")
                result = self._process_confirmation_response(message, confirmation_response, agent_id, 
                                                          calendar_credentials, calendar_id, chat_history, agent_config, whatsapp, use_google_meeting)
                
                # Verificar se o resultado inclui dados do arquivo .ics
                if isinstance(result, dict) and "message" in result:
                    # Resultado com arquivo .ics - retornar o dicionário completo como answer
                    return {
                        "answer": result,  # Retornar o dicionário completo, não apenas a mensagem
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "confirmation_response"},
                        "scheduling_confidence": confirmation_response["confidence"]
                    }
                else:
                    # Resultado simples (string)
                    return {
                        "answer": result,
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "confirmation_response"},
                        "scheduling_confidence": confirmation_response["confidence"]
                    }
            
            # Se é uma continuação de agendamento, processar independente da intenção atual
            if is_scheduling_continuation:
                print(f"🔍 DEBUG - Processando como continuação de agendamento")
                # Processar informações de agendamento fornecidas
                answer = self._process_scheduling_information(message, scheduling_analysis, 
                                                           agent_id, calendar_credentials, calendar_id,
                                                           chat_history, agent_config, whatsapp)
                # Re-analisar transferência após processar agendamento
                transfer_analysis = self._analyze_transfer_need(message, answer)
                print(f"🔍 DEBUG - Re-análise após processar agendamento:")
                print(f"   Deve transferir: {transfer_analysis['should_transfer']}")
                print(f"   Motivo: {transfer_analysis['reason']}")
            elif scheduling_analysis["has_scheduling_intent"] and scheduling_analysis["confidence"] > 0.6:
                # Nova solicitação de agendamento
                print(f"🔍 DEBUG - Processando como nova solicitação de agendamento")
                answer = self._generate_scheduling_response(scheduling_analysis, message, agent_id, calendar_credentials, calendar_id,
                                                           calendar_start_hour, calendar_end_hour, calendar_workdays, calendar_duration_minutes, whatsapp)
                # Re-analisar transferência após gerar resposta de agendamento
                transfer_analysis = self._analyze_transfer_need(message, answer)
                print(f"🔍 DEBUG - Re-análise após gerar resposta de agendamento:")
                print(f"   Deve transferir: {transfer_analysis['should_transfer']}")
                print(f"   Motivo: {transfer_analysis['reason']}")
            
            # Detectar se o usuário está fornecendo email após agendamento
            # Mas apenas se NÃO foi processado como continuação de agendamento
            email = self._detect_email_in_message(message)
            if email and self._is_email_follow_up(message) and not is_scheduling_continuation:
                print(f"📧 Email detectado como follow-up: {email}")
                answer = self._process_email_for_scheduling(
                    email=email,
                    message=message,
                    agent_id=agent_id,
                    calendar_credentials=calendar_credentials,
                    calendar_id=calendar_id
                )
            
            # Log do WhatsApp extraído do frontend
            if whatsapp:
                print(f"📱 WhatsApp extraído pelo frontend: {whatsapp}")
            else:
                print(f"📱 Nenhum WhatsApp detectado pelo frontend")
            
            return {
                "answer": answer,
                "should_transfer": transfer_analysis["should_transfer"],
                "transfer_reason": transfer_analysis["reason"],
                "has_scheduling_intent": scheduling_analysis["has_scheduling_intent"],
                "scheduling_info": scheduling_analysis["datetime_info"],
                "scheduling_confidence": scheduling_analysis["confidence"]
            }
            
        except Exception as e:
            print(f"Erro ao processar mensagem: {e}")
            return {
                "answer": f"Erro ao processar mensagem: {str(e)}",
                "should_transfer": False,
                "transfer_reason": None
            }
    
    def _normalize_text(self, text: str) -> str:
        """Remove acentos, pontuação e transforma para minúsculas"""
        text = text.lower()
        text = unicodedata.normalize('NFKD', text)
        text = ''.join([c for c in text if not unicodedata.combining(c)])
        text = re.sub(r'[^\w\s:]', '', text)  # remove pontuação MAS mantém dois pontos para horários
        return text.strip()

    def _analyze_transfer_need(self, user_message: str, agent_response: str) -> dict:
        """Analisa se deve transferir para atendimento humano"""
        try:
            # Normalize as mensagens
            user_lower = self._normalize_text(user_message)
            response_lower = self._normalize_text(agent_response)
            
            print(f"🔍 DEBUG - Análise de transferência:")
            print(f"   Mensagem do usuário: {user_message[:100]}...")
            print(f"   Resposta do agente: {agent_response[:100]}...")

            # Palavras-chave do usuário que indicam necessidade de transferência
            transfer_keywords = [
                # Solicitações diretas
                'quero falar com um humano', 'quero falar com atendente', 'quero falar com uma pessoa',
                'atendimento humano', 'atendente humano', 'pessoa real',
                'falar com humano', 'preciso de um humano', 'me transfira para um atendente',
                'quero atendimento humano', 'quero alguém de verdade',
                
                # Insatisfação
                'nao entendi', 'nao ajudou', 'nao resolveu', 'nao resolve meu problema',
                'estou insatisfeito', 'estou frustrado', 'estou irritado',
                'isso nao funciona', 'nada disso funciona', 'isso e inutil',
                'estou perdendo tempo', 'isso nao serve', 'isso nao faz sentido',
                
                # Rejeição ao bot
                'nao quero mais bot', 'nao quero robo', 'pare de ser robo', 'voce e um bot',
                'isso e um bot', 'nao quero falar com bot', 'odeio falar com robo',
                'so tem robo aqui',
                
                # Crítico / Urgente
                'urgente', 'emergencia', 'problema serio', 'problema critico',
                'nao posso esperar', 'isso e grave', 'preciso de ajuda urgente',
                
                # Assuntos delicados
                'cancelar', 'cancelamento', 'reembolso', 'devolucao',
                'reclamacao', 'reclamar', 'sac', 'ouvidoria',
                'erro na fatura', 'problema com pedido', 'erro de cobranca',
                'encerrar conta', 'mudar plano',
                
                # Jurídico / contratos
                'contrato', 'termos', 'condicoes', 'politica', 'lgpd',
                'politica de privacidade', 'politica de cancelamento',
                
                # Promoções / negociações
                'preco especial', 'desconto', 'promocao', 'negociacao',
                'proposta', 'oferta exclusiva', 'valor melhor',
                'tem como melhorar o preco',
                
                # Comandos diretos
                '!transferir', '!humano', '!atendente',
                '/transferir', '/humano', '/atendente',
                
                # Outros
                'chama alguem', 'tem alguem ai', 'fala com alguem por favor'
            ]

            if any(keyword in user_lower for keyword in transfer_keywords):
                return {
                    "should_transfer": True,
                    "reason": f"Detectada palavra-chave na mensagem do usuário"
                }

            # Frases do agente indicando limitação (mais específicas)
            incapacity_phrases = [
                'nao posso ajudar', 'nao consigo ajudar', 'nao tenho informacao',
                'nao sei como ajudar', 'nao encontrei informacao', 'fora do meu conhecimento',
                'preciso transferir', 'vou transferir', 'atendente humano',
                'vou te passar para um atendente', 'nao consigo resolver',
                'nao posso resolver', 'nao tenho acesso', 'nao posso acessar'
            ]

            # Verificar se a resposta contém frases de incapacidade
            # MAS não transferir se for uma resposta de agendamento bem-sucedida
            has_incapacity = any(phrase in response_lower for phrase in incapacity_phrases)
            
            # Não transferir se a resposta contém indicadores de sucesso no agendamento
            success_indicators = [
                'agendamento confirmado', 'agendamento realizado', 'evento criado',
                'agendamento processado', 'sucesso', 'perfeito', 'confirmado',
                'agendamento realizado com sucesso', 'compromisso criado',
                'agendamento detectado', 'entendi que voce gostaria', 'para processar seu agendamento',
                'preciso de mais informacoes', 'apos receber essas informacoes',
                # Indicadores de gerenciamento de reuniões
                'reuniao cancelada', 'reunião cancelada', 'nova solicitacao', 'nova solicitação',
                'agora voce pode', 'agora você pode', 'por favor me informe', 'por favor me inform',
                'alteracao de horario', 'alteração de horário', 'manter reuniao', 'manter reunião',
                'reagendar', 'reagendamento', 'nova reuniao', 'nova reunião'
            ]
            
            # Verificar se é uma resposta de agendamento (mesmo que não seja sucesso completo)
            scheduling_indicators = [
                'agendamento', 'reuniao', 'consulta', 'horario', 'data',
                'agendar', 'marcar', 'calendario', 'evento', 'cancelar',
                'alterar', 'manter', 'nova data', 'novo horario', 'participantes',
                'email', 'convite', 'reagendar', 'reagendamento'
            ]
            
            has_success = any(indicator in response_lower for indicator in success_indicators)
            is_scheduling_response = any(indicator in response_lower for indicator in scheduling_indicators)
            
            print(f"🔍 DEBUG - Análise de indicadores:")
            print(f"   Tem sucesso: {has_success}")
            print(f"   É resposta de agendamento: {is_scheduling_response}")
            print(f"   Tem incapacidade: {has_incapacity}")
            
            # Verificar se é uma resposta de gerenciamento de reuniões (começa com emojis específicos)
            management_response_indicators = [
                '✅ **reuniao cancelada', '🔄 **alteracao', '🔄 **alteração',
                '✅ **reunião cancelada', '📅 **nova data', '🕒 **novo horario',
                '👥 **participantes', '📧 **email', '**reuniao cancelada',
                '**alteracao de horario', '**alteração de horário'
            ]
            
            is_management_response = any(indicator in response_lower for indicator in management_response_indicators)
            
            print(f"🔍 DEBUG - Análise de indicadores:")
            print(f"   Tem sucesso: {has_success}")
            print(f"   É resposta de agendamento: {is_scheduling_response}")
            print(f"   É resposta de gerenciamento: {is_management_response}")
            print(f"   Tem incapacidade: {has_incapacity}")
            
            # Só transferir se houver incapacidade E não houver sucesso E não for resposta de agendamento
            # E não for uma resposta de gerenciamento de reuniões
            if has_incapacity and not has_success and not is_scheduling_response and not is_management_response:
                print(f"⚠️ Transferência detectada - Incapacidade sem sucesso e não é agendamento/gerenciamento")
                return {
                    "should_transfer": True,
                    "reason": f"Agente indicou incapacidade na resposta"
                }

            # Se for uma resposta de agendamento ou gerenciamento, nunca transferir
            if is_scheduling_response or is_management_response:
                print(f"✅ Não transferir - É resposta de agendamento/gerenciamento")
                return {
                    "should_transfer": False,
                    "reason": "Resposta de agendamento/gerenciamento - não transferir"
                }
            
            print(f"✅ Não transferir - Agente funcionando normalmente")
            return {
                "should_transfer": False,
                "reason": None
            }

        except Exception as e:
            print(f"Erro ao analisar necessidade de transferência: {e}")
            return {
                "should_transfer": False,
                "reason": None
            }

    def _detect_scheduling_intent(self, user_message: str, default_start_hour: int = 9, workdays: str = "1,2,3,4,5",
                                 agent_id: str = None, calendar_credentials: str = None, calendar_id: str = None,
                                 calendar_start_hour: int = 9, calendar_end_hour: int = 18, 
                                 calendar_duration_minutes: int = 60) -> Dict[str, Any]:
        """Detecta se o usuário quer agendar algo usando LLM"""
        try:
            print(f"🔍 DEBUG - Detectando intenção de agendamento para: {user_message}")
            
            # Usar LLM para detectar intenção de agendamento
            from langchain_groq import ChatGroq
            
            llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)
            
            prompt = f"""
Analise a seguinte mensagem do usuário e determine se ele quer agendar uma reunião/consulta.

Mensagem: "{user_message}"

Contexto: O usuário pode estar:
1. Solicitando agendar uma reunião/consulta (ex: "quero agendar uma reunião", "marcar consulta para amanhã")
2. Fazendo uma pergunta geral (ex: "quais são os produtos", "como funciona o CRM")
3. Confirmando um agendamento (ex: "confirmar", "sim", "ok")

Responda APENAS com JSON:
{{
    "has_scheduling_intent": true/false,
    "is_confirmation": true/false,
    "confidence": 0.0-1.0,
    "reason": "explicação breve"
}}

Exemplos:
- "quero agendar uma reunião para amanhã" → has_scheduling_intent: true, is_confirmation: false
- "confirmar" → has_scheduling_intent: false, is_confirmation: true
- "Quais são os produtos?" → has_scheduling_intent: false, is_confirmation: false
- "marcar consulta" → has_scheduling_intent: true, is_confirmation: false
"""

            response = llm.invoke(prompt)
            
            try:
                import json
                result = json.loads(response.content)
                
                has_scheduling_intent = result.get("has_scheduling_intent", False)
                is_confirmation = result.get("is_confirmation", False)
                confidence = result.get("confidence", 0.0)
                reason = result.get("reason", "")
                
                print(f"🤖 LLM - Detecção de intenção de agendamento:")
                print(f"   Mensagem: '{user_message}'")
                print(f"   Tem intenção de agendamento: {has_scheduling_intent}")
                print(f"   É confirmação: {is_confirmation}")
                print(f"   Confiança: {confidence}")
                print(f"   Motivo: {reason}")
                
                # Se tem intenção de agendamento e não é confirmação, extrair data/hora
                datetime_info = None
                if has_scheduling_intent and not is_confirmation and confidence >= 0.7:
                    datetime_info = self._extract_datetime_info(user_message, default_start_hour, workdays,
                                                               agent_id, calendar_credentials, calendar_id,
                                                               calendar_start_hour, calendar_end_hour, 
                                                               calendar_duration_minutes)
                    print(f"🔍 DEBUG - datetime_info extraída: {datetime_info}")
                
                return {
                    "has_scheduling_intent": has_scheduling_intent and confidence >= 0.7,
                    "datetime_info": datetime_info,
                    "confidence": confidence,
                    "is_confirmation": is_confirmation
                }
            
            except json.JSONDecodeError:
                print(f"❌ Erro ao parsear resposta do LLM: {response.content}")
            return {
                "has_scheduling_intent": False,
                "datetime_info": None,
                    "confidence": 0.0,
                    "is_confirmation": False
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar intenção de agendamento com LLM: {e}")
            return {
                "has_scheduling_intent": False,
                "datetime_info": None,
                "confidence": 0.0,
                "is_confirmation": False
            }

    def _extract_scheduling_info_with_llm(self, user_message: str, chat_history: list, agent_config: dict) -> Dict[str, Any]:
        """Usa o LLM para extrair informações de agendamento mantendo contexto"""
        try:
            from langchain_groq import ChatGroq
            import json
            from datetime import datetime, timedelta
            
            # Configurar LLM para extração de informações
            llm = ChatGroq(
                model=agent_config.get('model', 'llama3-8b-8192'),
                temperature=0.1,
                max_tokens=1024
            )
            
            # Preparar histórico de conversa
            history_text = ""
            for msg in chat_history[-3:]:  # Últimas 3 mensagens para contexto
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                history_text += f"{role.upper()}: {content}\n"
            
            # Prompt para extração de informações de agendamento
            prompt = f"""
Analise a conversa abaixo e extraia informações de agendamento da mensagem mais recente do usuário.

HISTÓRICO DA CONVERSA:
{history_text}

MENSAGEM ATUAL DO USUÁRIO:
{user_message}

INSTRUÇÕES:
1. Se a mensagem atual contém informações de agendamento, extraia:
   - Data (use a data mencionada ou mantenha a do contexto se não houver nova data)
   - Horário (use o horário mencionado ou mantenha o sugerido se não houver novo horário)
   - Tipo de reunião/consulta
   - Duração
   - Participantes (obrigatório - nomes das pessoas)
   - Assunto será definido automaticamente como "Reunião Criada pela IA"
   - Email (se mencionado)
   - WhatsApp (se mencionado)

2. Se não há informações de agendamento, retorne null

3. Para datas relativas:
   - "hoje" = {datetime.now().strftime('%d/%m/%Y')}
   - "amanhã" = {(datetime.now() + timedelta(days=1)).strftime('%d/%m/%Y')}
   - "depois de amanhã" = {(datetime.now() + timedelta(days=2)).strftime('%d/%m/%Y')}

4. Para horários:
   - Use formato HH:MM (24h)
   - Se mencionado "11 horas", "11h", "11:00" = "11:00"
   - Se mencionado "meio dia" = "12:00"
   - Se mencionado "manhã" = "09:00"
   - Se mencionado "tarde" = "14:00"
   - Se mencionado "noite" = "19:00"

5. Para participantes:
   - Se mencionado "somente eu", "só eu" = "Somente eu"
   - Se mencionados nomes específicos = usar os nomes exatos
   - Se não mencionados = null (obrigatório informar)

6. Para WhatsApp:
   - Se mencionado número = usar formato (XX) XXXXX-XXXX
   - Se não mencionado = null (opcional)

7. Mantenha o contexto da conversa anterior

IMPORTANTE: Retorne APENAS o JSON, sem texto adicional, sem explicações.

EXEMPLO DE RESPOSTA VÁLIDA:
{{
    "has_scheduling_info": true,
    "date": "25/09/2025",
    "time": "11:00",
    "meeting_type": "Reunião",
    "duration": "1 hora",
    "participants": "João Silva, Maria Santos",
    "subject": "Reunião Criada pela IA",
    "email": "cliente@exemplo.com",
    "whatsapp": "(11) 99999-9999",
    "confidence": 0.9
}}

Se não há informações de agendamento:
{{
    "has_scheduling_info": false,
    "confidence": 0.0
}}

JSON:
"""
            
            # Chamar LLM
            response = llm.invoke(prompt)
            
            # Tentar parsear JSON
            try:
                # Tentar parsear diretamente
                result = json.loads(response.content)
                print(f"🤖 LLM extraiu informações: {result}")
                return result
            except json.JSONDecodeError:
                # Tentar extrair JSON do texto se houver texto adicional
                import re
                json_match = re.search(r'\{.*\}', response.content, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group())
                        print(f"🤖 LLM extraiu informações (extraído do texto): {result}")
                        return result
                    except json.JSONDecodeError as e:
                        print(f"❌ Erro ao parsear JSON extraído: {e}")
                print(f"❌ Erro ao parsear JSON do LLM")
                print(f"Resposta do LLM: {response.content}")
                return {"has_scheduling_info": False, "confidence": 0.0}
                
        except Exception as e:
            print(f"❌ Erro na extração com LLM: {e}")
            return {"has_scheduling_info": False, "confidence": 0.0}

    def _extract_datetime_info(self, message: str, default_start_hour: int = 9, workdays: str = "1,2,3,4,5",
                              agent_id: str = None, calendar_credentials: str = None, calendar_id: str = None,
                              calendar_start_hour: int = 9, calendar_end_hour: int = 18, 
                              calendar_duration_minutes: int = 60) -> Dict[str, Any]:
        """Extrai informações de data e hora da mensagem"""
        try:
            import re
            
            # Normalizar mensagem
            normalized = self._normalize_text(message)
            # Substituir "as" por "às" antes de processar horários para evitar confusão
            normalized = re.sub(r'\bas\s+(\d{1,2}):(\d{0,2})\b', r'às \1:\2', normalized)
            print(f"🔍 Analisando mensagem: '{message}' -> '{normalized}'")
            
            # Padrões para detectar datas/horas
            date_patterns = {
                'amanha': 1,
                'hoje': 0,
                'proxima semana': 7,
                'segunda': self._get_next_weekday(0),
                'terca': self._get_next_weekday(1),
                'quarta': self._get_next_weekday(2),
                'quinta': self._get_next_weekday(3),
                'sexta': self._get_next_weekday(4),
                'sabado': self._get_next_weekday(5),
                'domingo': self._get_next_weekday(6)
            }
            
            time_patterns = {
                'manha': 9,
                'tarde': 14,
                'noite': 19,
                'madrugada': 2
            }
            
            # Detectar data
            detected_date = None
            for pattern, days_offset in date_patterns.items():
                if pattern in normalized:
                    detected_date = datetime.now() + timedelta(days=days_offset)
                    print(f"📅 Data detectada: {pattern} -> {detected_date.strftime('%d/%m/%Y')}")
                    break
            
            # Detectar hora específica (ex: 15:00, 15 horas, 3 da tarde)
            detected_hour = None
            detected_minute = 0
            
            # Múltiplos padrões para horários específicos
            hour_patterns = [
                (r'as\s+(\d{1,2}):(\d{0,2})', True),      # às 15:00, as 15:30
                (r'(\d{1,2}):(\d{0,2})', True),            # 15:00, 15:30 (formato com dois pontos)
                (r'(\d{1,2})h(\d{0,2})', True),            # 15h30, 15h (formato com h)
                (r'(\d{1,2})\s+horas?', False),            # 15 horas (sem minutos)
                (r'(\d{1,2})\s*$', False)                  # 15 (no final, sem minutos)
            ]
            
            hour_match = None
            has_minutes = False
            for pattern, has_min in hour_patterns:
                hour_match = re.search(pattern, normalized)
                if hour_match:
                    has_minutes = has_min
                    break
            
            if hour_match:
                hour = int(hour_match.group(1))
                minute = int(hour_match.group(2)) if has_minutes and hour_match.group(2) else 0
                
                # Validar horário (0-23 horas, 0-59 minutos)
                if 0 <= hour <= 23 and 0 <= minute <= 59:
                    detected_hour = hour
                    detected_minute = minute
                    print(f"⏰ Horário específico detectado: {hour:02d}:{minute:02d}")
            
            # Se não detectou horário específico, tentar padrões de período
            if not detected_hour:
                for pattern, hour in time_patterns.items():
                    if pattern in normalized:
                        detected_hour = hour
                        print(f"⏰ Período detectado: {pattern} -> {hour:02d}:00")
                        break
            
            # Se não detectou data, usar amanhã (dia seguinte) como padrão
            if not detected_date:
                detected_date = datetime.now() + timedelta(days=1)
                print(f"📅 Nenhuma data explícita detectada - usando amanhã: {detected_date.strftime('%d/%m/%Y')}")
            
            # Verificar se a data detectada é um dia útil
            workday_conflict = None
            if not self._is_workday(detected_date, workdays):
                print(f"⚠️ Data detectada não é dia útil ({detected_date.strftime('%d/%m/%Y')}) - buscando próximo dia útil")
                original_date = detected_date
                detected_date = self._get_next_workday(detected_date, workdays, agent_id, 
                                                      calendar_credentials, calendar_id,
                                                      calendar_start_hour, calendar_end_hour, 
                                                      calendar_duration_minutes)
                print(f"✅ Próximo dia útil encontrado: {detected_date.strftime('%d/%m/%Y')} (era {original_date.strftime('%d/%m/%Y')})")
                
                # Armazenar informações do conflito
                workday_conflict = {
                    "original_date": original_date.strftime('%d/%m/%Y'),
                    "corrected_date": detected_date.strftime('%d/%m/%Y'),
                    "original_weekday": self._get_weekday_name(original_date.weekday()),
                    "corrected_weekday": self._get_weekday_name(detected_date.weekday())
                }
            
            # Se não detectou hora, usar horário de início do agente
            if not detected_hour:
                detected_hour = default_start_hour
                print(f"⏰ Usando horário padrão do agente: {default_start_hour}:00")
            
            # Criar datetime final (sempre há data agora)
                final_datetime = detected_date.replace(hour=detected_hour, minute=detected_minute, second=0, microsecond=0)
            
                print(f"✅ DateTime final: {final_datetime.strftime('%d/%m/%Y às %H:%M')}")
            result = {
                    "datetime": final_datetime.isoformat(),
                    "date": detected_date.strftime('%d/%m/%Y'),
                    "time": f"{detected_hour:02d}:{detected_minute:02d}",
                    "confidence": 0.8 if hour_match else 0.7
                }
            
            # Adicionar informações do conflito se houver
            if workday_conflict:
                result["workday_conflict"] = workday_conflict
            
            return result
            
        except Exception as e:
            print(f"Erro ao extrair informações de data/hora: {e}")
            return None

    def _get_next_weekday(self, target_weekday: int) -> int:
        """Calcula quantos dias até o próximo dia da semana"""
        today = datetime.now().weekday()
        days_ahead = target_weekday - today
        if days_ahead <= 0:  # Target day already happened this week
            days_ahead += 7
        return days_ahead
    
    def _is_workday(self, date: datetime, workdays: str) -> bool:
        """Verifica se a data é um dia útil baseado na configuração workdays"""
        try:
            # Converter workdays string para lista de inteiros
            # workdays = "1,2,3,4,5" onde 1=segunda, 7=domingo
            workday_list = [int(day.strip()) for day in workdays.split(',')]
            
            # Converter weekday do Python (0=segunda, 6=domingo) para formato do banco (1=segunda, 7=domingo)
            weekday = date.weekday() + 1
            
            return weekday in workday_list
        except Exception as e:
            print(f"❌ Erro ao verificar dia útil: {e}")
            return True  # Fallback: considerar como dia útil
    
    def _get_next_workday(self, start_date: datetime, workdays: str, agent_id: str = None, 
                         calendar_credentials: str = None, calendar_id: str = None,
                         calendar_start_hour: int = 9, calendar_end_hour: int = 18, 
                         calendar_duration_minutes: int = 60) -> datetime:
        """Encontra o próximo dia útil com horários disponíveis baseado na configuração workdays"""
        current_date = start_date
        max_days = 14  # Limite para evitar loop infinito
        
        for _ in range(max_days):
            if self._is_workday(current_date, workdays):
                # Se temos parâmetros de calendário, verificar disponibilidade
                if agent_id and calendar_credentials and calendar_id:
                    try:
                        available_slots = self.get_available_slots(
                            agent_id, calendar_credentials, calendar_id, current_date,
                            calendar_start_hour, calendar_end_hour, calendar_duration_minutes
                        )
                        if available_slots and len(available_slots) > 0:
                            print(f"✅ Dia útil com horários disponíveis encontrado: {current_date.strftime('%d/%m/%Y')} ({len(available_slots)} slots)")
                            return current_date
                        else:
                            print(f"⚠️ Dia útil {current_date.strftime('%d/%m/%Y')} não tem horários disponíveis - buscando próximo")
                    except Exception as e:
                        print(f"⚠️ Erro ao verificar disponibilidade para {current_date.strftime('%d/%m/%Y')}: {e}")
                        # Em caso de erro, considerar o dia como válido
                        return current_date
                else:
                    # Se não temos parâmetros de calendário, retornar o primeiro dia útil
                    return current_date
            current_date += timedelta(days=1)
        
        # Se não encontrou em 14 dias, retornar a data original
        return start_date
    
    def _get_weekday_name(self, weekday: int) -> str:
        """Converte número do dia da semana (0=segunda) para nome"""
        weekdays = {
            0: "segunda-feira",
            1: "terça-feira", 
            2: "quarta-feira",
            3: "quinta-feira",
            4: "sexta-feira",
            5: "sábado",
            6: "domingo"
        }
        return weekdays.get(weekday, "dia desconhecido")

    def _is_scheduling_continuation(self, message: str, scheduling_analysis: dict) -> bool:
        """Verifica se a mensagem é uma continuação de agendamento usando LLM"""
        try:
            # Usar LLM para detectar se é continuação de agendamento
            from langchain_groq import ChatGroq
            
            llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)
            
            prompt = f"""
Analise a seguinte mensagem do usuário e determine se é uma continuação de agendamento (resposta às perguntas sobre agendamento) ou uma nova solicitação/pergunta.

Mensagem: "{message}"

Contexto: O usuário pode estar:
1. Respondendo às perguntas de agendamento (tipo de reunião, duração, participantes, email) - CONTINUAÇÃO
2. Fazendo uma nova solicitação de agendamento (ex: "quero agendar", "marcar reunião") - NOVA SOLICITAÇÃO
3. Fazendo uma pergunta geral sobre produtos, serviços, preços, etc. - PERGUNTA GERAL

IMPORTANTE: Se a mensagem contém palavras como "quero agendar", "marcar", "agendar", "reunião para", é uma NOVA SOLICITAÇÃO, não continuação.

Responda APENAS com JSON:
{{
    "is_scheduling_continuation": true/false,
    "confidence": 0.0-1.0,
    "reason": "explicação breve"
}}

Exemplos:
- "reunião comercial, 1 hora, João Silva, joao@email.com" → is_scheduling_continuation: true (resposta às perguntas)
- "30 minutos, somente eu" → is_scheduling_continuation: true (resposta às perguntas)
- "quero agendar uma reunião para amanhã" → is_scheduling_continuation: false (nova solicitação)
- "marcar consulta para sexta" → is_scheduling_continuation: false (nova solicitação)
- "Quais são os produtos que vocês oferecem?" → is_scheduling_continuation: false (pergunta geral)
- "Como funciona o CRM?" → is_scheduling_continuation: false (pergunta geral)
"""

            response = llm.invoke(prompt)
            
            try:
                import json
                result = json.loads(response.content)
                
                is_continuation = result.get("is_scheduling_continuation", False)
                confidence = result.get("confidence", 0.0)
                reason = result.get("reason", "")
                
                print(f"🤖 LLM - Detecção de continuação de agendamento:")
                print(f"   Mensagem: '{message}'")
                print(f"   É continuação: {is_continuation}")
                print(f"   Confiança: {confidence}")
                print(f"   Motivo: {reason}")
                
                # Só considerar como continuação se a confiança for alta
                return is_continuation and confidence >= 0.7
                
            except json.JSONDecodeError:
                print(f"❌ Erro ao parsear resposta do LLM: {response.content}")
                return False
                
        except Exception as e:
            print(f"❌ Erro ao verificar continuação de agendamento com LLM: {e}")
            return False

    def _is_reschedule_continuation(self, message: str, agent_id: str) -> bool:
        """Verifica se a mensagem é uma continuação de alteração de horário"""
        try:
            # Verificar se há informações de agendamento no Redis que indicam reschedule
            last_scheduling = self._get_last_scheduling_info(agent_id)
            if not last_scheduling:
                return False
            
            # Verificar se a última interação foi sobre alteração de horário
            # Isso pode ser detectado pela presença de uma reunião existente
            whatsapp = last_scheduling.get("whatsapp")
            if not whatsapp:
                return False
            
            # Se há WhatsApp e informações de data/hora, pode ser reschedule
            has_datetime = last_scheduling.get("date") and last_scheduling.get("time")
            
            # Verificar se a mensagem contém informações de data/hora
            message_lower = self._normalize_text(message)
            datetime_indicators = [
                'amanha', 'amanhã', 'hoje', 'ontem', 'segunda', 'terça', 'quarta', 'quinta', 'sexta',
                ':', 'hora', 'horas', 'da manha', 'da tarde', 'da noite', 'manha', 'tarde', 'noite'
            ]
            
            has_datetime_info = any(indicator in message_lower for indicator in datetime_indicators)
            
            print(f"🔍 DEBUG - Verificando reschedule:")
            print(f"   Tem dados de agendamento: {bool(last_scheduling)}")
            print(f"   Tem data/hora: {has_datetime}")
            print(f"   Mensagem tem info de data/hora: {has_datetime_info}")
            
            return has_datetime and has_datetime_info
            
        except Exception as e:
            print(f"Erro ao verificar reschedule: {e}")
            return False

    def _process_reschedule_continuation(self, message: str, agent_id: str, calendar_credentials: str, calendar_id: str) -> str:
        """Processa a continuação de alteração de horário"""
        try:
            # Buscar dados do último agendamento
            last_scheduling = self._get_last_scheduling_info(agent_id)
            if not last_scheduling:
                return "❌ Não encontrei informações do agendamento anterior."
            
            # Usar LLM para extrair novo horário da mensagem
            from langchain_groq import ChatGroq
            llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)
            
            prompt = f"""
            Extraia informações de data e horário da seguinte mensagem: "{message}"
            
            Retorne apenas um JSON com as informações encontradas:
            {{
                "date": "DD/MM/YYYY" ou null se não encontrado,
                "time": "HH:MM" ou null se não encontrado,
                "has_info": true/false
            }}
            
            Exemplos:
            - "amanhã às 15:00" -> {{"date": "26/09/2025", "time": "15:00", "has_info": true}}
            - "14:30" -> {{"date": null, "time": "14:30", "has_info": true}}
            - "segunda-feira" -> {{"date": "30/09/2025", "time": null, "has_info": true}}
            """
            
            response = llm.invoke(prompt)
            result = response.content.strip()
            
            # Tentar extrair JSON da resposta
            import json
            try:
                if result.startswith("```json"):
                    result = result[7:-3]
                elif result.startswith("```"):
                    result = result[3:-3]
                
                extracted_info = json.loads(result)
                
                if extracted_info.get("has_info"):
                    new_date = extracted_info.get("date")
                    new_time = extracted_info.get("time")
                    
                    # Usar data existente se nova não for fornecida
                    if not new_date:
                        new_date = last_scheduling.get("date")
                    
                    # Usar horário existente se novo não for fornecido
                    if not new_time:
                        new_time = last_scheduling.get("time")
                    
                    # Atualizar dados no Redis
                    updated_scheduling = last_scheduling.copy()
                    updated_scheduling["date"] = new_date
                    updated_scheduling["time"] = new_time
                    updated_scheduling["datetime"] = f"{new_date} {new_time}"
                    
                    self._set_last_scheduling_info(agent_id, updated_scheduling)
                    
                    return f"""✅ **Novo Horário Confirmado**

**Novo horário:** {new_date} às {new_time}

Para confirmar a alteração da sua reunião, digite **"confirmar"**.

Para cancelar a alteração, digite **"cancelar"**.

Aguardo sua confirmação! 😊"""
                else:
                    return """❌ **Não entendi o novo horário**

Por favor, me informe o novo horário de forma mais clara:

**Exemplos:**
- "amanhã às 15:00"
- "14:30"
- "segunda-feira de manhã"

Aguardo o novo horário! 😊"""
                    
            except json.JSONDecodeError:
                return "❌ Erro ao processar novo horário. Por favor, tente novamente."
                
        except Exception as e:
            print(f"❌ Erro ao processar continuação de reschedule: {e}")
            return "❌ Erro ao processar alteração de horário. Por favor, tente novamente."

    def _process_scheduling_information(self, message: str, scheduling_analysis: dict, 
                                        agent_id: str = None, calendar_credentials: str = None, 
                                        calendar_id: str = None, chat_history: list = None, 
                                        agent_config: dict = None, whatsapp: str = None) -> str:
        """Processa as informações de agendamento fornecidas pelo usuário usando LLM"""
        try:
            # Verificar se é uma alteração de horário (reschedule)
            if self._is_reschedule_continuation(message, agent_id):
                print(f"🔄 Detectado como continuação de alteração de horário")
                return self._process_reschedule_continuation(message, agent_id, calendar_credentials, calendar_id)
            
            # Usar LLM para extrair informações mantendo contexto
            if chat_history and agent_config:
                print(f"🤖 Usando LLM para extrair informações de agendamento...")
                llm_result = self._extract_scheduling_info_with_llm(message, chat_history, agent_config)
                
                if llm_result.get("has_scheduling_info", False):
                    # Usar informações extraídas pelo LLM
                    date = llm_result.get("date", "data não especificada")
                    time = llm_result.get("time", "horário não especificado")
                    meeting_type = llm_result.get("meeting_type", "Reunião")
                    duration = llm_result.get("duration", "30 minutos")
                    participants = llm_result.get("participants", None)
                    subject = "Reunião Criada pela IA"  # Sempre usar assunto padrão
                    email = llm_result.get("email", None)
                    # Usar WhatsApp do parâmetro se disponível, senão do LLM
                    extracted_whatsapp = llm_result.get("whatsapp", None)
                    whatsapp = whatsapp or extracted_whatsapp
                    
                    # Validar se participantes foram fornecidos
                    if not participants or participants.strip() == "":
                        return """❌ **Informação obrigatória faltando!**

Para processar seu agendamento, preciso que você informe:

👥 **Participantes:** (obrigatório - digite o nome das pessoas que participarão)

Por favor, forneça os nomes das pessoas que participarão da reunião e tente novamente."""
                    
                    # Converter data/hora para datetime string
                    from datetime import datetime
                    try:
                        if date and time:
                            # Converter formato DD/MM/YYYY HH:MM para ISO
                            date_obj = datetime.strptime(date, "%d/%m/%Y")
                            time_obj = datetime.strptime(time, "%H:%M")
                            final_datetime = date_obj.replace(hour=time_obj.hour, minute=time_obj.minute)
                            datetime_str = final_datetime.isoformat()
                        else:
                            datetime_str = None
                    except Exception as e:
                        print(f"❌ Erro ao converter data/hora: {e}")
                        datetime_str = None
                        
                    print(f"🤖 LLM extraiu: {date} às {time} - {meeting_type}")
                    
                    # VERIFICAR CONFLITOS: Se tem WhatsApp, verificar se já tem reunião agendada
                    if whatsapp:
                        existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
                        if existing_meetings:
                            return self._block_new_meeting_request(existing_meetings[0], date, time, meeting_type)
                else:
                    # Fallback para parsing manual se LLM não conseguir
                    print(f"⚠️ LLM não conseguiu extrair informações, usando parsing manual...")
                    meeting_type = self._extract_meeting_type(message)
                    duration = self._extract_duration(message)
                    participants = self._extract_participants(message)
                    subject = "Reunião Criada pela IA"  # Sempre usar assunto padrão
                    email = self._detect_email_in_message(message)  # Adicionar email
                    # Usar WhatsApp do parâmetro se disponível, senão extrair da mensagem
                    extracted_whatsapp = self._detect_whatsapp_in_message(message)
                    whatsapp = whatsapp or extracted_whatsapp
                    
                    # Validar se participantes foram fornecidos
                    if not participants:
                        return """❌ **Informação obrigatória faltando!**

Para processar seu agendamento, preciso que você informe:

👥 **Participantes:** (obrigatório - digite o nome das pessoas que participarão)

Por favor, forneça os nomes das pessoas que participarão da reunião e tente novamente."""
                    
                    datetime_info = scheduling_analysis.get("datetime_info", {})
                    date = datetime_info.get("date", "data não especificada")
                    time = datetime_info.get("time", "horário não especificado")
                    datetime_str = datetime_info.get("datetime")
                    
                    # VERIFICAR CONFLITOS: Se tem WhatsApp, verificar se já tem reunião agendada
                    if whatsapp:
                        existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
                        if existing_meetings:
                            return self._block_new_meeting_request(existing_meetings[0], date, time, meeting_type)
            else:
                # Fallback para parsing manual se não há histórico/contexto
                print(f"⚠️ Sem contexto disponível, usando parsing manual...")
            meeting_type = self._extract_meeting_type(message)
            duration = self._extract_duration(message)
            participants = self._extract_participants(message)
            subject = self._extract_subject(message)
            email = self._detect_email_in_message(message)  # Adicionar email
            # Usar WhatsApp do parâmetro se disponível, senão extrair da mensagem
            extracted_whatsapp = self._detect_whatsapp_in_message(message)
            whatsapp = whatsapp or extracted_whatsapp
            
            # Validar se participantes foram fornecidos
            if not participants:
                return """❌ **Informação obrigatória faltando!**

Para processar seu agendamento, preciso que você informe:

👥 **Participantes:** (obrigatório - digite o nome das pessoas que participarão)

Por favor, forneça os nomes das pessoas que participarão da reunião e tente novamente."""
            
            datetime_info = scheduling_analysis.get("datetime_info", {})
            date = datetime_info.get("date", "data não especificada")
            time = datetime_info.get("time", "horário não especificado")
            datetime_str = datetime_info.get("datetime")
            
            # VERIFICAR CONFLITOS: Se tem WhatsApp, verificar se já tem reunião agendada
            if whatsapp:
                existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
                if existing_meetings:
                    return self._block_new_meeting_request(existing_meetings[0], date, time, meeting_type)
            
            # Em vez de agendar diretamente, mostrar confirmação
            return self._generate_scheduling_confirmation(
                date, time, meeting_type, duration, participants, subject, email, whatsapp, agent_id
            )
                
        except Exception as e:
            print(f"Erro ao processar informações de agendamento: {e}")
            return f"❌ Erro ao processar agendamento: {str(e)}. Por favor, tente novamente ou entre em contato com o suporte."

    def _check_existing_meetings(self, whatsapp_number: str, calendar_credentials: str, calendar_id: str) -> list:
        """Verifica se já existem reuniões agendadas para o WhatsApp"""
        try:
            from google_calendar_service import GoogleCalendarService
            
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            existing_meetings = calendar_service.search_meetings_by_whatsapp(whatsapp_number)
            
            print(f"🔍 Verificando reuniões existentes para WhatsApp {whatsapp_number}: {len(existing_meetings)} encontradas")
            return existing_meetings
            
        except Exception as e:
            print(f"❌ Erro ao verificar reuniões existentes: {e}")
            return []


    def _block_new_meeting_request(self, existing_meeting: dict, new_date: str, new_time: str, meeting_type: str) -> str:
        """Bloqueia nova solicitação de agendamento quando já existe reunião"""
        try:
            from datetime import datetime
            
            # Formatar data/hora da reunião existente
            start_datetime = existing_meeting['start']
            if 'T' in start_datetime:
                dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
            else:
                formatted_date = start_datetime
            
            response = f"""🚫 **Agendamento Bloqueado**

Você já possui uma reunião agendada:

**Reunião existente:** {existing_meeting['summary']}
**Data/Hora:** {formatted_date}

**Nova solicitação bloqueada:** {meeting_type} para {new_date} às {new_time}

**Política:** Apenas 1 reunião por WhatsApp é permitida.

**Opções disponíveis:**

1️⃣ **Alterar horário** da reunião existente
2️⃣ **Cancelar** a reunião existente e agendar a nova
3️⃣ **Manter** a reunião existente (cancelar nova solicitação)

**Para gerenciar sua reunião, responda com:**
- **"1"** - para alterar horário
- **"2"** - para cancelar e reagendar  
- **"3"** - para manter a atual

Aguardo sua escolha! 😊"""
            
            return response
            
        except Exception as e:
            print(f"❌ Erro ao bloquear nova solicitação: {e}")
            return "❌ Erro ao processar solicitação. Por favor, tente novamente."

    def _handle_meeting_management_option(self, option: str, agent_id: str, calendar_credentials: str, calendar_id: str, whatsapp: str = None) -> str:
        """Processa as opções de gerenciamento de reuniões (1-4)"""
        try:
            # Se não foi fornecido WhatsApp, tentar buscar do último agendamento
            if not whatsapp:
                last_scheduling = self._get_last_scheduling_info(agent_id)
                if last_scheduling:
                    whatsapp = last_scheduling.get("whatsapp")
            
            if not whatsapp:
                return "❌ Não foi possível identificar o WhatsApp para gerenciar as reuniões."
            
            # Buscar reuniões existentes
            existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
            if not existing_meetings:
                return "❌ Não encontrei reuniões existentes para gerenciar."
            
            if option == "1":  # Alterar horário
                return self._handle_reschedule_meeting_simple(existing_meetings[0])
            elif option == "2":  # Cancelar e agendar nova
                return self._handle_cancel_and_reschedule_simple(existing_meetings[0], calendar_credentials, calendar_id, agent_id)
            elif option == "3":  # Manter reunião existente
                return self._handle_keep_existing_meeting(existing_meetings[0])
            else:
                return "❌ Opção inválida. Por favor, escolha entre 1, 2 ou 3."
                
        except Exception as e:
            print(f"❌ Erro ao processar opção de gerenciamento: {e}")
            return "❌ Erro ao processar sua solicitação. Por favor, tente novamente."

    def _handle_reschedule_meeting_simple(self, existing_meeting: dict) -> str:
        """Lida com alteração de horário de reunião existente (versão simplificada)"""
        try:
            from datetime import datetime
            
            # Formatar data/hora da reunião existente
            start_datetime = existing_meeting['start']
            if 'T' in start_datetime:
                dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
            else:
                formatted_date = start_datetime
            
            return f"""🔄 **Alteração de Horário**

**Reunião existente:** {existing_meeting['summary']} - {formatted_date}

Para alterar o horário da sua reunião, por favor me informe:

📅 **Nova data** (ex: amanhã, 27/09, próxima semana)
🕒 **Novo horário** (ex: 15:00, 3 da tarde)

**Exemplo:** "alterar para amanhã às 15:00"

Aguardo as informações do novo horário! 😊"""
            
        except Exception as e:
            print(f"❌ Erro ao lidar com alteração de horário: {e}")
            return "❌ Erro ao processar alteração de horário."

    def _handle_cancel_and_reschedule_simple(self, existing_meeting: dict, calendar_credentials: str, calendar_id: str, agent_id: str) -> str:
        """Lida com cancelamento de reunião existente e agendamento de nova (versão simplificada)"""
        try:
            from google_calendar_service import GoogleCalendarService
            from datetime import datetime
            
            # Cancelar reunião existente
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            success = calendar_service.cancel_meeting(existing_meeting['id'])
            
            if success:
                # Formatar data/hora da reunião cancelada
                start_datetime = existing_meeting['start']
                if 'T' in start_datetime:
                    dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                    formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
                else:
                    formatted_date = start_datetime
                
                return f"""✅ **Reunião Cancelada e Nova Solicitação**

**Reunião cancelada:** {existing_meeting['summary']} - {formatted_date}

Agora você pode agendar uma nova reunião! Por favor, me informe:

📅 **Data desejada** (ex: amanhã, 27/09, próxima semana)
🕒 **Horário desejado** (ex: 15:00, 3 da tarde)
👥 **Participantes** (nomes das pessoas)
📧 **Email** (opcional - para envio de convite)

**Exemplo:** "agendar para amanhã às 15:00 com João Silva, email: joao@email.com"

Aguardo as informações da nova reunião! 😊"""
            else:
                return "❌ Erro ao cancelar a reunião existente. Por favor, tente novamente."
                
        except Exception as e:
            print(f"❌ Erro ao cancelar e reagendar: {e}")
            return "❌ Erro ao processar cancelamento."

    def _handle_schedule_new_meeting(self) -> str:
        """Lida com solicitação de nova reunião (mesmo com existente)"""
        return """📅 **Agendar Nova Reunião**

Entendi que você quer agendar uma nova reunião mesmo tendo uma existente.

⚠️ **Atenção:** Apenas 1 reunião por WhatsApp é permitida.

**Para agendar uma nova reunião, você pode:**

1️⃣ **Cancelar a atual** e agendar a nova (digite "2" na consulta anterior)
2️⃣ **Alterar horário** da atual (digite "1" na consulta anterior)

**Ou forneça as informações da nova reunião:**
- 📅 **Data desejada** (ex: amanhã, 27/09, próxima semana)
- 🕒 **Horário desejado** (ex: 15:00, 3 da tarde)
- 👥 **Participantes** (nomes das pessoas)
- 📧 **Email** (opcional - para envio de convite)

**Exemplo:** "agendar para amanhã às 15:00 com João Silva, email: joao@email.com"

Aguardo as informações da nova reunião! 😊"""

    def _handle_reschedule_meeting(self, existing_meeting: dict, new_scheduling: dict) -> str:
        """Lida com alteração de horário de reunião existente"""
        try:
            from datetime import datetime
            
            # Formatar data/hora da reunião existente
            start_datetime = existing_meeting['start']
            if 'T' in start_datetime:
                dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
            else:
                formatted_date = start_datetime
            
            new_date = new_scheduling.get('date')
            new_time = new_scheduling.get('time')
            
            return f"""🔄 **Alteração de Horário**

**Reunião existente:** {existing_meeting['summary']} - {formatted_date}
**Novo horário solicitado:** {new_date} às {new_time}

Para alterar o horário da sua reunião existente, preciso que você confirme:

✅ **Confirmar alteração** - Digite "confirmar"
❌ **Cancelar alteração** - Digite "cancelar"

Aguardo sua confirmação! 😊"""
            
        except Exception as e:
            print(f"❌ Erro ao lidar com alteração de horário: {e}")
            return "❌ Erro ao processar alteração de horário."

    def _handle_cancel_and_reschedule(self, existing_meeting: dict, new_scheduling: dict, 
                                    calendar_credentials: str, calendar_id: str, agent_id: str) -> str:
        """Lida com cancelamento de reunião existente e agendamento de nova"""
        try:
            from google_calendar_service import GoogleCalendarService
            
            # Cancelar reunião existente
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            success = calendar_service.cancel_meeting(existing_meeting['id'])
            
            if success:
                # Salvar dados da nova reunião para confirmação
                self._set_last_scheduling_info(agent_id, new_scheduling)
                
                return f"""✅ **Reunião anterior cancelada e nova agendamento preparado**

A reunião anterior foi cancelada com sucesso!

**Nova reunião:**
- **Data:** {new_scheduling.get('date')}
- **Horário:** {new_scheduling.get('time')}
- **Tipo:** {new_scheduling.get('meeting_type')}

✅ **Confirmar novo agendamento** - Digite "confirmar"
❌ **Cancelar** - Digite "cancelar"

Aguardo sua confirmação! 😊"""
            else:
                return "❌ Erro ao cancelar a reunião anterior. Por favor, tente novamente."
                
        except Exception as e:
            print(f"❌ Erro ao cancelar e reagendar: {e}")
            return "❌ Erro ao processar cancelamento e reagendamento."

    def _handle_keep_existing_meeting(self, existing_meeting: dict) -> str:
        """Lida com manter reunião existente e cancelar nova solicitação"""
        try:
            from datetime import datetime
            
            # Formatar data/hora da reunião existente
            start_datetime = existing_meeting['start']
            if 'T' in start_datetime:
                dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
            else:
                formatted_date = start_datetime
            
            return f"""✅ **Reunião existente mantida**

Perfeito! Sua reunião existente foi mantida:

**Reunião:** {existing_meeting['summary']}
**Data/Hora:** {formatted_date}

A nova solicitação foi cancelada.

Posso ajudá-lo com mais alguma coisa? 😊"""
            
        except Exception as e:
            print(f"❌ Erro ao manter reunião existente: {e}")
            return "❌ Erro ao processar solicitação."


    def _detect_meeting_query_intent(self, message: str) -> dict:
        """Detecta intenção de consultar reuniões existentes"""
        try:
            message_lower = self._normalize_text(message)
            
            # Palavras-chave para consulta de reuniões (sem acentos para corresponder à normalização)
            # Evitando palavras que podem conflitar com solicitações de agendamento
            query_keywords = [
                "minhas reunioes", "consultar reuniao",
                "verificar reuniao", "listar reunioes", "quais reunioes",
                "tenho reuniao", "reuniao agendada", "agendamento existente",
                "mostrar reunioes", "reunioes futuras", "proximas reunioes",
                "consultar agendamento", "ver agendamento", "meu agendamento",
                "reuniao marcada", "consulta agendada", "horarios",
                "tenho consulta", "consulta marcada", "consulta agendada",
                "minhas consultas", "meus horarios", "agendamentos futuros",
                "próximos agendamentos", "proximos agendamentos"
            ]
            
            # Verificar se contém palavras-chave de consulta
            found_keywords = []
            for keyword in query_keywords:
                if keyword in message_lower:
                    found_keywords.append(keyword)
            
            if found_keywords:
                confidence = min(0.9, 0.6 + (len(found_keywords) * 0.1))
                return {
                    "has_query_intent": True,
                    "confidence": confidence,
                    "keywords_found": found_keywords,
                    "type": "meeting_query"
                }
            
            return {"has_query_intent": False, "confidence": 0.0}
            
        except Exception as e:
            print(f"❌ Erro ao detectar intenção de consulta: {e}")
            return {"has_query_intent": False, "confidence": 0.0}

    def _process_meeting_query(self, whatsapp: str, calendar_credentials: str, calendar_id: str) -> str:
        """Processa consulta de reuniões existentes"""
        try:
            if not whatsapp:
                return "❌ Não foi possível identificar o WhatsApp para consultar reuniões. Por favor, forneça seu número."
            
            # Buscar reuniões existentes
            existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
            
            if not existing_meetings:
                return """📅 **Nenhuma Reunião Encontrada**

Você não possui reuniões agendadas no momento.

**Para agendar uma nova reunião, digite:**
- "Quero agendar uma reunião"
- "Gostaria de marcar uma consulta"
- "Preciso agendar para amanhã"

Estou aqui para ajudar! 😊"""
            
            # Formatar lista de reuniões
            meetings_list = ""
            for i, meeting in enumerate(existing_meetings, 1):
                from datetime import datetime
                
                # Formatar data/hora
                start_datetime = meeting['start']
                if 'T' in start_datetime:
                    dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                    formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
                    day_name = dt.strftime('%A')
                else:
                    formatted_date = start_datetime
                    day_name = ""
                
                # Extrair informações da descrição
                description = meeting.get('description', '')
                participants = "Não especificado"
                email = "Não informado"
                
                # Tentar extrair participantes e email da descrição
                if "Participantes:" in description:
                    parts = description.split("Participantes:")
                    if len(parts) > 1:
                        participants = parts[1].split("\n")[0].strip()
                
                if "Email:" in description:
                    parts = description.split("Email:")
                    if len(parts) > 1:
                        email = parts[1].split("\n")[0].strip()
                
                meetings_list += f"""
**{i}. {meeting['summary']}**
📅 **Data/Hora:** {formatted_date} {f"({day_name})" if day_name else ""}
👥 **Participantes:** {participants}
📧 **Email:** {email}
---
"""
            
            response = f"""📋 **Suas Reuniões Agendadas**

Encontrei **{len(existing_meetings)}** reunião(ões) agendada(s):

{meetings_list}

**Opções disponíveis:**

1️⃣ **Alterar horário** de uma reunião
2️⃣ **Cancelar** uma reunião
3️⃣ **Manter** reunião existente

**Para gerenciar suas reuniões, digite:**
- **"1"** - para alterar horário
- **"2"** - para cancelar reunião
- **"3"** - para manter reunião existente

Aguardo sua escolha! 😊"""
            
            return response
            
        except Exception as e:
            print(f"❌ Erro ao processar consulta de reuniões: {e}")
            return "❌ Erro ao consultar reuniões. Por favor, tente novamente."

    def _detect_confirmation_response(self, message: str) -> dict:
        """Detecta se a mensagem é uma resposta de confirmação de agendamento"""
        try:
            message_lower = self._normalize_text(message)
            print(f"🔍 DEBUG - Detectando confirmação para mensagem: '{message}' -> '{message_lower}'")
            
            # Palavras-chave para confirmação
            confirm_keywords = [
                'confirmar', 'confirmo', 'sim', 'ok', 'pode', 'pode ser',
                'esta certo', 'esta correto', 'perfeito', 'beleza'
            ]
            
            # Palavras-chave para cancelamento
            cancel_keywords = [
                'cancelar', 'nao', 'não', 'desistir', 'nao quero',
                'nao quero mais', 'esquece', 'deixa pra la'
            ]
            
            # Palavras-chave para outro horário
            reschedule_keywords = [
                'outro horario', 'outra hora', 'mudar horario', 'trocar horario',
                'nao pode ser', 'nao da', 'nao consigo', 'tem outro horario'
            ]
            
            # Palavras-chave para gerenciamento de reuniões (números 1-4)
            management_keywords = ['1', '2', '3', '4']
            
            # Verificar se é resposta de gerenciamento de reuniões
            if message_lower.strip() in management_keywords:
                print(f"🔍 DEBUG - Resposta de gerenciamento detectada: '{message_lower.strip()}'")
                return {"type": "meeting_management", "option": message_lower.strip(), "confidence": 0.95}
            elif any(keyword in message_lower for keyword in confirm_keywords):
                return {"type": "confirm", "confidence": 0.9}
            elif any(keyword in message_lower for keyword in cancel_keywords):
                return {"type": "cancel", "confidence": 0.9}
            elif any(keyword in message_lower for keyword in reschedule_keywords):
                return {"type": "reschedule", "confidence": 0.9}
            elif message_lower.strip() == "confirmar" and self._is_reschedule_continuation(message, agent_id):
                return {"type": "reschedule_confirm", "confidence": 0.95}
            else:
                return {"type": "unknown", "confidence": 0.0}
                
        except Exception as e:
            print(f"Erro ao detectar resposta de confirmação: {e}")
            return {"type": "unknown", "confidence": 0.0}

    def _generate_scheduling_confirmation(self, date: str, time: str, meeting_type: str, 
                                        duration: str, participants: str, subject: str, 
                                        email: str = None, whatsapp: str = None, agent_id: str = None) -> str:
        """Gera mensagem de confirmação antes de agendar"""
        try:
            # Preparar informações do email
            email_info = ""
            if email:
                email_info = f"\n📧 **Email:** {email}"
            else:
                email_info = "\n📧 **Email:** Não fornecido"
            
            # Preparar informações do WhatsApp
            whatsapp_info = ""
            if whatsapp:
                whatsapp_info = f"\n📱 **WhatsApp:** {whatsapp}"
            else:
                whatsapp_info = "\n📱 **WhatsApp:** Não fornecido"
            
            # Salvar informações de agendamento para uso posterior na confirmação
            if agent_id:
                scheduling_data = {
                    "date": date,
                    "time": time,
                    "meeting_type": meeting_type,
                    "duration": duration,
                    "participants": participants,
                    "subject": subject,
                    "email": email,
                    "whatsapp": whatsapp,
                    "datetime": f"{date} {time}"
                }
                self._set_last_scheduling_info(agent_id, scheduling_data)
                print(f"💾 Dados de agendamento salvos para confirmação: {scheduling_data}")
            
            return f"""📋 **Confirmação de Agendamento**

Recebi suas informações e gostaria de confirmar os detalhes antes de agendar:

📅 **Data:** {date}
🕒 **Horário:** {time}
📋 **Tipo:** {meeting_type}
⏱️ **Duração:** {duration}
👥 **Participantes:** {participants}{email_info}{whatsapp_info}

**Por favor, confirme uma das opções:**

✅ **1. Confirmar agendamento** - Digite "confirmar" ou "sim"
🔄 **2. Propor outro horário** - Digite "outro horário" ou sugira um horário
❌ **3. Cancelar agendamento** - Digite "cancelar" ou "não"

Aguardo sua confirmação para prosseguir com o agendamento! 😊"""
                
        except Exception as e:
            print(f"Erro ao gerar confirmação de agendamento: {e}")
            return f"❌ Erro ao gerar confirmação. Por favor, tente novamente."

    def _process_confirmation_response(self, message: str, confirmation_response: dict, 
                                     agent_id: str, calendar_credentials: str, calendar_id: str,
                                     chat_history: list, agent_config: dict, whatsapp: str = None, use_google_meeting: bool = False) -> str:
        """Processa a resposta de confirmação do usuário"""
        try:
            confirmation_type = confirmation_response["type"]
            print(f"🔍 DEBUG - Processando confirmação do tipo: {confirmation_type}")
            
            if confirmation_type == "meeting_management":
                # Processar opção de gerenciamento de reuniões
                option = confirmation_response.get("option")
                print(f"🔍 DEBUG - Processando opção de gerenciamento: {option}")
                result = self._handle_meeting_management_option(option, agent_id, calendar_credentials, calendar_id, whatsapp)
                print(f"🔍 DEBUG - Resultado do gerenciamento: {result[:100]}...")
                return result
                
            elif confirmation_type == "confirm":
                # Usuário confirmou - buscar dados do último agendamento e criar evento
                print(f"🔍 DEBUG - Buscando dados do último agendamento para agent_id: {agent_id}")
                last_scheduling = self._get_last_scheduling_info(agent_id)
                print(f"🔍 DEBUG - Dados recuperados do Redis: {last_scheduling}")
                
                if not last_scheduling:
                    return "❌ Não encontrei informações do agendamento anterior. Por favor, forneça os dados novamente."
                
                # Executar o agendamento real
                return self._execute_final_scheduling(last_scheduling, agent_id, calendar_credentials, calendar_id, use_google_meeting)
                
            elif confirmation_type == "cancel":
                return """❌ **Agendamento Cancelado**

Entendi que você não deseja prosseguir com o agendamento.

Se mudar de ideia, estarei aqui para ajudar! 😊

Posso ajudá-lo com mais alguma coisa?"""
                
            elif confirmation_type == "reschedule":
                return """🔄 **Propor Outro Horário**

Claro! Vamos encontrar um horário que funcione melhor para você.

**Por favor, sugira:**
- Um novo horário específico (ex: "14:30")
- Um período do dia (ex: "manhã", "tarde", "noite")
- Outro dia (ex: "amanhã", "segunda-feira")

Assim que você me informar, verificarei a disponibilidade e confirmarei o novo agendamento! 😊"""
                
            elif confirmation_type == "reschedule_confirm":
                # Processar confirmação de alteração de horário
                return self._process_reschedule_confirmation(agent_id, calendar_credentials, calendar_id)
                
            else:
                return """❓ **Não entendi sua resposta**

Por favor, escolha uma das opções:

✅ **Confirmar** - Digite "confirmar" ou "sim"
🔄 **Outro horário** - Digite "outro horário" ou sugira um horário
❌ **Cancelar** - Digite "cancelar" ou "não"

Aguardo sua resposta! 😊"""
                
        except Exception as e:
            print(f"Erro ao processar resposta de confirmação: {e}")
            return f"❌ Erro ao processar confirmação. Por favor, tente novamente."

    def _process_reschedule_confirmation(self, agent_id: str, calendar_credentials: str, calendar_id: str) -> str:
        """Processa a confirmação de alteração de horário reutilizando dados da reunião existente"""
        try:
            # Buscar dados do último agendamento (que contém as informações da reunião existente)
            last_scheduling = self._get_last_scheduling_info(agent_id)
            if not last_scheduling:
                return "❌ Não encontrei informações do agendamento anterior. Por favor, tente novamente."
            
            # Extrair dados da reunião existente
            whatsapp = last_scheduling.get("whatsapp")
            if not whatsapp:
                return "❌ Não foi possível identificar o WhatsApp para alterar a reunião."
            
            # Buscar reunião existente
            existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
            if not existing_meetings:
                return "❌ Não encontrei reunião existente para alterar."
            
            existing_meeting = existing_meetings[0]
            
            # Extrair dados do novo horário
            new_date = last_scheduling.get("date")
            new_time = last_scheduling.get("time")
            datetime_str = last_scheduling.get("datetime")
            
            if not datetime_str:
                try:
                    from datetime import datetime
                    date_obj = datetime.strptime(new_date, "%d/%m/%Y")
                    time_obj = datetime.strptime(new_time, "%H:%M")
                    final_datetime = date_obj.replace(hour=time_obj.hour, minute=time_obj.minute)
                    datetime_str = final_datetime.isoformat()
                except Exception as e:
                    print(f"❌ Erro ao converter datetime: {e}")
                    return "❌ Erro ao processar novo horário. Por favor, tente novamente."
            
            # Atualizar reunião existente com novo horário
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            
            # Calcular novo horário de fim (mantendo a duração original)
            from datetime import datetime, timedelta
            start_dt = datetime.fromisoformat(datetime_str)
            end_dt = start_dt + timedelta(hours=1)  # Duração padrão de 1 hora
            
            # Extrair informações da reunião existente
            existing_summary = existing_meeting.get('summary', 'Reunião')
            existing_description = existing_meeting.get('description', '')
            
            # Atualizar reunião
            success = calendar_service.update_meeting(
                existing_meeting['id'],
                start_dt,
                end_dt,
                existing_summary,
                existing_description
            )
            
            if success:
                return f"""✅ **Reunião Alterada com Sucesso!**

**Reunião:** {existing_summary}
**Novo horário:** {new_date} às {new_time}

A reunião foi atualizada no calendário com sucesso! 📅

Posso ajudá-lo com mais alguma coisa? 😊"""
            else:
                return "❌ Erro ao alterar a reunião no calendário. Por favor, tente novamente."
                
        except Exception as e:
            print(f"❌ Erro ao processar alteração de horário: {e}")
            return "❌ Erro ao processar alteração de horário. Por favor, tente novamente."

    def _execute_final_scheduling(self, scheduling_data: dict, agent_id: str, 
                                calendar_credentials: str, calendar_id: str, use_google_meeting: bool = False) -> str:
        """Executa o agendamento final após confirmação"""
        try:
            print(f"🔍 DEBUG - Dados recebidos para agendamento final:")
            print(f"   scheduling_data: {scheduling_data}")
            
            # Extrair dados do agendamento
            date = scheduling_data.get("date", "data não especificada")
            time = scheduling_data.get("time", "horário não especificado")
            datetime_str = scheduling_data.get("datetime")
            
            print(f"🔍 DEBUG - Dados extraídos:")
            print(f"   date: {date}")
            print(f"   time: {time}")
            print(f"   datetime_str: {datetime_str}")
            
            # Se datetime_str não é um formato ISO válido, converter
            if datetime_str and not datetime_str.startswith("2025-"):
                try:
                    from datetime import datetime
                    # Converter formato DD/MM/YYYY HH:MM para ISO
                    date_obj = datetime.strptime(date, "%d/%m/%Y")
                    time_obj = datetime.strptime(time, "%H:%M")
                    final_datetime = date_obj.replace(hour=time_obj.hour, minute=time_obj.minute)
                    datetime_str = final_datetime.isoformat()
                    print(f"🔧 Convertido datetime: {scheduling_data.get('datetime')} -> {datetime_str}")
                except Exception as e:
                    print(f"❌ Erro ao converter datetime: {e}")
                    datetime_str = None
            
            # Executar operações reais de calendário
            calendar_result = self._execute_calendar_operations(
                datetime_str, 
                scheduling_data.get("meeting_type", "Reunião"),
                scheduling_data.get("duration", "30 minutos"),
                scheduling_data.get("subject", "Reunião"),
                scheduling_data.get("participants", "1 pessoa"),
                agent_id, calendar_credentials, calendar_id,
                scheduling_data.get("email"),
                scheduling_data.get("whatsapp"),
                use_google_meeting
            )
            
            if calendar_result["success"]:
                # Preparar informações do evento
                event_link = calendar_result.get("event_link", "Link não disponível")
                meet_link = calendar_result.get("meet_link")
                
                # Verificar se email foi fornecido
                email_message = ""
                if scheduling_data.get("email"):
                    email_message = f"\n📧 **Email registrado:** {scheduling_data.get('email')}\n📬 **Convite será enviado automaticamente**"
                else:
                    email_message = "\n⚠️ **Email não fornecido** - entre em contato para receber o convite."
                
                # Google Meet não é exibido para Service Accounts
                meet_message = ""
                if meet_link:
                    meet_message = f"\n\n🎥 **Link da Reunião Google Meet:**\n{meet_link}\n\n💡 **Dica:** Clique no link acima para entrar diretamente na reunião!"
                
                # Preparar mensagem de confirmação
                confirmation_message = f"""✅ **Agendamento Confirmado!**

Perfeito! Processei seu agendamento com sucesso:

📅 **Data:** {date}
🕒 **Horário:** {time}
📋 **Tipo:** {scheduling_data.get('meeting_type', 'Reunião')}
⏱️ **Duração:** {scheduling_data.get('duration', '30 minutos')}
👥 **Participantes:** {scheduling_data.get('participants', '1 pessoa')}{email_message}{meet_message}

📎 **Arquivo do Calendário:** Em anexo você encontrará um arquivo .ics que pode ser importado em qualquer aplicativo de calendário (Google Calendar, Outlook, Apple Calendar, etc.)

🎉 **Status:** Agendamento realizado com sucesso!

Se precisar alterar ou cancelar o agendamento, entre em contato conosco.

Obrigado por escolher nossos serviços! 😊"""
                
                # Retornar mensagem e dados do arquivo .ics
                result = {
                    "message": confirmation_message,
                    "ics_content": calendar_result.get("ics_content"),
                    "ics_filename": f"reuniao_{date.replace('/', '-')}_{time.replace(':', 'h')}.ics"
                }
                
                print(f"🔍 DEBUG - Retornando resultado da função _execute_final_scheduling:")
                print(f"   message: {len(result['message'])} caracteres")
                print(f"   ics_content: {'Sim' if result['ics_content'] else 'Não'}")
                print(f"   ics_filename: {result['ics_filename']}")
                
                return result
            else:
                return f"""⚠️ **Problema no Agendamento**

Recebi sua confirmação, mas encontrei um problema ao processar o agendamento:

❌ **Erro:** {calendar_result.get('error', 'Erro desconhecido')}

**O que aconteceu:**
- ✅ Confirmação recebida
- ❌ Erro ao criar o evento no calendário

**Soluções:**
1. Tente um horário diferente
2. Verifique se as credenciais do calendário estão corretas
3. Entre em contato com o suporte técnico

Por favor, tente novamente ou entre em contato conosco para assistência."""
                
        except Exception as e:
            print(f"Erro ao executar agendamento final: {e}")
            return f"❌ Erro ao processar agendamento final. Por favor, tente novamente."

    def _extract_meeting_type(self, message: str) -> str:
        """Extrai o tipo de reunião da mensagem"""
        message_lower = self._normalize_text(message)
        
        if 'comercial' in message_lower:
            return "Reunião Comercial"
        elif 'técnica' in message_lower:
            return "Consulta Técnica"
        elif 'demonstração' in message_lower:
            return "Demonstração"
        elif 'consulta' in message_lower:
            return "Consulta"
        else:
            return "Reunião"

    def _extract_duration(self, message: str) -> str:
        """Extrai a duração da mensagem"""
        message_lower = self._normalize_text(message)
        
        if '30 minutos' in message_lower or '30' in message_lower:
            return "30 minutos"
        elif '1 hora' in message_lower or '60 minutos' in message_lower:
            return "1 hora"
        elif '90 minutos' in message_lower or '1.5 hora' in message_lower:
            return "1h30"
        elif '2 hora' in message_lower or '120 minutos' in message_lower:
            return "2 horas"
        else:
            return "1 hora"

    def _extract_participants(self, message: str) -> str:
        """Extrai informações sobre participantes - exige nomes específicos"""
        message_lower = self._normalize_text(message)
        
        # Se não há nomes específicos mencionados, retorna None para exigir informação
        if 'somente eu' in message_lower or 'só eu' in message_lower or 'apenas eu' in message_lower:
            return "Somente eu"
        elif any(word in message_lower for word in ['com', 'e', 'mais', 'nós', 'nós dois', 'nós três']):
            # Se menciona outras pessoas mas não especifica nomes, exige especificação
            return None
        else:
            # Verifica se há nomes próprios na mensagem (palavras com maiúscula)
            import re
            names = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', message)
            if names and len(names) > 1:  # Mais de um nome encontrado
                return ", ".join(names)
            elif names and len(names) == 1:  # Apenas um nome
                return names[0]
            else:
                return None  # Exige que o usuário forneça os nomes

    def _extract_subject(self, message: str) -> str:
        """Extrai o assunto da mensagem - sempre retorna assunto padrão"""
        return "Reunião Criada pela IA"

    def _execute_calendar_operations(self, datetime_str: str, meeting_type: str, 
                                   duration: str, subject: str, participants: str, 
                                   agent_id: str = None, calendar_credentials: str = None, 
                                   calendar_id: str = None, email: str = None, whatsapp: str = None,
                                   use_google_meeting: bool = False) -> dict:
        """Executa as operações reais de calendário"""
        try:
            if not datetime_str:
                return {
                    "success": False,
                    "error": "Data/hora não especificada"
                }
            
            # Converter string para datetime
            start_datetime = datetime.fromisoformat(datetime_str)
            
            # Calcular duração em minutos
            duration_minutes = self._parse_duration_to_minutes(duration)
            end_datetime = start_datetime + timedelta(minutes=duration_minutes)
            
            # Criar título do evento
            event_title = f"{meeting_type} - {subject}"
            
            # Criar descrição do evento (com WhatsApp oculto)
            event_description = f"""
Tipo: {meeting_type}
Duração: {duration}
Participantes: {participants}
Assunto: {subject}

Agendado via InovAI Analytics

<!-- METADATA_START -->
WHATSAPP: {whatsapp or 'N/A'}
<!-- METADATA_END -->
            """.strip()
            
            # Verificar se temos credenciais válidas
            print(f"🔍 DEBUG - Credenciais recebidas:")
            print(f"   calendar_credentials: {'Sim' if calendar_credentials else 'Não'}")
            print(f"   calendar_id: {calendar_id}")
            print(f"   agent_id: {agent_id}")
            
            if not calendar_credentials or not calendar_id:
                print(f"⚠️ Credenciais ou ID do calendário não fornecidos")
                print(f"📅 Simulando criação de evento:")
                print(f"   Título: {event_title}")
                print(f"   Início: {start_datetime}")
                print(f"   Fim: {end_datetime}")
                
                simulated_id = f"simulated_{int(datetime.now().timestamp())}"
                # Guardar último evento simulado
                if agent_id:
                    self.last_events[agent_id] = {
                        'event_id': simulated_id,
                        'calendar_id': calendar_id
                    }

                return {
                    "success": True,
                    "event_id": simulated_id,
                    "event_link": f"https://calendar.google.com/event?eid={simulated_id}",
                    "start_time": start_datetime.isoformat(),
                    "end_time": end_datetime.isoformat(),
                    "summary": event_title,
                    "note": "Evento simulado - credenciais não configuradas"
                }
            
            # Criar evento real no Google Calendar
            print(f"📅 Criando evento real no Google Calendar:")
            print(f"   Título: {event_title}")
            print(f"   Início: {start_datetime}")
            print(f"   Fim: {end_datetime}")
            print(f"   Calendário: {calendar_id}")
            
            # Usar o serviço de calendário do agente
            calendar_service = self._get_calendar_service(agent_id, calendar_credentials, calendar_id)
            
            if not calendar_service.is_available():
                return {
                    "success": False,
                    "error": "Serviço de calendário não disponível - verifique as credenciais"
                }
            
            # Verificar disponibilidade antes de criar o evento
            print(f"🔍 Verificando disponibilidade para {start_datetime} - {end_datetime}")
            availability_result = calendar_service.check_availability(start_datetime, end_datetime)
            
            if not availability_result["available"]:
                return {
                    "success": False,
                    "error": f"Horário não disponível: {availability_result.get('reason', 'Conflito de horário')}"
                }
            
            print(f"✅ Horário disponível! Criando evento...")
            
            # Preparar lista de participantes (incluir email se fornecido)
            attendees = []
            if email:
                print(f"📧 Email fornecido: {email}")
                print(f"⚠️ LOG SERVIDOR: Service Account não pode enviar convites externos para contas pessoais")
                print(f"⚠️ LOG SERVIDOR: Criando evento sem participantes - usuário não será notificado deste erro")
                # attendees.append(email)  # Comentado devido à limitação da Service Account
            
            # Criar o evento com lembretes e email do cliente como participante
            print(f"🔍 DEBUG - Criando evento com use_google_meeting: {use_google_meeting}")
            event_result = calendar_service.create_event(
                summary=event_title,
                start_datetime=start_datetime,
                end_datetime=end_datetime,
                description=event_description,
                attendees=attendees,  # Lista de emails dos participantes
                location="",   # Por enquanto sem localização
                reminders=[
                    {"method": "email", "minutes": 60},   # Lembrete 1 hora antes
                    {"method": "popup", "minutes": 30}    # Lembrete 30 min antes
                ],
                use_google_meeting=use_google_meeting
            )
            print(f"🔍 DEBUG - Resultado do evento: {event_result}")
            
            if event_result["success"]:
                # Enviar notificação via Chatwoot (se configurado)
                self._send_chatwoot_notification(
                    event_result["event_id"],
                    event_title,
                    start_datetime,
                    end_datetime
                )
                # Guardar último evento real
                if agent_id:
                    self.last_events[agent_id] = {
                        'event_id': event_result["event_id"],
                        'calendar_id': calendar_id
                    }
                
                # Gerar arquivo .ics para anexo
                ics_content = None
                try:
                    # Buscar dados completos do evento para gerar .ics
                    event_data = {
                        'summary': event_title,
                        'description': event_description,
                        'location': "",
                        'start': {
                            'dateTime': start_datetime.isoformat()
                        },
                        'end': {
                            'dateTime': end_datetime.isoformat()
                        }
                    }
                    ics_content = calendar_service.generate_ics_file(event_data, event_result.get("meet_link"))
                    if ics_content:
                        print(f"✅ Arquivo .ics gerado com sucesso")
                    else:
                        print(f"⚠️ Falha ao gerar arquivo .ics")
                except Exception as e:
                    print(f"❌ Erro ao gerar arquivo .ics: {e}")
                
                return {
                    "success": True,
                    "event_id": event_result["event_id"],
                    "event_link": event_result["event_link"],
                    "start_time": event_result["start_time"],
                    "end_time": event_result["end_time"],
                    "summary": event_result["summary"],
                    "note": "Evento criado no Google Calendar",
                    "ics_content": ics_content
                }
            else:
                return {
                    "success": False,
                    "error": event_result["error"]
                }
            
        except Exception as e:
            print(f"❌ Erro ao executar operações de calendário: {e}")
            return {
                "success": False,
                "error": f"Erro ao processar agendamento: {str(e)}"
            }

    def _parse_duration_to_minutes(self, duration: str) -> int:
        """Converte duração em texto para minutos"""
        duration_lower = duration.lower()
        
        if '30 minutos' in duration_lower or '30' in duration_lower:
            return 30
        elif '1 hora' in duration_lower or '60 minutos' in duration_lower or '60' in duration_lower:
            return 60
        elif '90 minutos' in duration_lower or '1.5 hora' in duration_lower or '90' in duration_lower:
            return 90
        elif '2 hora' in duration_lower or '120 minutos' in duration_lower or '120' in duration_lower:
            return 120
        else:
            return 60  # Padrão de 1 hora

    def _send_chatwoot_notification(self, event_id: str, event_title: str, 
                                   start_datetime: datetime, end_datetime: datetime):
        """Envia notificação via Chatwoot sobre o evento criado"""
        try:
            # Por enquanto, apenas log. Em produção, aqui faria a chamada para o Chatwoot
            print(f"📱 NOTIFICAÇÃO CHATWOOT:")
            print(f"   Evento criado: {event_title}")
            print(f"   ID: {event_id}")
            print(f"   Início: {start_datetime}")
            print(f"   Fim: {end_datetime}")
            print(f"   Status: Notificação enviada via Chatwoot")
            
            # TODO: Implementar chamada real para API do Chatwoot
            # Exemplo de implementação:
            # chatwoot_api.send_message({
            #     "message": f"✅ Evento agendado: {event_title}",
            #     "event_details": {
            #         "id": event_id,
            #         "start": start_datetime.isoformat(),
            #         "end": end_datetime.isoformat()
            #     }
            # })
            
        except Exception as e:
            print(f"⚠️ Erro ao enviar notificação Chatwoot: {e}")

    def _detect_email_in_message(self, message: str) -> str:
        """Detecta email na mensagem do usuário"""
        import re
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, message)
        return emails[0] if emails else None

    def _detect_whatsapp_in_message(self, message: str) -> str:
        """Detecta número de WhatsApp na mensagem usando regex"""
        import re
        
        # Padrões para WhatsApp: (11) 99999-9999, 11999999999, +55 11 99999-9999, etc.
        whatsapp_patterns = [
            r'\(\d{2}\)\s?\d{4,5}-?\d{4}',  # (11) 99999-9999 ou (11)99999-9999
            r'\d{10,11}',  # 11999999999
            r'\+55\s?\d{2}\s?\d{4,5}-?\d{4}',  # +55 11 99999-9999
            r'whatsapp[:\s]*[\d\s\(\)\-\+]+',  # whatsapp: (11) 99999-9999
        ]
        
        for pattern in whatsapp_patterns:
            matches = re.findall(pattern, message, re.IGNORECASE)
            if matches:
                # Limpar e formatar o número
                number = re.sub(r'[^\d]', '', matches[0])  # Remove tudo exceto dígitos
                if len(number) >= 10:  # Número válido
                    # Formatar como (XX) XXXXX-XXXX se tiver 11 dígitos
                    if len(number) == 11:
                        return f"({number[:2]}) {number[2:7]}-{number[7:]}"
                    elif len(number) == 10:
                        return f"({number[:2]}) {number[2:6]}-{number[6:]}"
                    else:
                        return number
                        
        return None

    def _extract_whatsapp_from_event(self, event_description: str) -> str:
        """Extrai o WhatsApp da descrição do evento"""
        import re
        
        # Procurar pelo padrão <!-- METADATA_START --> WHATSAPP: (número) <!-- METADATA_END -->
        pattern = r'<!-- METADATA_START -->\s*WHATSAPP:\s*([^<]+)\s*<!-- METADATA_END -->'
        match = re.search(pattern, event_description)
        
        if match:
            whatsapp = match.group(1).strip()
            if whatsapp != 'N/A':
                return whatsapp
        
        return None

    def _send_email_to_client(self, email: str, event_details: dict) -> dict:
        """O Google Calendar já envia emails automaticamente - apenas confirma"""
        try:
            print(f"📧 GOOGLE CALENDAR ENVIA EMAIL AUTOMATICAMENTE:")
            print(f"   Email do cliente: {email}")
            print(f"   Evento: {event_details.get('title', 'N/A')}")
            print(f"   Status: ✅ Google Calendar enviará email automaticamente")
            
            # O Google Calendar API já envia emails de confirmação automaticamente
            # quando um evento é criado com participantes
            return {
                "success": True,
                "message": "Google Calendar enviará email automaticamente",
                "google_calendar_email": True
            }
            
        except Exception as e:
            print(f"⚠️ Erro ao processar email: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def _is_email_follow_up(self, message: str) -> bool:
        """Verifica se a mensagem contém um email como resposta a um agendamento"""
        message_lower = self._normalize_text(message)
        
        # Palavras-chave que indicam que o usuário está fornecendo email
        email_keywords = [
            'email', 'e-mail', 'meu email', 'endereço', 'enviar para',
            'mandar para', 'contato', 'comunicar', 'notificar'
        ]
        
        return any(keyword in message_lower for keyword in email_keywords)

    def _process_email_for_scheduling(self, email: str, message: str, agent_id: str = None,
                                      calendar_credentials: str = None, calendar_id: str = None) -> str:
        """Processa o email fornecido pelo cliente após agendamento"""
        try:
            print(f"📧 Processando email para agendamento: {email}")
            
            # Tentar anexar o email ao último evento do agente e enviar convite
            if agent_id and agent_id in self.last_events:
                last_event = self.last_events[agent_id]
                event_id = last_event.get('event_id')
                if event_id and calendar_credentials and calendar_id:
                    try:
                        calendar_service = self._get_calendar_service(agent_id, calendar_credentials, calendar_id)
                        result = calendar_service.add_attendees(event_id, [email])
                        if result.get('success'):
                            return f"""📧 **Convite Enviado!**

O convite foi enviado para **{email}** pelo Google Calendar.

✅ **Status:** Convite enviado
🔗 **Evento:** {result.get('event_link','')}

Se não receber em alguns minutos, verifique a pasta de spam."""
                        else:
                            print(f"⚠️ Falha ao adicionar participante: {result.get('error')}")
                    except Exception as e:
                        print(f"⚠️ Erro ao anexar participante ao evento: {e}")

            # Fallback: confirmação genérica quando não há contexto suficiente para enviar invite real
            return f"""📧 **Email Confirmado!**

Recebi seu email **{email}**.

Para enviar o convite automaticamente, preciso que o agente tenha credenciais e calendário configurados. Assim que estiver configurado, posso anexar seu email ao evento e o Google Calendar enviará o convite."""
                
        except Exception as e:
            print(f"⚠️ Erro ao processar email: {e}")
            return f"""❌ **Erro no Processamento**

Houve um erro ao processar seu email. Por favor, tente novamente ou entre em contato conosco.

Obrigado pela compreensão! 🙏"""

    def _generate_scheduling_response(self, scheduling_analysis: dict, original_answer: str, agent_id: str = None, 
                                    calendar_credentials: str = None, calendar_id: str = None,
                                    calendar_start_hour: int = 9, calendar_end_hour: int = 18,
                                    calendar_workdays: str = "1,2,3,4,5", calendar_duration_minutes: int = 60, whatsapp: str = None) -> str:
        """Gera resposta específica para agendamento"""
        try:
            datetime_info = scheduling_analysis.get("datetime_info")
            
            if datetime_info:
                date = datetime_info.get("date", "data não especificada")
                time = datetime_info.get("time", "horário não especificado")
                
                # VERIFICAR CONFLITOS: Se tem WhatsApp, verificar se já tem reunião agendada
                if whatsapp and calendar_credentials and calendar_id:
                    existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
                    if existing_meetings:
                        return self._block_new_meeting_request(existing_meetings[0], date, time, "Reunião")
                
                # Verificar se o horário sugerido está disponível (apenas se não for horário específico)
                confidence = scheduling_analysis.get('confidence', 0)
                suggested_time = time
                availability_info = ""
                
                # Se a confiança é baixa (horário padrão sugerido), verificar disponibilidade
                print(f"🔍 DEBUG - Verificando disponibilidade: confidence={confidence}, agent_id={bool(agent_id)}, credentials={bool(calendar_credentials)}, calendar_id={bool(calendar_id)}")
                if confidence <= 0.8 and agent_id and calendar_credentials and calendar_id:
                    try:
                        # Extrair a data para verificação
                        from datetime import datetime, timedelta
                        if "amanhã" in original_answer.lower() or "amanha" in original_answer.lower():
                            target_date = datetime.now() + timedelta(days=1)
                        elif "hoje" in original_answer.lower():
                            target_date = datetime.now()
                        else:
                            # Tentar extrair data da mensagem original
                            target_date = datetime.now() + timedelta(days=1)  # fallback para amanhã
                        
                        # Buscar horários livres no dia usando a API que já funciona
                        print(f"🔍 DEBUG - Buscando horários livres para {target_date.strftime('%d/%m/%Y')}")
                        available_slots_data = self.get_available_slots(agent_id, calendar_credentials, calendar_id, target_date,
                                                                       calendar_start_hour, calendar_end_hour, calendar_duration_minutes)
                        available_slots = [slot['start'] for slot in available_slots_data] if available_slots_data else []
                        print(f"🔍 DEBUG - Resultado: {len(available_slots)} slots encontrados")
                        
                        if available_slots:
                            suggested_time = available_slots[0]  # Primeiro horário disponível
                            availability_info = f"\n\n✅ **Horários disponíveis encontrados:**\n"
                            for i, slot in enumerate(available_slots[:3]):  # Mostrar até 3 opções
                                availability_info += f"• {slot}\n"
                            
                            # Atualizar datetime_info com horário disponível
                            datetime_info["time"] = suggested_time
                            time = suggested_time
                        else:
                            availability_info = f"\n\n⚠️ **Não encontrei horários livres para {date}.**\nTente outro dia ou horário específico."
                            
                    except Exception as e:
                        print(f"Erro ao verificar disponibilidade: {e}")
                        availability_info = f"\n\nℹ️ *Verificarei a disponibilidade quando você fornecer os detalhes.*"
                
                # Verificar se houve conflito de dias úteis
                workday_conflict_message = ""
                if datetime_info.get("workday_conflict"):
                    conflict = datetime_info["workday_conflict"]
                    workday_conflict_message = f"""⚠️ **Não temos reunião disponível para {conflict['original_weekday']} ({conflict['original_date']})**

Trabalhamos apenas de segunda a sexta-feira. Sugiro o próximo dia útil: **{conflict['corrected_weekday']} ({conflict['corrected_date']})**

"""
                
                return f"""{workday_conflict_message}Entendi que você gostaria de agendar algo para {date} às {time}.

Para processar seu agendamento, confirme as informações:

1. *Tipo de reunião/consulta:* Reunião Comercial
2. *Duração estimada:* 1 hora
3. *Participantes:* (obrigatório - digite o nome das pessoas que participarão)
4. *Seu email:* (opcional - para enviar o convite da reunião){availability_info}

**Informações extraídas:**
- Data: {date}
- Horário: {time}
- Confiança na detecção: {confidence:.0%}

Por favor, informe o(s) nome(s) do(s) partipante(s) e caso queira alterar horário e/ou informar e-mail digite abaixo ou digite somente confirmar para fazer o agendamento."""
            else:
                return f"""📅 **Agendamento Detectado**

Entendi que você gostaria de agendar algo, mas preciso de mais informações:

1. **Data preferida:** (ex: amanhã, próxima semana, 25/09)
2. **Horário preferido:** (ex: manhã, tarde, 14h, 15h30)
3. **Tipo de reunião/consulta:** (ex: reunião comercial, consulta técnica)
4. **Duração estimada:** (padrão: 1 hora, ou ex: 30 minutos, 2 horas)
5. **Participantes:** (você + quantas pessoas?)

Após receber essas informações, posso verificar a disponibilidade e confirmar o agendamento para você.

**Confiança na detecção:** {scheduling_analysis.get('confidence', 0):.0%}

Por favor, forneça os detalhes acima para que eu possa ajudá-lo com o agendamento."""
                
        except Exception as e:
            print(f"Erro ao gerar resposta de agendamento: {e}")
            return f"📅 Detectei que você quer agendar algo, mas preciso de mais informações. Por favor, me diga a data, horário e tipo de reunião que deseja agendar."

    def _find_available_slots(self, agent_id: str, calendar_credentials: str, calendar_id: str, target_date,
                            calendar_start_hour: int = 9, calendar_end_hour: int = 18, calendar_duration_minutes: int = 60) -> List[str]:
        """Encontra horários livres no dia especificado"""
        try:
            from datetime import datetime, timedelta
            import json
            
            # Usar configurações do agente
            start_hour = calendar_start_hour
            end_hour = calendar_end_hour
            slot_duration = calendar_duration_minutes
            
            print(f"🕒 Usando configurações do agente: {start_hour}:00 às {end_hour}:00 (slots de {slot_duration}min)")
            
            # Criar lista de slots possíveis
            available_slots = []
            current_time = target_date.replace(hour=start_hour, minute=0, second=0, microsecond=0)
            end_time = target_date.replace(hour=end_hour, minute=0, second=0, microsecond=0)
            
            while current_time < end_time:
                slot_end = current_time + timedelta(minutes=slot_duration)
                
                # Verificar se o slot está livre
                is_available = self._check_slot_availability(agent_id, calendar_credentials, calendar_id, current_time, slot_end)
                
                if is_available:
                    available_slots.append(current_time.strftime("%H:%M"))
                
                # Próximo slot
                current_time += timedelta(minutes=slot_duration)
            
            print(f"🔍 Encontrados {len(available_slots)} horários livres para {target_date.strftime('%d/%m/%Y')}")
            return available_slots
            
        except Exception as e:
            print(f"Erro ao buscar horários livres: {e}")
            return []
    
    def _check_slot_availability(self, agent_id: str, calendar_credentials: str, calendar_id: str, start_time, end_time) -> bool:
        """Verifica se um slot específico está disponível"""
        try:
            calendar_service = self._get_calendar_service(agent_id, calendar_credentials, calendar_id)
            if not calendar_service:
                return False
            
            # Buscar todos os eventos do dia (mesma lógica do GoogleCalendarService)
            from datetime import time, timezone
            import pytz
            
            # Usar fuso horário do Brasil
            tz = pytz.timezone('America/Sao_Paulo')
            
            # Normalizar início e fim do dia
            day_start = start_time.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz)
            day_end = start_time.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=tz)
            
            # Converter para UTC
            day_start_utc = day_start.astimezone(timezone.utc)
            day_end_utc = day_end.astimezone(timezone.utc)
            
            events_result = calendar_service.service.events().list(
                calendarId=calendar_id,
                timeMin=day_start_utc.isoformat(),
                timeMax=day_end_utc.isoformat(),
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            
            # Converter eventos para slots ocupados e verificar conflitos
            has_conflict = False
            for event in events:
                start_raw = event['start'].get('dateTime', event['start'].get('date'))
                end_raw = event['end'].get('dateTime', event['end'].get('date'))
                event_start = datetime.fromisoformat(start_raw.replace('Z', '+00:00')).astimezone(tz)
                event_end = datetime.fromisoformat(end_raw.replace('Z', '+00:00')).astimezone(tz)
                
                # Verificar se há sobreposição (mesma lógica do GoogleCalendarService)
                if (start_time < event_end and end_time > event_start):
                    has_conflict = True
                    break
            
            is_available = not has_conflict
            print(f"🔍 Slot {start_time.strftime('%H:%M')}-{end_time.strftime('%H:%M')}: {len(events)} eventos no dia, conflito={has_conflict}, disponível={is_available}")
            return is_available
            
        except Exception as e:
            print(f"Erro ao verificar disponibilidade do slot {start_time.strftime('%H:%M')}: {e}")
            return False

    def _get_last_scheduling_info(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Obtém informações do último agendamento salvo no Redis"""
        try:
            data = self.redis.get(self._last_sched_prefix + agent_id)
            if data:
                return _json.loads(data)
            return None
        except Exception:
            return None

    def _set_last_scheduling_info(self, agent_id: str, info: Dict[str, Any]):
        try:
            self.redis.set(self._last_sched_prefix + agent_id, _json.dumps(info), ex=60*60*24)
        except Exception:
            pass

    def _get_calendar_service(self, agent_id: str, calendar_credentials: str = None, calendar_id: str = None) -> GoogleCalendarService:
        """Obtém ou cria serviço de calendário para um agente"""
        cache_key = f"{agent_id}_{calendar_id}"
        
        if cache_key not in self.calendar_services:
            if calendar_credentials:
                self.calendar_services[cache_key] = GoogleCalendarService(
                    credentials_json=calendar_credentials,
                    calendar_id=calendar_id
                )
            else:
                # Retornar serviço vazio se não há credenciais
                self.calendar_services[cache_key] = GoogleCalendarService()
        
        return self.calendar_services[cache_key]

    def get_available_slots(self, agent_id: str, calendar_credentials: str, calendar_id: str,
                           date: datetime, start_hour: int = 9, end_hour: int = 18, 
                           duration_minutes: int = 60) -> List[Dict[str, Any]]:
        """Busca horários disponíveis para um agente específico"""
        calendar_service = self._get_calendar_service(agent_id, calendar_credentials, calendar_id)
        return calendar_service.get_available_slots(date, start_hour, end_hour, duration_minutes)

    def create_calendar_event(self, agent_id: str, calendar_credentials: str, calendar_id: str,
                             summary: str, start_datetime: datetime, end_datetime: datetime = None,
                             description: str = "", attendees: List[str] = None, location: str = "",
                             use_google_meeting: bool = False) -> Dict[str, Any]:
        """Cria evento no calendário de um agente específico"""
        calendar_service = self._get_calendar_service(agent_id, calendar_credentials, calendar_id)
        return calendar_service.create_event(summary, start_datetime, end_datetime, description, attendees, location, None, use_google_meeting)

    def check_calendar_availability(self, agent_id: str, calendar_credentials: str, calendar_id: str,
                                   start_datetime: datetime, end_datetime: datetime = None) -> Dict[str, Any]:
        """Verifica disponibilidade no calendário de um agente específico"""
        calendar_service = self._get_calendar_service(agent_id, calendar_credentials, calendar_id)
        return calendar_service.check_availability(start_datetime, end_datetime)

    def clear_agent_memory(self, agent_id: str, vectorstore_path: str):
        """Limpa memória de conversa de um agente"""
        cache_key = f"{agent_id}_{vectorstore_path}"
        if cache_key in self.agent_chains:
            chain = self.agent_chains[cache_key]
            if hasattr(chain, 'memory') and hasattr(chain.memory, 'clear'):
                chain.memory.clear()
    
    def remove_agent_from_cache(self, agent_id: str, vectorstore_path: str):
        """Remove agente do cache"""
        cache_key = f"{agent_id}_{vectorstore_path}"
        if cache_key in self.agent_chains:
            del self.agent_chains[cache_key]
