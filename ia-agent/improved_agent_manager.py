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
from email_service import EmailService

class ImprovedAgentManager:
    """Gerenciador de agentes IA com fluxo melhorado de agendamento"""
    
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
        self.last_events = {}
        # Redis para persistir última data/hora detectada por agente
        self.redis = redis.Redis(host=os.getenv('REDIS_HOST', 'redis-dev'),
                                 port=int(os.getenv('REDIS_PORT', '6379')),
                                 password=os.getenv('REDIS_PASSWORD', 'invoAI@76925'),
                                 decode_responses=True)
        self._last_sched_prefix = 'agent:last_scheduling_info:'
        self._last_suggested_times_prefix = 'agent:last_suggested_times:'
        self._selected_time_prefix = 'agent:selected_time:'
    
    def _set_selected_time(self, agent_id: str, whatsapp: str, selected_time: dict):
        """Armazena horário selecionado no Redis"""
        try:
            import json
            data = {
                "datetime": selected_time["datetime"].isoformat(),
                "formatted": selected_time["formatted"],
                "day_name": selected_time["day_name"],
                "whatsapp": whatsapp
            }
            key = f"{self._selected_time_prefix}{agent_id}:{whatsapp}"
            self.redis.set(key, json.dumps(data), ex=60*60)  # Expira em 1 hora
            print(f"✅ Horário selecionado armazenado no Redis: {key}")
        except Exception as e:
            print(f"❌ Erro ao armazenar horário selecionado: {e}")
    
    def _get_selected_time(self, agent_id: str, whatsapp: str):
        """Recupera horário selecionado do Redis"""
        try:
            import json
            from datetime import datetime
            key = f"{self._selected_time_prefix}{agent_id}:{whatsapp}"
            data = self.redis.get(key)
            if data:
                parsed = json.loads(data)
                parsed["datetime"] = datetime.fromisoformat(parsed["datetime"])
                print(f"✅ Horário selecionado recuperado do Redis")
                return parsed
            print(f"⚠️ Nenhum horário selecionado encontrado no Redis")
            return None
        except Exception as e:
            print(f"❌ Erro ao recuperar horário selecionado: {e}")
            return None
    
    def _set_last_suggested_times(self, agent_id: str, whatsapp: str, suggested_times: list):
        """Armazena horários sugeridos no Redis para recuperar quando usuário escolher"""
        try:
            import json
            data = {
                "whatsapp": whatsapp,
                "suggested_times": [
                    {
                        "datetime": t["datetime"].isoformat(),
                        "formatted": t["formatted"],
                        "day_name": t["day_name"]
                    } for t in suggested_times
                ]
            }
            # Usar WhatsApp como parte da chave para garantir contexto correto
            key = f"{self._last_suggested_times_prefix}{agent_id}:{whatsapp}"
            self.redis.set(key, json.dumps(data), ex=60*60)  # Expira em 1 hora
            print(f"✅ Horários sugeridos armazenados no Redis: {key}")
        except Exception as e:
            print(f"❌ Erro ao armazenar horários sugeridos: {e}")
    
    def _get_last_suggested_times(self, agent_id: str, whatsapp: str):
        """Recupera horários sugeridos do Redis"""
        try:
            import json
            from datetime import datetime
            key = f"{self._last_suggested_times_prefix}{agent_id}:{whatsapp}"
            data = self.redis.get(key)
            if data:
                parsed = json.loads(data)
                # Converter strings ISO de volta para datetime
                for t in parsed["suggested_times"]:
                    t["datetime"] = datetime.fromisoformat(t["datetime"])
                print(f"✅ Horários sugeridos recuperados do Redis: {len(parsed['suggested_times'])} opções")
                return parsed
            print(f"⚠️ Nenhum horário sugerido encontrado no Redis para {key}")
            return None
        except Exception as e:
            print(f"❌ Erro ao recuperar horários sugeridos: {e}")
            return None
    
    def chat_with_agent_improved(self, agent_id: str, vectorstore_path: str, 
                                message: str, system_prompt: str, model: str, api_provider: str,
                                calendar_credentials: str = None, calendar_id: str = None, 
                                chat_history: list = None, whatsapp: str = None,
                                calendar_start_hour: int = 9, calendar_end_hour: int = 18,
                                calendar_workdays: str = "1,2,3,4,5", calendar_duration_minutes: int = 60,
                                use_google_meeting: bool = False, temperature: float = 0.10,
                                calendar_enabled: bool = False, contact_name: str = None, 
                                conversation_id: str = None, account_id: str = None, inbox_id: str = None) -> dict:
        """
        Fluxo melhorado do agente de IA com prioridade para agendamento
        
        NOVO FLUXO:
        1. Se calendar_enabled=True, verificar PRIMEIRO se é agendamento
        2. Se tem intenção de agendamento, verificar reuniões existentes
        3. Se tem reunião existente, mostrar opções de alterar/cancelar
        4. Se não tem reunião, sugerir 3 horários aleatórios
        5. Só depois usar o system_prompt para outras perguntas
        """
        try:
            print(f"🤖 FLUXO MELHORADO - Iniciando processamento da mensagem")
            print(f"   Calendar enabled: {calendar_enabled}")
            print(f"   Telefone (whatsapp): {whatsapp}")
            print(f"   Message: {message[:100]}...")
            
            # Gerar chave única para esta conversa (preferir account_id:inbox_id:conversation_id)
            if account_id and inbox_id and conversation_id:
                conversation_key = f"{account_id}:{inbox_id}:{conversation_id}"
            else:
                conversation_key = f"{agent_id}:{conversation_id}" if conversation_id else agent_id
            
            # ===== COLETA OBRIGATÓRIA DE NOME =====
            # 1) Tentar usar nome já armazenado
            real_name_key = f"agent:real_name:{conversation_key}"
            stored_real_name = None
            try:
                stored_real_name = self.redis.get(real_name_key)
                if stored_real_name:
                    stored_real_name = stored_real_name.decode('utf-8') if isinstance(stored_real_name, bytes) else stored_real_name
                    contact_name = stored_real_name
                    print(f"✅ Usando nome real armazenado: {contact_name}")
            except Exception as e:
                print(f"⚠️ Erro ao verificar nome real no Redis: {e}")

            # Tratar nome aleatório como se não houvesse nome válido
            if contact_name and self._is_random_name(contact_name):
                contact_name = None

            if not contact_name:
                # 2) Se não veio nome do canal, tentar extrair do texto
                # Aceitar nome único se o bot pediu explicitamente o nome na mensagem anterior
                allow_single_word_name = self._bot_recently_asked_for_name(chat_history)
                if self._message_contains_name(message, allow_single_word=allow_single_word_name):
                    detected_name = self._extract_name_from_message(message, allow_single_word=allow_single_word_name)
                    if detected_name:
                        try:
                            self.redis.set(real_name_key, detected_name, ex=60*60*24*7)
                            print(f"✅ Nome real armazenado no Redis: {real_name_key} = {detected_name}")
                            # Após salvar o nome, tentar detectar o telefone na mesma mensagem
                            same_message_phone = self._detect_whatsapp_in_message(message)
                            if same_message_phone:
                                try:
                                    phone_key = f"agent:whatsapp:{conversation_key}"
                                    self.redis.set(phone_key, same_message_phone, ex=60*60*24)
                                    print(f"✅ Telefone detectado junto com o nome e salvo no Redis: {phone_key} = {same_message_phone}")
                                except Exception as e:
                                    print(f"⚠️ Erro ao salvar telefone detectado junto do nome: {e}")
                                return {
                                    "answer": f"🎉 Perfeito, {detected_name}! Muito prazer em conhecê-lo(a)! 😊\n\nAgora que sei seu nome e telefone, posso te ajudar de forma mais personalizada. Sinta-se à vontade para dizer 'oi' ou fazer qualquer pergunta!",
                                    "should_transfer": False,
                                    "transfer_reason": None,
                                    "has_scheduling_intent": False,
                                    "scheduling_info": {"type": "name_and_phone_confirmed"},
                                    "scheduling_confidence": 0
                                }
                            # Se não veio telefone, solicitar agora
                            return {
                                "answer": "👋 Poderia me informar seu telefone com DDD? 😊\n\nExemplo:\n• 31987654321",
                                "should_transfer": False,
                                "transfer_reason": None,
                                "has_scheduling_intent": False,
                                "scheduling_info": {"type": "phone_request_after_name"},
                                "scheduling_confidence": 0
                            }
                        except Exception as e:
                            print(f"⚠️ Erro ao armazenar nome real no Redis: {e}")
                # 3) Se não conseguimos extrair, pedir o nome
                return {
                    "answer": f"👋 Olá! Para uma experiência mais personalizada, poderia me informar seu nome? 😊\n\nPor favor, digite seu nome e sobrenome!",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": False,
                    "scheduling_info": {"type": "name_request"},
                    "scheduling_confidence": 0
                }
            else:
                # 4) Se veio um contact_name do canal e não é aleatório, persistir
                if not self._is_random_name(contact_name) and not stored_real_name:
                    try:
                        self.redis.set(real_name_key, contact_name, ex=60*60*24*7)
                        print(f"✅ Nome real do canal armazenado no Redis: {real_name_key} = {contact_name}")
                    except Exception as e:
                        print(f"⚠️ Erro ao armazenar nome real do canal no Redis: {e}")
            
            # ===== COLETA/VERIFICAÇÃO DE TELEFONE =====
            # Normalizar e armazenar WhatsApp se vier como parâmetro
            if whatsapp and agent_id:
                normalized_whatsapp = self._normalize_whatsapp_number(whatsapp)
                if normalized_whatsapp:
                    try:
                        key = f"agent:whatsapp:{conversation_key}"
                        self.redis.set(key, normalized_whatsapp, ex=60*60*24)  # Expira em 24 horas
                        print(f"✅ Telefone normalizado (parâmetro) armazenado no Redis: {key} = {normalized_whatsapp}")
                        whatsapp = normalized_whatsapp  # Usar versão normalizada
                    except Exception as e:
                        print(f"⚠️ Erro ao armazenar telefone (parâmetro) no Redis: {e}")
                else:
                    print(f"⚠️ Telefone inválido (parâmetro): {whatsapp}")
            
            # Tentar recuperar WhatsApp do Redis se não veio como parâmetro (mesma sessão)
            if not whatsapp and agent_id:
                try:
                    key = f"agent:whatsapp:{conversation_key}"
                    stored_whatsapp = self.redis.get(key)
                    if stored_whatsapp:
                        whatsapp = stored_whatsapp
                        print(f"✅ Telefone recuperado do Redis da sessão: {key} = {whatsapp}")
                except Exception as e:
                    print(f"⚠️ Erro ao recuperar telefone do Redis: {e}")

            # Detectar telefone na mensagem atual se ainda não tivermos
            if not whatsapp:
                detected = self._detect_whatsapp_in_message(message)
                if detected:
                    whatsapp = detected
                    try:
                        key = f"agent:whatsapp:{conversation_key}"
                        self.redis.set(key, whatsapp, ex=60*60*24)
                        print(f"✅ Telefone detectado na mensagem e salvo no Redis: {key} = {whatsapp}")
                    except Exception as e:
                        print(f"⚠️ Erro ao salvar telefone detectado no Redis: {e}")
                else:
                    # Pedir telefone antes de seguir com qualquer fluxo
                    return {
                        "answer": "� Poderia me informar seu telefone com DDD? 😊\n\nExemplo:\n• 31987654321",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": False,
                        "scheduling_info": {"type": "phone_request"},
                        "scheduling_confidence": 0
                    }
            
            # Armazenar email se detectado na mensagem (para uso futuro na mesma sessão)
            if agent_id and '@' in message and '.' in message:
                try:
                    import re
                    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
                    emails = re.findall(email_pattern, message)
                    if emails:
                        email = emails[0]
                        key = f"agent:email:{conversation_key}"
                        self.redis.set(key, email, ex=60*60*24)  # Expira em 24 horas
                        print(f"✅ Email detectado e armazenado no Redis da sessão: {key} = {email}")
                except Exception as e:
                    print(f"⚠️ Erro ao armazenar email no Redis: {e}")
            
            # ===== ETAPA 1: VERIFICAÇÃO PRIORITÁRIA DE AGENDAMENTO =====
            if calendar_enabled and calendar_credentials and calendar_id:
                print(f"🔍 ETAPA 1: Verificando intenção de agendamento...")
                
                # PRIMEIRO: Verificar se é consulta de reuniões existentes
                meeting_query_response = self._detect_meeting_query_intent_improved(message)
                if meeting_query_response.get("confidence", 0) >= 0.7:
                    print(f"✅ Consulta de reuniões detectada - processando...")
                    result = self._process_meeting_query_improved(whatsapp, calendar_credentials, calendar_id)
                    return {
                        "answer": result,
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": False,
                        "scheduling_info": {"type": "meeting_query"},
                        "scheduling_confidence": meeting_query_response["confidence"]
                    }
                
                # SEGUNDO: Verificar se é confirmação de horário
                confirmation_response = self._detect_time_confirmation(message, chat_history)
                if confirmation_response.get("is_confirmation", False):
                    print(f"✅ Confirmação de horário detectada - processando...")
                    return self._process_time_confirmation(
                        confirmation_response, agent_id, calendar_credentials, calendar_id,
                        calendar_start_hour, calendar_end_hour, calendar_workdays,
                        calendar_duration_minutes, whatsapp, use_google_meeting
                    )
                
                # TERCEIRO (NOVO): Verificar se é continuação de agendamento (confirmação ou email)
                scheduling_continuation = self._detect_scheduling_continuation(message, chat_history, agent_id, whatsapp)
                if scheduling_continuation.get("is_continuation", False):
                    print(f"✅ Continuação de agendamento detectada - processando confirmação/email...")
                    return self._process_scheduling_continuation(
                        scheduling_continuation, calendar_credentials, calendar_id,
                        calendar_duration_minutes, use_google_meeting, contact_name,
                        agent_id, whatsapp, conversation_id, account_id, inbox_id
                    )
                
                # QUARTO: Verificar se é opção de reunião existente
                meeting_option_response = self._detect_meeting_option(message, chat_history)
                print(f"🔍 Verificando opção de reunião:")
                print(f"   É opção: {meeting_option_response.get('is_meeting_option', False)}")
                print(f"   Opção selecionada: {meeting_option_response.get('selected_option')}")
                print(f"   Confiança: {meeting_option_response.get('confidence', 0)}")
                
                if meeting_option_response.get("is_meeting_option", False):
                    print(f"✅ Opção de reunião detectada - processando...")
                    return self._process_meeting_option(
                        meeting_option_response, whatsapp, calendar_credentials, calendar_id,
                        calendar_start_hour, calendar_end_hour, calendar_workdays,
                        calendar_duration_minutes, use_google_meeting, agent_id, contact_name, conversation_id,
                        account_id, inbox_id
                    )
                
                # QUINTO (NOVO): Verificar se há horários sugeridos e usuário forneceu data/hora específica
                if agent_id and whatsapp:
                    suggested_times_data = self._get_last_suggested_times(agent_id, whatsapp)
                    if suggested_times_data and suggested_times_data.get("suggested_times"):
                        # Há horários sugeridos ativos - verificar se mensagem contém data/hora específica (sem LLM fallback para evitar falsos positivos)
                        datetime_info = self._extract_datetime_from_message(message, calendar_workdays, allow_llm_fallback=False)
                        if datetime_info and datetime_info.get("datetime"):
                            print(f"✅ Data/hora específica detectada após sugestão de horários - processando...")
                            return self._process_custom_datetime_request(
                                datetime_info, agent_id, calendar_credentials, calendar_id,
                                calendar_start_hour, calendar_end_hour, calendar_workdays,
                                calendar_duration_minutes, whatsapp, use_google_meeting, contact_name
                            )
                
                # SEXTO: Detectar intenção de agendamento (com histórico para contexto)
                scheduling_analysis = self._detect_scheduling_intent_improved(message, chat_history)
                print(f"   Intenção detectada: {scheduling_analysis.get('has_scheduling_intent', False)}")
                print(f"   Confiança: {scheduling_analysis.get('confidence', 0)}")
                
                # Se a mensagem parece um número de telefone e já temos WhatsApp, tratar como intenção de agendamento
                try:
                    digits_msg = re.sub(r'[^\d]', '', message)
                    if whatsapp and digits_msg and len(digits_msg) >= 10:
                        if not scheduling_analysis.get("has_scheduling_intent", False):
                            scheduling_analysis["has_scheduling_intent"] = True
                            scheduling_analysis["confidence"] = 0.75
                            print(f"✅ Mensagem parece número. Forçando intenção de agendamento (confiança 0.75)")
                except Exception as _e:
                    pass
                
                # Verificar se há contexto de WhatsApp requerido no histórico e detectar WhatsApp na mensagem
                if not whatsapp and chat_history:
                    # Verificar se a última resposta do bot pediu WhatsApp
                    for entry in reversed(chat_history[-3:]):
                        bot_message = ""
                        if isinstance(entry, dict) and entry.get("role") == "assistant":
                            bot_message = entry.get("content", "")
                        elif isinstance(entry, list) and len(entry) >= 2:
                            bot_message = entry[1] if entry[1] else ""
                        
                        if bot_message and ("whatsapp" in bot_message.lower() or "número" in bot_message.lower() or "numero" in bot_message.lower()):
                            # Bot pediu WhatsApp, tentar detectar na mensagem atual
                            detected_whatsapp = self._detect_whatsapp_in_message(message)
                            if detected_whatsapp:
                                whatsapp = detected_whatsapp
                                # Normalizar e armazenar no Redis
                                normalized_whatsapp = self._normalize_whatsapp_number(detected_whatsapp)
                                if normalized_whatsapp and agent_id:
                                    try:
                                        key = f"agent:whatsapp:{conversation_key}"
                                        self.redis.set(key, normalized_whatsapp, ex=60*60*24)  # Expira em 24 horas
                                        print(f"✅ WhatsApp armazenado no Redis: {key} = {normalized_whatsapp}")
                                    except Exception as e:
                                        print(f"⚠️ Erro ao armazenar WhatsApp no Redis: {e}")
                                print(f"✅ WhatsApp detectado e normalizado: {whatsapp}")
                                # Se detectou WhatsApp, considerar que pode ser continuação de agendamento
                                if not scheduling_analysis.get("has_scheduling_intent", False):
                                    scheduling_analysis["has_scheduling_intent"] = True
                                    scheduling_analysis["confidence"] = 0.7
                                break
                
                # Também tentar detectar WhatsApp diretamente na mensagem se parecer ser um número
                if not whatsapp:
                    detected_whatsapp = self._detect_whatsapp_in_message(message)
                    if detected_whatsapp and len(detected_whatsapp) >= 12:  # Tem pelo menos 12 dígitos (55 + DDD + número)
                        # Se a mensagem parece ser principalmente um número, pode ser WhatsApp
                        digits_in_message = re.sub(r'[^\d]', '', message)
                        if len(digits_in_message) >= 10 and len(message.strip()) - len(digits_in_message) < 5:
                            # Mensagem contém principalmente números
                            whatsapp = detected_whatsapp
                            # Normalizar e armazenar no Redis
                            normalized_whatsapp = self._normalize_whatsapp_number(detected_whatsapp)
                            if normalized_whatsapp and agent_id:
                                try:
                                    key = f"agent:whatsapp:{conversation_key}"
                                    self.redis.set(key, normalized_whatsapp, ex=60*60*24)  # Expira em 24 horas
                                    print(f"✅ WhatsApp armazenado no Redis: {key} = {normalized_whatsapp}")
                                except Exception as e:
                                    print(f"⚠️ Erro ao armazenar WhatsApp no Redis: {e}")
                            print(f"✅ WhatsApp detectado diretamente na mensagem: {whatsapp}")
                            if not scheduling_analysis.get("has_scheduling_intent", False):
                                scheduling_analysis["has_scheduling_intent"] = True
                                scheduling_analysis["confidence"] = 0.7
                
                if scheduling_analysis.get("has_scheduling_intent", False) and scheduling_analysis.get("confidence", 0) > 0.6:
                    print(f"✅ Intenção de agendamento confirmada - processando...")
                    
                    # ===== ETAPA 2: VERIFICAR REUNIÕES EXISTENTES =====
                    if whatsapp:
                        print(f"🔍 ETAPA 2: Verificando reuniões existentes para {whatsapp}...")
                        existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
                        
                        if existing_meetings:
                            print(f"   {len(existing_meetings)} reunião(ões) encontrada(s)")
                            # ===== ETAPA 3: MOSTRAR OPÇÕES PARA REUNIÃO EXISTENTE =====
                            return self._handle_existing_meeting_options(existing_meetings[0], message, scheduling_analysis)
                        else:
                            print(f"   Nenhuma reunião existente encontrada")
                            # ===== ETAPA 4: SUGERIR 3 HORÁRIOS ALEATÓRIOS =====
                            return self._suggest_random_available_times(
                                agent_id, calendar_credentials, calendar_id,
                                calendar_start_hour, calendar_end_hour, calendar_workdays,
                                calendar_duration_minutes, whatsapp, message
                            )
                    else:
                        # Sem WhatsApp, pedir para fornecer
                        return {
                            "answer": """👋 Poderia me informar seu telefone com DDD? 😊\n\nExemplo:\n• 31987654321""",
                            "should_transfer": False,
                            "transfer_reason": None,
                            "has_scheduling_intent": True,
                            "scheduling_info": {"type": "whatsapp_required"},
                            "scheduling_confidence": scheduling_analysis.get("confidence", 0)
                        }
                else:
                    print(f"❌ Não é intenção de agendamento - continuando com IA normal")
            else:
                print(f"❌ Calendário não habilitado - usando IA normal")
            
            # ===== ETAPA 5: PROCESSAMENTO NORMAL COM IA =====
            print(f"🔍 ETAPA 5: Processando com IA usando system_prompt...")
            
            # Obter ou criar chain
            chain = self._get_or_create_chain(agent_id, vectorstore_path, system_prompt, model, api_provider, temperature)
            
            if not chain:
                return {
                    "answer": "Erro: Não foi possível inicializar o agente.",
                    "should_transfer": False,
                    "transfer_reason": None
                }
            
            # Processar mensagem com IA usando _simple_chat_processing (que funciona perfeitamente)
            print(f"🔍 DEBUG - Usando _simple_chat_processing para garantir uso do vectorstore")
            answer = self._simple_chat_processing(chain, message)
            
            # Detectar se deve transferir para humano
            transfer_analysis = self._analyze_transfer_need(message, answer)
            
            return {
                "answer": answer,
                "should_transfer": transfer_analysis["should_transfer"],
                "transfer_reason": transfer_analysis["reason"],
                "has_scheduling_intent": False,
                "scheduling_info": None,
                "scheduling_confidence": 0
            }
            
        except Exception as e:
            print(f"❌ Erro no fluxo melhorado: {e}")
            return {
                "answer": f"Desculpe, ocorreu um erro ao processar sua mensagem: {str(e)}",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": False,
                "scheduling_info": None,
                "scheduling_confidence": 0
            }
    
    def _detect_scheduling_intent_improved(self, message: str, chat_history: list = None) -> Dict[str, Any]:
        """Detecção melhorada de intenção de agendamento usando histórico para contexto"""
        try:
            message_lower = self._normalize_text(message)
            
            # Palavras-chave para agendamento
            scheduling_keywords = [
                "agendar", "marcar", "reuniao", "consulta", "horario", "data",
                "agendamento", "marcacao", "calendario", "evento", "compromisso",
                "quero agendar", "gostaria de marcar", "preciso agendar",
                "posso agendar", "agenda", "disponibilidade", "horarios disponiveis"
            ]
            
            # Verificar presença de palavras-chave
            found_keywords = [kw for kw in scheduling_keywords if kw in message_lower]
            
            # Verificar contexto no histórico
            context_boost = 0.0
            if chat_history:
                # Buscar últimas mensagens do bot no histórico
                for entry in reversed(chat_history[-3:]):  # Últimas 3 mensagens
                    bot_message = ""
                    if isinstance(entry, dict) and entry.get("role") == "assistant":
                        bot_message = self._normalize_text(entry.get("content", ""))
                    elif isinstance(entry, list) and len(entry) >= 2:
                        bot_message = self._normalize_text(entry[1] if entry[1] else "")
                    
                    # Se bot perguntou sobre horários/agendamento recentemente, aumentar confiança
                    context_keywords = [
                        "horario", "data", "participantes", "assunto", "reuniao",
                        "agendar", "confirmar", "email", "informacoes"
                    ]
                    if any(kw in bot_message for kw in context_keywords):
                        context_boost = 0.3
                        print(f"🔍 Contexto de agendamento detectado no histórico (boost: +{context_boost})")
                        break
            
            # Só considerar como intenção de agendamento se:
            # 1. Há palavras-chave de agendamento OU
            # 2. Há contexto de agendamento E a mensagem atual tem pelo menos uma palavra-chave relacionada
            if found_keywords:
                # Se há palavras-chave, usar confiança baseada nas palavras-chave + contexto
                confidence = min(0.9, 0.5 + (len(found_keywords) * 0.1) + context_boost)
                return {
                    "has_scheduling_intent": True,
                    "confidence": confidence,
                    "keywords_found": found_keywords,
                    "context_boost": context_boost
                }
            elif context_boost > 0:
                # Se há contexto mas não há palavras-chave, verificar se a mensagem tem palavras relacionadas
                related_keywords = [
                    "sim", "não", "confirmar", "ok", "tudo bem", "perfeito",
                    "horario", "data", "participantes", "email", "whatsapp"
                ]
                has_related_keywords = any(kw in message_lower for kw in related_keywords)
                
                # Verificar se a mensagem é um número de telefone (10-11 dígitos)
                import re
                phone_pattern = r'^[\d\s\(\)\-\+]{10,}$'
                is_phone_number = bool(re.match(phone_pattern, message.strip()))
                
                if has_related_keywords or is_phone_number:
                    confidence = min(0.8, 0.6 + context_boost)
                    return {
                        "has_scheduling_intent": True,
                        "confidence": confidence,
                        "keywords_found": [],
                        "context_boost": context_boost
                    }
            
            return {
                "has_scheduling_intent": False,
                "confidence": 0.0,
                "keywords_found": [],
                "context_boost": 0.0
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar intenção de agendamento: {e}")
            return {
                "has_scheduling_intent": False,
                "confidence": 0.0,
                "keywords_found": []
            }
    
    def _handle_existing_meeting_options(self, existing_meeting: dict, message: str, scheduling_analysis: dict) -> dict:
        """Lida com opções quando já existe uma reunião agendada"""
        try:
            from datetime import datetime
            
            # Formatar data/hora da reunião existente
            start_datetime = existing_meeting['start']
            if 'T' in start_datetime:
                dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
            else:
                formatted_date = start_datetime
            
            response = f"""📅 **Você já possui uma reunião agendada!**

**Reunião atual:**
📅 Data: {formatted_date}
📝 Assunto: {existing_meeting.get('summary', 'Reunião')}

**O que você gostaria de fazer?**

1️⃣ **Alterar horário** - Reagendar para outro dia/horário
2️⃣ **Cancelar reunião** - Cancelar o agendamento atual
3️⃣ **Manter reunião** - Continuar com o agendamento atual
4️⃣ **Receber por email** - Enviar detalhes do agendamento por email

Digite o número da opção desejada (1, 2, 3 ou 4)."""
            
            return {
                "answer": response,
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {
                    "type": "existing_meeting_options",
                    "existing_meeting": existing_meeting
                },
                "scheduling_confidence": scheduling_analysis.get("confidence", 0)
            }
            
        except Exception as e:
            print(f"❌ Erro ao processar opções de reunião existente: {e}")
            return {
                "answer": "❌ Erro ao processar sua reunião existente. Tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _detect_scheduling_continuation(self, message: str, chat_history: list, agent_id: str, whatsapp: str) -> dict:
        """Detecta se usuário está fornecendo email após agendamento ser criado ou após escolher opção 4"""
        try:
            # Verificar se há contexto de agendamento recém criado ou opção 4 selecionada
            waiting_for_email = False
            is_existing_meeting_email = False
            
            if chat_history:
                for entry in reversed(chat_history[-2:]):  # Últimas 2 mensagens
                    bot_message = ""
                    if isinstance(entry, dict) and entry.get("role") == "assistant":
                        bot_message = entry.get("content", "")
                    elif isinstance(entry, list) and len(entry) >= 2:
                        bot_message = entry[1] if entry[1] else ""
                    
                    # Verificar se bot acabou de confirmar agendamento e está pedindo email opcional
                    if ("Agendamento Confirmado" in bot_message or "Agendamento agendado" in bot_message) and \
                       ("Deseja receber um convite por email" in bot_message or "informar seu endereço de email" in bot_message):
                        waiting_for_email = True
                        print(f"🔍 Bot acabou de criar agendamento e está aguardando email opcional")
                        break
            
                    # Verificar se bot pediu email após opção 4 (reunião existente)
                    if "Receber Detalhes por Email" in bot_message and "informe seu email" in bot_message.lower():
                        waiting_for_email = True
                        is_existing_meeting_email = True
                        print(f"🔍 Bot pediu email para reunião existente (opção 4)")
                        break
            
            if waiting_for_email:
                # Verificar se é um email
                email = None
                if '@' in message and '.' in message:
                    # Extrair email da mensagem
                    import re
                    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
                    emails = re.findall(email_pattern, message)
                    if emails:
                        email = emails[0]
                
                if email:
                    return {
                        "is_continuation": True,
                        "is_confirmation": False,
                        "is_existing_meeting_email": is_existing_meeting_email,
                        "email": email,
                        "selected_time_data": None,
                        "raw_message": message
                    }
            
            return {"is_continuation": False}
            
        except Exception as e:
            print(f"❌ Erro ao detectar continuação de agendamento: {e}")
            return {"is_continuation": False}
    
    def _process_scheduling_continuation(self, continuation_data: dict, calendar_credentials: str, 
                                        calendar_id: str, calendar_duration_minutes: int, 
                                        use_google_meeting: bool, contact_name: str = None,
                                        agent_id: str = None, whatsapp: str = None, 
                                        conversation_id: str = None, account_id: str = None, inbox_id: str = None) -> dict:
        """Processa adição de email após agendamento já ter sido criado ou após escolher opção 4"""
        try:
            email = continuation_data.get("email")
            is_existing_meeting_email = continuation_data.get("is_existing_meeting_email", False)
            
            # Gerar chave única para esta conversa
            if account_id and inbox_id and conversation_id:
                conversation_key = f"{account_id}:{inbox_id}:{conversation_id}"
            else:
                conversation_key = f"{agent_id}:{conversation_id}" if conversation_id else agent_id
            
            # Tentar recuperar WhatsApp do Redis se não estiver disponível
            if not whatsapp and agent_id:
                try:
                    key = f"agent:whatsapp:{conversation_key}"
                    stored_whatsapp = self.redis.get(key)
                    if stored_whatsapp:
                        whatsapp = stored_whatsapp
                        print(f"✅ WhatsApp recuperado do Redis em _process_scheduling_continuation: {key} = {whatsapp}")
                except Exception as e:
                    print(f"⚠️ Erro ao recuperar WhatsApp do Redis: {e}")
            
            if not email:
                return {
                    "answer": "❌ Não consegui identificar seu email. Por favor, informe um email válido.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Se é email para reunião existente, buscar informações da reunião
            if is_existing_meeting_email:
                return self._send_email_for_existing_meeting(email, agent_id, whatsapp, calendar_credentials, calendar_id, contact_name, conversation_id, meeting=None, meeting_id=None, account_id=account_id, inbox_id=inbox_id)
            
            # Caso contrário, é email para evento recém criado
            # Buscar event_id do último evento criado do Redis
            event_id = None
            event_info = None
            
            # Garantir que temos WhatsApp antes de buscar no Redis
            if not whatsapp and agent_id:
                try:
                    key = f"agent:whatsapp:{conversation_key}"
                    stored_whatsapp = self.redis.get(key)
                    if stored_whatsapp:
                        whatsapp = stored_whatsapp
                        print(f"✅ WhatsApp recuperado do Redis para buscar evento: {key} = {whatsapp}")
                except Exception as e:
                    print(f"⚠️ Erro ao recuperar WhatsApp do Redis: {e}")
            
            if agent_id and whatsapp:
                try:
                    import json
                    key = f"agent:last_event:{agent_id}:{whatsapp}"
                    event_data = self.redis.get(key)
                    if event_data:
                        event_info = json.loads(event_data)
                        event_id = event_info.get("event_id")
                        print(f"✅ Event ID encontrado no Redis: {event_id}")
                except Exception as e:
                    print(f"⚠️ Erro ao buscar event_id do Redis: {e}")
            
            if not event_id:
                return {
                    "answer": "❌ Não encontrei o agendamento para adicionar o email. Por favor, crie um novo agendamento.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Processar email - tentar Google Calendar primeiro, fallback para SMTP
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            
            email_sent = False
            email_error = None
            
            # Tentar adicionar participante ao evento (só funciona com Google Workspace)
            try:
                attendees_result = calendar_service.add_attendees(event_id, [email])
                if attendees_result.get('success', False):
                    email_sent = True
                    print(f"✅ Email enviado via Google Calendar para {email}")
                else:
                    print(f"⚠️ Google Calendar não conseguiu enviar email (possivelmente não é Google Workspace)")
                    email_error = attendees_result.get('error', 'Erro desconhecido')
            except Exception as e:
                print(f"⚠️ Erro ao tentar adicionar participante: {e}")
                email_error = str(e)
            
            # Se Google Calendar falhou, tentar SMTP como fallback
            if not email_sent:
                email_service = EmailService()
                if email_service.is_available():
                    print(f"📧 Tentando enviar email via SMTP como fallback...")
                    
                    # Buscar informações do evento para gerar email
                    try:
                        if event_info:
                            from datetime import datetime
                            start_datetime = datetime.fromisoformat(event_info.get("start_datetime"))
                            end_datetime = datetime.fromisoformat(event_info.get("end_datetime"))
                            description = event_info.get("description", "")
                            participant_name = event_info.get("participant_name", "Cliente")
                            
                            email_result = email_service.send_appointment_invite(
                                to_email=email,
                                subject=event_info.get("subject", "Reunião Agendada pela IA"),
                                start_datetime=start_datetime,
                                end_datetime=end_datetime,
                                description=description,
                                location="",
                                participant_name=participant_name,
                                ics_content=None  # Poderia gerar ICS aqui se necessário
                            )
                            
                            if email_result.get('success', False):
                                email_sent = True
                                print(f"✅ Email enviado via SMTP para {email}")
                            else:
                                email_error = email_result.get('error', 'Erro desconhecido')
                                print(f"❌ Erro ao enviar email via SMTP: {email_error}")
                    except Exception as e:
                        print(f"⚠️ Erro ao enviar email via SMTP: {e}")
                        email_error = str(e)
            
            # Montar resposta
            if email_sent:
                response = f"""✅ **Email Registrado!**

Seu email **{email}** foi registrado com sucesso!

Você receberá um convite por email com os detalhes do agendamento em breve.

Obrigado! 😊"""
            else:
                response = f"""⚠️ **Email Registrado**

Recebi seu email **{email}**, mas não foi possível enviar o convite automaticamente.

Seu agendamento já está confirmado e registrado. Entre em contato conosco se precisar dos detalhes do agendamento."""
                if email_error:
                    print(f"⚠️ Erro no envio de email: {email_error}")
            
            return {
                "answer": response,
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {
                    "type": "email_added",
                    "email": email,
                    "email_sent": email_sent
                },
                "scheduling_confidence": 0.9
            }
            
        except Exception as e:
            print(f"❌ Erro ao processar email: {e}")
            import traceback
            traceback.print_exc()
            return {
                "answer": f"❌ Erro ao processar seu email: {str(e)}. Por favor, tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _send_email_for_existing_meeting(self, email: str, agent_id: str, whatsapp: str,
                                        calendar_credentials: str, calendar_id: str,
                                        contact_name: str = None, conversation_id: str = None,
                                        meeting: dict = None, meeting_id: str = None,
                                        account_id: str = None, inbox_id: str = None) -> dict:
        """Envia email com detalhes de uma reunião existente"""
        try:
            import json
            from datetime import datetime
            from google_calendar_service import GoogleCalendarService
            
            # Gerar chave única para esta conversa
            if account_id and inbox_id and conversation_id:
                conversation_key = f"{account_id}:{inbox_id}:{conversation_id}"
            else:
                conversation_key = f"{agent_id}:{conversation_id}" if conversation_id else agent_id
            
            # Tentar recuperar WhatsApp do Redis se não estiver disponível
            if not whatsapp and agent_id:
                try:
                    key = f"agent:whatsapp:{conversation_key}"
                    stored_whatsapp = self.redis.get(key)
                    if stored_whatsapp:
                        whatsapp = stored_whatsapp.decode('utf-8') if isinstance(stored_whatsapp, bytes) else stored_whatsapp
                        print(f"✅ WhatsApp recuperado do Redis para envio de email: {key} = {whatsapp}")
                except Exception as e:
                    print(f"⚠️ Erro ao recuperar WhatsApp do Redis: {e}")
            
            # Buscar informações da reunião
            if not agent_id or not whatsapp:
                return {
                    "answer": "❌ Erro: Informações insuficientes para processar email (WhatsApp não encontrado).",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Preferir dados recebidos diretamente
            if not meeting or not meeting_id:
                # Tentar Redis (fluxo quando pedimos email ao usuário)
                key = f"agent:existing_meeting_email:{conversation_key}:{whatsapp}"
                meeting_data_json = self.redis.get(key)
                if meeting_data_json:
                    meeting_info = json.loads(meeting_data_json.decode('utf-8') if isinstance(meeting_data_json, bytes) else meeting_data_json)
                    meeting = meeting or meeting_info.get("meeting")
                    meeting_id = meeting_id or meeting_info.get("meeting_id")
            
            # Se ainda não tem, buscar reuniões existentes
            if not meeting or not meeting_id:
                existing = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
                if existing and len(existing) > 0:
                    meeting = existing[0]
                    meeting_id = meeting.get('id')
            
            # Se continuar sem dados, abortar com instrução ao usuário
            if not meeting or not meeting_id:
                return {
                    "answer": "❌ Não encontrei as informações da reunião. Por favor, consulte suas reuniões novamente.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            if not meeting or not meeting_id:
                return {
                    "answer": "❌ Erro: Informações da reunião incompletas.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Extrair informações da reunião
            meeting_start = meeting.get('start', '')
            meeting_end = meeting.get('end', '')
            meeting_summary = meeting.get('summary', 'Reunião Agendada pela IA')
            meeting_description = meeting.get('description', '')
            
            # Formatar datas
            try:
                if isinstance(meeting_start, dict):
                    start_str = meeting_start.get('dateTime', '')
                else:
                    start_str = meeting_start
                
                if isinstance(meeting_end, dict):
                    end_str = meeting_end.get('dateTime', '')
                else:
                    end_str = meeting_end
                
                start_datetime = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                end_datetime = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
            except Exception as e:
                print(f"❌ Erro ao parsear datas: {e}")
                return {
                    "answer": "❌ Erro ao processar informações da reunião. Por favor, tente novamente.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            participant_name = contact_name if contact_name else "Cliente"
            
            # Tentar enviar via Google Calendar primeiro
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            email_sent = False
            email_error = None
            
            # Tentar adicionar participante ao evento existente
            try:
                attendees_result = calendar_service.add_attendees(meeting_id, [email])
                if attendees_result.get('success', False):
                    email_sent = True
                    print(f"✅ Email enviado via Google Calendar para {email}")
                else:
                    print(f"⚠️ Google Calendar não conseguiu enviar email (possivelmente não é Google Workspace)")
                    email_error = attendees_result.get('error', 'Erro desconhecido')
            except Exception as e:
                print(f"⚠️ Erro ao tentar adicionar participante: {e}")
                email_error = str(e)
            
            # Se Google Calendar falhou, tentar SMTP como fallback
            if not email_sent:
                email_service = EmailService()
                if email_service.is_available():
                    print(f"📧 Tentando enviar email via SMTP como fallback...")
                    
                    # Gerar arquivo .ics
                    ics_content = None
                    try:
                        event_data = {
                            'summary': meeting_summary,
                            'description': meeting_description,
                            'location': '',
                            'start': {
                                'dateTime': start_datetime.isoformat()
                            },
                            'end': {
                                'dateTime': end_datetime.isoformat()
                            }
                        }
                        ics_content = calendar_service.generate_ics_file(event_data, None)
                        if ics_content:
                            print(f"✅ Arquivo ICS gerado com sucesso")
                        else:
                            print(f"⚠️ Falha ao gerar arquivo ICS")
                    except Exception as e:
                        print(f"⚠️ Erro ao gerar arquivo ICS: {e}")
                    
                    email_result = email_service.send_appointment_invite(
                        to_email=email,
                        subject=meeting_summary,
                        start_datetime=start_datetime,
                        end_datetime=end_datetime,
                        description=meeting_description,
                        location="",
                        participant_name=participant_name,
                        ics_content=ics_content
                    )
                    
                    if email_result.get('success', False):
                        email_sent = True
                        print(f"✅ Email enviado via SMTP para {email}")
                    else:
                        email_error = email_result.get('error', 'Erro desconhecido')
                        print(f"❌ Erro ao enviar email via SMTP: {email_error}")
                else:
                    email_error = "Serviço de email não configurado"
            
            # Montar resposta
            formatted_date = start_datetime.strftime('%d/%m/%Y às %H:%M')
            formatted_end = end_datetime.strftime('%H:%M')
            duration_minutes = int((end_datetime - start_datetime).total_seconds() / 60)
            
            if email_sent:
                response = f"""✅ **Email Enviado!**

Os detalhes do seu agendamento foram enviados para **{email}**!

**Resumo do agendamento:**
📅 **Data/Hora:** {formatted_date} - {formatted_end}
⏰ **Duração:** {duration_minutes} minutos
✏️ **Assunto:** {meeting_summary}

Você receberá um convite por email com todos os detalhes em breve.

Obrigado! 😊"""
            else:
                response = f"""⚠️ **Email Registrado**

Recebi seu email **{email}**, mas não foi possível enviar o convite automaticamente.

**Detalhes do seu agendamento:**
📅 **Data/Hora:** {formatted_date} - {formatted_end}
⏰ **Duração:** {duration_minutes} minutos
✏️ **Assunto:** {meeting_summary}

Entre em contato conosco se precisar de mais informações."""
                if email_error:
                    print(f"⚠️ Erro no envio de email: {email_error}")
            
            return {
                "answer": response,
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {
                    "type": "email_sent_existing_meeting",
                    "email": email,
                    "email_sent": email_sent,
                    "meeting_id": meeting_id
                },
                "scheduling_confidence": 0.9
            }
            
        except Exception as e:
            print(f"❌ Erro ao enviar email para reunião existente: {e}")
            import traceback
            traceback.print_exc()
            return {
                "answer": f"❌ Erro ao processar seu email: {str(e)}. Por favor, tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _suggest_random_available_times(self, agent_id: str, calendar_credentials: str, calendar_id: str,
                                      calendar_start_hour: int, calendar_end_hour: int, calendar_workdays: str,
                                      calendar_duration_minutes: int, whatsapp: str, message: str) -> dict:
        """Sugere 3 horários aleatórios disponíveis em dias diferentes"""
        try:
            from datetime import datetime, timedelta
            import random
            
            print(f"🔍 Gerando 3 horários aleatórios disponíveis...")
            
            # Converter workdays para lista de inteiros
            workdays = [int(d) for d in calendar_workdays.split(',')]
            
            # Gerar 3 dias diferentes (próximos 7 dias)
            suggested_times = []
            attempts = 0
            max_attempts = 20
            
            while len(suggested_times) < 3 and attempts < max_attempts:
                attempts += 1
                
                # Escolher dia aleatório (1-7 dias no futuro)
                days_ahead = random.randint(1, 7)
                target_date = datetime.now() + timedelta(days=days_ahead)
                
                # Verificar se é dia útil
                if target_date.weekday() + 1 in workdays:  # weekday() retorna 0-6, workdays usa 1-7
                    
                    # Gerar horário aleatório dentro do horário comercial
                    hour = random.randint(calendar_start_hour, calendar_end_hour - 1)
                    minute = random.choice([0, 15, 30, 45])  # Horários mais "redondos"
                    
                    # Criar datetime completo
                    suggested_datetime = target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    
                    # Verificar se o horário está disponível
                    if self._is_time_available(suggested_datetime, calendar_credentials, calendar_id, calendar_duration_minutes):
                        # Formatar para exibição
                        formatted_time = suggested_datetime.strftime('%d/%m/%Y às %H:%M')
                        
                        # Evitar duplicatas
                        if formatted_time not in [t['formatted'] for t in suggested_times]:
                            suggested_times.append({
                                'datetime': suggested_datetime,
                                'formatted': formatted_time,
                                'day_name': self._get_day_name(target_date.weekday())
                            })
            
            if suggested_times:
                # Ordenar por data/hora
                suggested_times.sort(key=lambda x: x['datetime'])
                
                response = f"""📅 **Horários Disponíveis para Agendamento**

Encontrei {len(suggested_times)} horário(s) disponível(is) para você:

"""
                for i, time_info in enumerate(suggested_times, 1):
                    response += f"{i}️⃣ **{time_info['day_name']}, {time_info['formatted']}**\n"
                
                response += f"""
**Para confirmar um horário, digite o número da opção (1, 2 ou 3).**

Ou se preferir, me informe uma data/hora específica e verificarei a disponibilidade! 😊"""
                
                # Armazenar horários sugeridos no Redis para recuperar quando usuário escolher
                self._set_last_suggested_times(agent_id, whatsapp, suggested_times)
                
                return {
                    "answer": response,
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {
                        "type": "suggested_times",
                        "suggested_times": suggested_times,
                        "whatsapp": whatsapp
                    },
                    "scheduling_confidence": 0.9
                }
            else:
                # Fallback se não conseguir gerar horários
                return {
                    "answer": """📅 **Agendamento**

Entendi que você gostaria de agendar uma reunião!

Infelizmente, não consegui encontrar horários disponíveis automaticamente nos próximos dias.

**Por favor, me informe:**
• Uma data específica (ex: "amanhã", "segunda-feira", "15/12")
• Um horário preferido (ex: "manhã", "tarde", "14h")

Assim poderei verificar a disponibilidade e confirmar seu agendamento! 😊""",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "manual_scheduling_request"},
                    "scheduling_confidence": 0.8
                }
                
        except Exception as e:
            print(f"❌ Erro ao gerar horários sugeridos: {e}")
            return {
                "answer": """📅 **Agendamento**

Entendi que você gostaria de agendar uma reunião!

Por favor, me informe uma data e horário específicos para que eu possa verificar a disponibilidade e confirmar seu agendamento.

Exemplos:
• "Amanhã às 14h"
• "Segunda-feira de manhã"
• "15/12 às 16:30"

Estou aqui para ajudar! 😊""",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "fallback_scheduling"},
                "scheduling_confidence": 0.7
            }
    
    def _is_time_available(self, datetime_obj: datetime, calendar_credentials: str, calendar_id: str, duration_minutes: int) -> bool:
        """Verifica se um horário específico está disponível"""
        try:
            from google_calendar_service import GoogleCalendarService
            
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            
            # Verificar conflitos no horário
            end_time = datetime_obj + timedelta(minutes=duration_minutes)
            
            # Usar método check_availability que já existe
            availability_result = calendar_service.check_availability(datetime_obj, end_time)
            
            # Se não há conflitos, está disponível
            return availability_result.get("available", True)
            
        except Exception as e:
            print(f"❌ Erro ao verificar disponibilidade: {e}")
            return True  # Em caso de erro, assumir disponível
    
    def _get_day_name(self, weekday: int) -> str:
        """Retorna nome do dia da semana em português"""
        days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
        return days[weekday]
    
    def _normalize_text(self, text: str) -> str:
        """Normaliza texto removendo acentos e convertendo para minúsculas"""
        try:
            # Remove acentos
            text = unicodedata.normalize('NFD', text)
            text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
            # Converte para minúsculas
            return text.lower()
        except:
            return text.lower()
    
    def _normalize_whatsapp_number(self, whatsapp: str) -> str:
        """Normaliza número de WhatsApp para formato 55numero (sem caracteres especiais)"""
        try:
            # Tratar None ou valores vazios
            if not whatsapp:
                return None
            
            import re
            # Remove tudo exceto dígitos
            digits_only = re.sub(r'[^\d]', '', str(whatsapp))
            
            # Se não tem dígitos suficientes, retornar None
            if not digits_only or len(digits_only) < 10:
                return None
            
            # Se já começa com 55, retornar como está
            if digits_only.startswith('55'):
                return digits_only
            
            # Se tem 10 ou 11 dígitos (DDD + número), adicionar 55 na frente
            if len(digits_only) == 10 or len(digits_only) == 11:
                return f"55{digits_only}"
            
            # Se tem mais de 11 dígitos mas não começa com 55, assumir que já tem código do país
            return digits_only
            
        except Exception as e:
            print(f"❌ Erro ao normalizar WhatsApp: {e}")
            return None
    
    def _is_random_name(self, name: str) -> bool:
        """Detecta se um nome é aleatório (padrão XXXX-XXXX-XXX)"""
        if not name:
            return False
        
        import re
        # Padrão comum de nomes aleatórios: Palavra-Palavra-Número
        # Exemplos: "Twilight-Darkness-410", "Fragrant-Sun-696"
        pattern = r'^[A-Za-z]+-[A-Za-z]+-\d+$'
        return bool(re.match(pattern, name))

    def _bot_recently_asked_for_name(self, chat_history: list) -> bool:
        """Retorna True se a última resposta do bot pediu o nome (para aceitar nome único)."""
        try:
            if not chat_history:
                return False
            # Percorrer do fim para o início e encontrar a última mensagem do bot
            for entry in reversed(chat_history):
                # chat_history pode ser lista de dicts ou pares; consideramos string do bot
                bot_text = None
                if isinstance(entry, dict):
                    if entry.get('role') == 'assistant':
                        bot_text = entry.get('content')
                elif isinstance(entry, list) and len(entry) >= 2:
                    # formato [user, bot] nos históricos antigos
                    bot_text = entry[1]
                if not bot_text:
                    continue
                text = str(bot_text).lower()
                if 'informar seu nome' in text or 'digite seu nome' in text or 'seu nome e sobrenome' in text:
                    return True
                # Só checar a última mensagem do bot
                break
            return False
        except Exception:
            return False
    
    def _message_contains_name(self, message: str, allow_single_word: bool = False) -> bool:
        """Verifica se a mensagem contém um nome real (tolerante a pontuação).
        Regras:
        - Ignora saudações simples ("oi", "olá", "hello", etc.).
        - Para entradas sem prefixo (apenas o nome), exige pelo menos 2 palavras com letras.
        - Não aceita nomes contendo dígitos ou padrões aleatórios.
        """
        if not message:
            return False
        
        import re
        greetings = {
            'oi', 'olá', 'ola', 'hello', 'hi', 'hey', 
            'bom dia', 'boa tarde', 'boa noite'
        }
        # Limpar pontuações comuns do início/fim e no meio (retendo letras e espaços)
        cleaned = re.sub(r'[^A-Za-zÀ-ÿ\s]', ' ', message).strip()
        cleaned = re.sub(r'\s+', ' ', cleaned)
        if cleaned.lower() in greetings:
            return False
        
        # Procurar por padrões que indicam um nome
        name_patterns = [
            r'(?:meu nome é|sou o|sou a|me chamo|sou)\s+([A-Za-zÀ-ÿ\s]{2,50})',
            r'(?:nome|chamo)\s+([A-Za-zÀ-ÿ\s]{2,50})',
            r'^([A-Za-zÀ-ÿ\s]{2,50})$'  # Apenas nome sem prefixo
        ]
        
        for i, pattern in enumerate(name_patterns):
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if match:
                candidate = match.group(1).strip()
                # Validar palavras
                words = [w for w in candidate.split(' ') if w]
                if i == 2 and (not allow_single_word) and len(words) < 2:
                    # Para o caso "apenas nome", exigir pelo menos nome e sobrenome
                    continue
                if re.search(r'\d', candidate):
                    continue
                if self._is_random_name(candidate):
                    continue
                return True
        
        return False
    
    def _extract_name_from_message(self, message: str, allow_single_word: bool = False) -> str:
        """Extrai nome real da mensagem (tolerante a pontuação) seguindo as mesmas regras de validação."""
        if not message:
            return None
        
        import re
        greetings = {
            'oi', 'olá', 'ola', 'hello', 'hi', 'hey', 
            'bom dia', 'boa tarde', 'boa noite'
        }
        cleaned = re.sub(r'[^A-Za-zÀ-ÿ\s]', ' ', message).strip()
        cleaned = re.sub(r'\s+', ' ', cleaned)
        if cleaned.lower() in greetings:
            return None
        
        # Padrões para extrair nome
        patterns = [
            r'(?:meu nome é|sou o|sou a|me chamo|sou)\s+([A-Za-zÀ-ÿ\s]{2,50})',
            r'(?:nome|chamo)\s+([A-Za-zÀ-ÿ\s]{2,50})',
            r'^([A-Za-zÀ-ÿ\s]{2,50})$'  # Apenas nome sem prefixo
        ]
        
        for i, pattern in enumerate(patterns):
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if match:
                name = match.group(1).strip()
                # Validar se parece com um nome real (não muito curto, não contém números)
                words = [w for w in name.split(' ') if w]
                if i == 2 and (not allow_single_word) and len(words) < 2:
                    continue
                if len(name) >= 2 and len(words) >= 1 and not re.search(r'\d', name) and not self._is_random_name(name):
                    return name.title()
        
        return None
    
    def _detect_whatsapp_in_message(self, message: str) -> str:
        """Detecta número de WhatsApp na mensagem usando regex"""
        try:
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
                    # Limpar e normalizar o número
                    number = re.sub(r'[^\d]', '', matches[0])  # Remove tudo exceto dígitos
                    if len(number) >= 10:  # Número válido
                        normalized = self._normalize_whatsapp_number(number)
                        if normalized:
                            return normalized
                        
            return None
        except Exception as e:
            print(f"❌ Erro ao detectar WhatsApp: {e}")
            return None
    
    def _detect_meeting_query_intent_improved(self, message: str) -> dict:
        """Detecta intenção de consultar reuniões existentes"""
        try:
            message_lower = self._normalize_text(message)
            
            # Palavras-chave para consulta de reuniões
            query_keywords = [
                "minhas reunioes", "consultar reuniao", "verificar reuniao", 
                "listar reunioes", "quais reunioes", "tenho reuniao", 
                "reuniao agendada", "agendamento existente", "mostrar reunioes",
                "reunioes futuras", "proximas reunioes", "consultar agendamento",
                "ver agendamento", "meu agendamento", "reuniao marcada",
                "consulta agendada", "horarios", "tenho consulta",
                "consulta marcada", "consulta agendada", "minhas consultas",
                "meus horarios", "agendamentos futuros", "proximos agendamentos"
            ]
            
            # Verificar se contém palavras-chave de consulta
            found_keywords = [kw for kw in query_keywords if kw in message_lower]
            
            if found_keywords:
                confidence = min(0.9, 0.6 + (len(found_keywords) * 0.1))
                return {
                    "has_query_intent": True,
                    "confidence": confidence,
                    "keywords_found": found_keywords
                }
            
            return {
                "has_query_intent": False,
                "confidence": 0.0,
                "keywords_found": []
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar intenção de consulta: {e}")
            return {"has_query_intent": False, "confidence": 0.0}
    
    def _detect_time_confirmation(self, message: str, chat_history: list) -> dict:
        """Detecta se a mensagem é uma confirmação de horário (1, 2, 3)"""
        try:
            message_clean = message.strip()
            
            # Verificar se é um número de 1 a 3
            if message_clean in ['1', '2', '3']:
                # Verificar se há histórico de sugestões de horários
                if chat_history:
                    last_bot_message = ""
                    for entry in reversed(chat_history):
                        if isinstance(entry, list) and len(entry) >= 2:
                            last_bot_message = entry[1] if entry[1] else ""
                            break
                    
                    # Verificar se a última mensagem do bot continha sugestões de horários
                    if "Horários Disponíveis para Agendamento" in last_bot_message and "1️⃣" in last_bot_message:
                        return {
                            "is_confirmation": True,
                            "selected_option": int(message_clean),
                            "confidence": 0.9
                        }
            
            return {
                "is_confirmation": False,
                "selected_option": None,
                "confidence": 0.0
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar confirmação de horário: {e}")
            return {"is_confirmation": False, "selected_option": None, "confidence": 0.0}
    
    def _process_time_confirmation(self, confirmation_response: dict, agent_id: str, calendar_credentials: str, 
                                 calendar_id: str, calendar_start_hour: int, calendar_end_hour: int,
                                 calendar_workdays: str, calendar_duration_minutes: int, whatsapp: str,
                                 use_google_meeting: bool) -> dict:
        """Processa confirmação de horário e cria a reunião"""
        try:
            selected_option = confirmation_response.get("selected_option")
            
            if not selected_option or selected_option not in [1, 2, 3]:
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha 1, 2 ou 3.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            # Buscar horários sugeridos do Redis
            import redis
            import json
            from datetime import datetime
            
            redis_client = redis.Redis(host='redis-dev', port=6379, db=0, decode_responses=True, password='invoAI@76925')
            suggested_times_key = f"agent:last_suggested_times:{agent_id}:{whatsapp}"
            suggested_times_data = redis_client.get(suggested_times_key)
            
            if not suggested_times_data:
                return {
                    "answer": "❌ Não encontrei os horários sugeridos. Por favor, solicite novos horários.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "no_suggested_times"},
                    "scheduling_confidence": 0
                }
            
            suggested_times_data_parsed = json.loads(suggested_times_data)
            print(f"🔍 DEBUG - suggested_times_data_parsed: {suggested_times_data_parsed}")
            
            # Extrair o array de horários sugeridos
            if isinstance(suggested_times_data_parsed, dict) and 'suggested_times' in suggested_times_data_parsed:
                suggested_times = suggested_times_data_parsed['suggested_times']
            else:
                suggested_times = suggested_times_data_parsed
            
            print(f"🔍 DEBUG - suggested_times extraído: {suggested_times}")
            print(f"🔍 DEBUG - selected_option: {selected_option}")
            print(f"🔍 DEBUG - len(suggested_times): {len(suggested_times) if suggested_times else 'None'}")
            
            if not suggested_times or len(suggested_times) < selected_option:
                print(f"❌ DEBUG - Condição falhou: not suggested_times={not suggested_times}, len < selected_option={len(suggested_times) if suggested_times else 0} < {selected_option}")
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha uma opção válida.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            # Obter o horário selecionado (selected_option é 1, 2 ou 3, então índice é 0, 1 ou 2)
            selected_index = selected_option - 1
            print(f"🔍 DEBUG - selected_index: {selected_index}")
            
            if selected_index >= len(suggested_times):
                print(f"❌ DEBUG - selected_index >= len: {selected_index} >= {len(suggested_times)}")
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha uma opção válida.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            selected_time = suggested_times[selected_index]
            print(f"🔍 DEBUG - selected_time: {selected_time}")
            target_datetime = datetime.fromisoformat(selected_time['datetime'].replace('Z', '+00:00'))
            
            # Criar reunião usando GoogleCalendarService
            from google_calendar_service import GoogleCalendarService
            from datetime import timedelta
            
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            
            # Criar evento
            end_datetime = target_datetime + timedelta(minutes=calendar_duration_minutes)
            
            # Normalizar WhatsApp antes de salvar
            normalized_whatsapp = self._normalize_whatsapp_number(whatsapp) if whatsapp else 'N/A'
            
            description = f"""Tipo: Reunião
Duração: {calendar_duration_minutes} minutos
Participantes: Cliente
Assunto: Reunião Agendada pela IA

Agendado via InovAI Analytics

<!-- METADATA_START -->
WHATSAPP: {normalized_whatsapp}
<!-- METADATA_END -->"""
            
            # Criar evento
            created_event = calendar_service.create_event(
                summary='Reunião Agendada pela IA',
                start_datetime=target_datetime,
                end_datetime=end_datetime,
                description=description,
                use_google_meeting=use_google_meeting
            )
            
            if created_event.get('success', False):
                # Gerar arquivo .ics
                ics_content = None
                ics_filename = None
                
                try:
                    # Criar objeto event_data no formato esperado pela função generate_ics_file
                    event_data = {
                        'summary': created_event.get('summary', 'Reunião Agendada pela IA'),
                        'description': description,
                        'location': '',
                        'start': {
                            'dateTime': created_event.get('start_time', target_datetime.isoformat())
                        },
                        'end': {
                            'dateTime': created_event.get('end_time', end_datetime.isoformat())
                        }
                    }
                    
                    meet_link = created_event.get('meet_link')
                    ics_content = calendar_service.generate_ics_file(event_data, meet_link)
                    
                    ics_filename = f"reuniao_{target_datetime.strftime('%Y%m%d_%H%M')}.ics"
                    print(f"📎 Arquivo ICS gerado: {ics_filename}")
                except Exception as e:
                    print(f"⚠️ Erro ao gerar arquivo ICS: {e}")
                    ics_content = None
                
                # Limpar horários sugeridos do Redis
                redis_client.delete(suggested_times_key)
                
                response_message = f"""✅ **Reunião Agendada com Sucesso!**

📅 **Data:** {target_datetime.strftime('%d/%m/%Y às %H:%M')}
⏰ **Duração:** {calendar_duration_minutes} minutos
📱 **WhatsApp:** {whatsapp}

**Detalhes da reunião:**
• Tipo: Reunião
• Assunto: Reunião Agendada pela IA
• Participantes: Cliente

Sua reunião foi confirmada no calendário! Você receberá um email de confirmação em breve.

Obrigado por escolher nossos serviços! 😊"""
                
                result = {
                    "answer": response_message,
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "meeting_created"},
                    "scheduling_confidence": 0.9
                }
                
                # Adicionar arquivo ICS se foi gerado
                if ics_content:
                    result["ics_content"] = ics_content
                    result["ics_filename"] = ics_filename
                    print(f"📎 Arquivo ICS adicionado à resposta: {ics_filename}")
                
                return result
            else:
                error_msg = created_event.get('error', 'Erro desconhecido')
                print(f"❌ Erro ao criar evento no Google Calendar: {error_msg}")
                return {
                    "answer": f"❌ Erro ao criar reunião: {error_msg}",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "creation_error"},
                    "scheduling_confidence": 0
                }
            
        except Exception as e:
            print(f"❌ Erro ao processar confirmação de horário: {e}")
            import traceback
            traceback.print_exc()
            return {
                "answer": f"❌ Erro ao processar agendamento: {str(e)}. Tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _detect_meeting_option(self, message: str, chat_history: list) -> dict:
        """Detecta se a mensagem é uma opção de reunião existente (1, 2, 3)"""
        try:
            message_clean = message.strip()
            print(f"🔍 DEBUG - Detectando opção de reunião:")
            print(f"   Mensagem: '{message_clean}'")
            print(f"   É número 1-4: {message_clean in ['1', '2', '3', '4']}")
            
            # Verificar se é um número de 1 a 4
            if message_clean in ['1', '2', '3', '4']:
                # Verificar se há histórico de opções de reuniões
                if chat_history:
                    last_bot_message = ""
                    for entry in reversed(chat_history):
                        # Suportar ambos os formatos: dict e list
                        if isinstance(entry, dict):
                            if entry.get("role") == "assistant" and entry.get("content"):
                                last_bot_message = entry.get("content", "")
                                break
                        elif isinstance(entry, list) and len(entry) >= 2:
                            last_bot_message = entry[1] if entry[1] else ""
                            break
                    
                    print(f"   Última mensagem do bot (primeiros 100 chars): '{last_bot_message[:100]}...'")
                    print(f"   Tamanho total da mensagem: {len(last_bot_message)} caracteres")
                    
                    # Verificar se a última mensagem do bot continha opções de reuniões
                    # CENÁRIO 1: Gerenciamento de reunião existente (alterar, cancelar, manter)
                    has_question = ("O que você gostaria de fazer?" in last_bot_message or "Opções disponíveis:" in last_bot_message)
                    has_option1 = ("1️⃣" in last_bot_message or "1" in last_bot_message)
                    has_alterar = ("Alterar horário" in last_bot_message or "alterar horário" in last_bot_message or "Alterar" in last_bot_message)
                    has_option2 = ("2️⃣" in last_bot_message or "2" in last_bot_message)
                    has_cancelar = ("Cancelar" in last_bot_message or "cancelar" in last_bot_message)
                    has_option3 = ("3️⃣" in last_bot_message or "3" in last_bot_message)
                    has_manter = ("Manter" in last_bot_message or "manter" in last_bot_message)
                    has_option4 = ("4️⃣" in last_bot_message or "4" in last_bot_message)
                    has_email = ("Receber por email" in last_bot_message or "receber por email" in last_bot_message or "enviar detalhes" in last_bot_message)
                    
                    # CENÁRIO 2: Seleção de horário disponível para nova reunião
                    has_horarios_disponiveis = ("Horários Disponíveis" in last_bot_message or "horários disponíveis" in last_bot_message or "horário(s) disponível" in last_bot_message)
                    has_multiple_options = has_option1 and has_option2 and has_option3  # Tem pelo menos 3 opções numeradas
                    
                    print(f"   Tem pergunta: {has_question}")
                    print(f"   Tem opção 1: {has_option1}")
                    print(f"   Tem 'alterar': {has_alterar}")
                    print(f"   Tem opção 2: {has_option2}")
                    print(f"   Tem 'cancelar': {has_cancelar}")
                    print(f"   Tem opção 3: {has_option3}")
                    print(f"   Tem 'manter': {has_manter}")
                    print(f"   Tem 'horários disponíveis': {has_horarios_disponiveis}")
                    
                    # Aceitar se for gerenciamento de reunião OU seleção de horário disponível
                    is_meeting_management = (has_question and has_option1 and has_alterar and has_option2 and has_cancelar and has_option3 and has_manter)
                    is_meeting_management_with_email = (has_question and has_option1 and has_alterar and has_option2 and has_cancelar and has_option3 and has_manter and has_option4 and has_email)
                    is_time_selection = (has_horarios_disponiveis and has_multiple_options)
                    
                    if is_meeting_management or is_meeting_management_with_email or is_time_selection:
                        if is_meeting_management:
                            print(f"   ✅ Gerenciamento de reunião detectado!")
                        if is_time_selection:
                            print(f"   ✅ Seleção de horário disponível detectada!")
                        selected_option = int(message_clean)
                        # Validar se é uma opção válida (1-4 para reunião existente, 1-3 para seleção de horário)
                        if is_meeting_management_with_email and selected_option in [1, 2, 3, 4]:
                            return {
                                "is_meeting_option": True,
                                "selected_option": selected_option,
                                "confidence": 0.9
                            }
                        elif is_meeting_management and selected_option in [1, 2, 3]:
                            return {
                                "is_meeting_option": True,
                                "selected_option": selected_option,
                                "confidence": 0.9
                            }
                        elif is_time_selection and selected_option in [1, 2, 3]:
                            return {
                                "is_meeting_option": True,
                                "selected_option": selected_option,
                                "confidence": 0.9
                            }
                    else:
                        print(f"   ❌ Condições não atendidas para nenhum cenário")
                else:
                    print(f"   ❌ Sem histórico de chat")
            else:
                print(f"   ❌ Não é número 1-4")
            
            return {
                "is_meeting_option": False,
                "selected_option": None,
                "confidence": 0.0
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar opção de reunião: {e}")
            return {"is_meeting_option": False, "selected_option": None, "confidence": 0.0}
    
    def _process_meeting_option(self, option_response: dict, whatsapp: str, calendar_credentials: str, 
                              calendar_id: str, calendar_start_hour: int, calendar_end_hour: int,
                              calendar_workdays: str, calendar_duration_minutes: int, 
                              use_google_meeting: bool, agent_id: str = None, contact_name: str = None, 
                              conversation_id: str = None, account_id: str = None, inbox_id: str = None) -> dict:
        """Processa opção de reunião - pode ser seleção de horário disponível OU gerenciamento de reunião existente"""
        try:
            selected_option = option_response.get("selected_option")
            
            # Gerar chave única para esta conversa
            if account_id and inbox_id and conversation_id:
                conversation_key = f"{account_id}:{inbox_id}:{conversation_id}"
            else:
                conversation_key = f"{agent_id}:{conversation_id}" if conversation_id else agent_id
            
            # Tentar recuperar WhatsApp do Redis se não estiver disponível
            if not whatsapp and agent_id:
                try:
                    key = f"agent:whatsapp:{conversation_key}"
                    stored_whatsapp = self.redis.get(key)
                    if stored_whatsapp:
                        whatsapp = stored_whatsapp.decode('utf-8') if isinstance(stored_whatsapp, bytes) else stored_whatsapp
                        print(f"✅ WhatsApp recuperado do Redis: {key} = {whatsapp}")
                except Exception as e:
                    print(f"⚠️ Erro ao recuperar WhatsApp do Redis: {e}")
            
            if not selected_option or selected_option not in [1, 2, 3, 4]:
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha 1, 2, 3 ou 4.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            
            # PRIMEIRO: Verificar se há reuniões existentes (contexto de gerenciamento de reunião)
            # Se há reuniões existentes E a opção é 4, processar como reunião existente, não como seleção de horário
            existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id) if whatsapp else []
            
            if existing_meetings and selected_option == 4:
                # Se há reunião existente e opção 4, processar como reunião existente diretamente
                print(f"🔍 CENÁRIO: Opção 4 para reunião existente")
                meeting = existing_meetings[0]
                meeting_id = meeting.get('id')
                
                # Verificar se há email nos participantes do evento
                attendees = meeting.get('attendees', [])
                email_from_attendees = None
                
                if attendees and len(attendees) > 0:
                    # Tentar encontrar email válido nos participantes
                    for attendee in attendees:
                        attendee_email = attendee.get('email', '') if isinstance(attendee, dict) else str(attendee)
                        if attendee_email and '@' in attendee_email:
                            email_from_attendees = attendee_email
                            print(f"✅ Email encontrado nos participantes: {email_from_attendees}")
                            break
                
                # Se não encontrou nos participantes, tentar recuperar do Redis (mesma sessão)
                if not email_from_attendees and agent_id:
                    try:
                        email_key = f"agent:email:{conversation_key}"
                        stored_email = self.redis.get(email_key)
                        if stored_email:
                            email_from_attendees = stored_email.decode('utf-8') if isinstance(stored_email, bytes) else stored_email
                            print(f"✅ Email recuperado do Redis da sessão: {email_key} = {email_from_attendees}")
                    except Exception as e:
                        print(f"⚠️ Erro ao recuperar email do Redis: {e}")
                
                # Se encontrou email (participantes ou Redis), enviar automaticamente
                if email_from_attendees:
                    print(f"📧 Email encontrado. Enviando automaticamente...")
                    return self._send_email_for_existing_meeting(
                        email_from_attendees, agent_id, whatsapp, 
                        calendar_credentials, calendar_id, contact_name, conversation_id,
                        meeting=meeting, meeting_id=meeting_id, account_id=account_id, inbox_id=inbox_id
                    )
                
                # Se não encontrou email, pedir ao usuário
                # Salvar informações da reunião no Redis para uso posterior
                if agent_id and whatsapp:
                    try:
                        import json
                        meeting_info = {
                            "meeting_id": meeting_id,
                            "meeting": meeting,
                            "whatsapp": whatsapp
                        }
                        key = f"agent:existing_meeting_email:{conversation_key}:{whatsapp}"
                        self.redis.set(key, json.dumps(meeting_info), ex=60*60)  # Expira em 1 hora
                        print(f"✅ Informações da reunião salvas no Redis para envio de email: {key}")
                    except Exception as e:
                        print(f"⚠️ Erro ao salvar informações da reunião no Redis: {e}")
                
                return {
                    "answer": """📧 **Receber Detalhes por Email**

Perfeito! Para enviar os detalhes do seu agendamento por email, preciso do seu endereço de email.

**Por favor, informe seu email:**

**Exemplo:** joao@email.com

Assim que receber seu email, enviarei os detalhes do agendamento! 😊""",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {
                        "type": "waiting_for_email_existing_meeting",
                        "meeting_id": meeting_id,
                        "meeting": meeting
                    },
                    "scheduling_confidence": 0.9
                }
            
            # Se há reunião existente e a opção é 1, 2 ou 3, processar gerenciamento ANTES de considerar horários sugeridos
            if existing_meetings and selected_option in [1, 2, 3]:
                meeting = existing_meetings[0]
                meeting_id = meeting.get('id')
                
                if selected_option == 1:  # Alterar horário
                    return {
                        "answer": "🔄 **Alterar Horário**\n\nPara reagendar sua reunião, me informe a nova data e horário desejados.\n\n**Exemplo:** \"Quero reagendar para 15/10/2025 às 14:00\"\n\nOu se preferir, posso sugerir novos horários disponíveis. Digite \"sugerir horários\" para ver opções! 😊",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "reschedule_requested", "meeting_id": meeting_id},
                        "scheduling_confidence": 0.9
                    }
                
                if selected_option == 2:  # Cancelar
                    from google_calendar_service import GoogleCalendarService
                    calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
                    cancel_result = calendar_service.delete_event(meeting_id)
                    if cancel_result.get('success', False):
                        return {
                            "answer": "✅ **Reunião Cancelada com Sucesso!**\n\nSua reunião foi cancelada e removida do calendário.\n\nSe precisar agendar uma nova reunião, é só me avisar! 😊",
                            "should_transfer": False,
                            "transfer_reason": None,
                            "has_scheduling_intent": True,
                            "scheduling_info": {"type": "meeting_cancelled", "meeting_id": meeting_id},
                        "scheduling_confidence": 0.9
                    }
                    else:
                        return {
                            "answer": f"❌ Erro ao cancelar reunião: {cancel_result.get('error', 'Erro desconhecido')}",
                            "should_transfer": False,
                            "transfer_reason": None,
                            "has_scheduling_intent": True,
                            "scheduling_info": {"type": "cancellation_error", "meeting_id": meeting_id},
                            "scheduling_confidence": 0
                        }
                
                if selected_option == 3:  # Manter
                    meeting_start = meeting.get('start', '')
                    meeting_summary = meeting.get('summary', 'Reunião')
                    try:
                        from datetime import datetime
                        if meeting_start:
                            if isinstance(meeting_start, dict):
                                meeting_date = meeting_start.get('dateTime', '')
                            else:
                                meeting_date = meeting_start
                        else:
                            meeting_date = ''
                        if meeting_date:
                            dt = datetime.fromisoformat(meeting_date.replace('Z', '+00:00'))
                            formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
                        else:
                            formatted_date = "Data não disponível"
                    except Exception:
                        formatted_date = "Data não disponível"
                    return {
                        "answer": f"✅ **Reunião Mantida!**\n\n📅 **Sua reunião está confirmada:**\n• **Data:** {formatted_date}\n• **Assunto:** {meeting_summary}\n\nTudo certo! Sua reunião permanece agendada conforme planejado.\n\nSe precisar de mais alguma coisa, estou à disposição! 😊",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "meeting_kept", "meeting_id": meeting_id},
                        "scheduling_confidence": 0.9
                    }
            
            # SEGUNDO: Verificar se há horários sugeridos (contexto de seleção de horário disponível)
            # Só processar como seleção de horário se NÃO houver reunião existente ou se a opção não for 4
            suggested_times_data = None
            if agent_id and whatsapp:
                suggested_times_data = self._get_last_suggested_times(agent_id, whatsapp)
            
            if suggested_times_data and suggested_times_data.get("suggested_times") and not (existing_meetings and selected_option in [1, 2, 3]):
                # CENÁRIO 1: Seleção de horário disponível
                print(f"🔍 CENÁRIO: Seleção de horário disponível")
                suggested_times = suggested_times_data["suggested_times"]
                
                # Se selecionou opção 4, mas há horários sugeridos, isso não é válido
                if selected_option == 4:
                    return {
                        "answer": f"❌ Opção inválida. Por favor, escolha entre 1 e {len(suggested_times)} para selecionar um horário.",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "invalid_option"},
                        "scheduling_confidence": 0
                    }
                
                if selected_option <= len(suggested_times):
                    selected_time = suggested_times[selected_option - 1]  # -1 porque lista é 0-indexed
                    print(f"✅ Horário selecionado: {selected_time['formatted']}")
                    
                    # Criar agendamento automaticamente sem precisar de confirmação
                    return self._create_appointment_automatically(
                        selected_time, agent_id, calendar_credentials, calendar_id,
                        calendar_duration_minutes, whatsapp, use_google_meeting, contact_name
                    )
                else:
                    return {
                        "answer": f"❌ Opção inválida. Por favor, escolha entre 1 e {len(suggested_times)}.",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "invalid_option"},
                        "scheduling_confidence": 0
                    }
            
            # TERCEIRO: Buscar reuniões existentes (contexto de gerenciamento de reunião)
            # Se chegou aqui, não há horários sugeridos ativos, então processar como reunião existente
            if not existing_meetings:
                existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
            
            print(f"🔍 DEBUG - Reuniões encontradas: {existing_meetings}")
            print(f"   Tipo: {type(existing_meetings)}")
            print(f"   Tamanho: {len(existing_meetings) if isinstance(existing_meetings, list) else 'N/A'}")
            
            if not existing_meetings:
                return {
                    "answer": "❌ Não encontrei reuniões para processar. Tente consultar suas reuniões novamente.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "no_meetings"},
                    "scheduling_confidence": 0
                }
            
            # Usar a primeira reunião encontrada
            meeting = existing_meetings[0]
            print(f"🔍 DEBUG - Primeira reunião: {meeting}")
            print(f"   Tipo: {type(meeting)}")
            
            meeting_id = meeting.get('id')
            
            if selected_option == 1:  # Alterar horário
                return {
                    "answer": "🔄 **Alterar Horário**\n\nPara reagendar sua reunião, me informe a nova data e horário desejados.\n\n**Exemplo:** \"Quero reagendar para 15/10/2025 às 14:00\"\n\nOu se preferir, posso sugerir novos horários disponíveis. Digite \"sugerir horários\" para ver opções! 😊",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "reschedule_requested"},
                    "scheduling_confidence": 0.9
                }
            
            elif selected_option == 2:  # Cancelar reunião
                from google_calendar_service import GoogleCalendarService
                calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
                
                cancel_result = calendar_service.delete_event(meeting_id)
                
                if cancel_result.get('success', False):
                    return {
                        "answer": "✅ **Reunião Cancelada com Sucesso!**\n\nSua reunião foi cancelada e removida do calendário.\n\nSe precisar agendar uma nova reunião, é só me avisar! 😊",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "meeting_cancelled"},
                        "scheduling_confidence": 0.9
                    }
                else:
                    return {
                        "answer": f"❌ Erro ao cancelar reunião: {cancel_result.get('error', 'Erro desconhecido')}",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "cancellation_error"},
                        "scheduling_confidence": 0
                    }
            
            elif selected_option == 3:  # Manter reunião
                meeting_start = meeting.get('start', '')
                meeting_summary = meeting.get('summary', 'Reunião')
                
                # Formatar data
                try:
                    from datetime import datetime
                    if meeting_start:
                        # meeting_start pode ser string direta ou dicionário
                        if isinstance(meeting_start, dict):
                            meeting_date = meeting_start.get('dateTime', '')
                        else:
                            meeting_date = meeting_start
                        
                        if meeting_date:
                            dt = datetime.fromisoformat(meeting_date.replace('Z', '+00:00'))
                            formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
                        else:
                            formatted_date = "Data não disponível"
                    else:
                        formatted_date = "Data não disponível"
                except Exception as e:
                    print(f"❌ Erro ao formatar data: {e}")
                    formatted_date = "Data não disponível"
                
                return {
                    "answer": f"✅ **Reunião Mantida!**\n\n📅 **Sua reunião está confirmada:**\n• **Data:** {formatted_date}\n• **Assunto:** {meeting_summary}\n\nTudo certo! Sua reunião permanece agendada conforme planejado.\n\nSe precisar de mais alguma coisa, estou à disposição! 😊",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "meeting_kept"},
                    "scheduling_confidence": 0.9
                }
            
            elif selected_option == 4:  # Receber por email
                # Verificar se há email nos participantes do evento
                attendees = meeting.get('attendees', [])
                email_from_attendees = None
                
                if attendees and len(attendees) > 0:
                    # Tentar encontrar email válido nos participantes
                    for attendee in attendees:
                        attendee_email = attendee.get('email', '') if isinstance(attendee, dict) else str(attendee)
                        if attendee_email and '@' in attendee_email:
                            email_from_attendees = attendee_email
                            print(f"✅ Email encontrado nos participantes: {email_from_attendees}")
                            break
                
                # Se não encontrou nos participantes, tentar recuperar do Redis (mesma sessão)
                if not email_from_attendees and agent_id:
                    try:
                        email_key = f"agent:email:{conversation_key}"
                        stored_email = self.redis.get(email_key)
                        if stored_email:
                            email_from_attendees = stored_email
                            print(f"✅ Email recuperado do Redis da sessão: {email_key} = {email_from_attendees}")
                    except Exception as e:
                        print(f"⚠️ Erro ao recuperar email do Redis: {e}")
                
                # Se encontrou email (participantes ou Redis), enviar automaticamente
                if email_from_attendees:
                    print(f"📧 Email encontrado. Enviando automaticamente...")
                    return self._send_email_for_existing_meeting(
                        email_from_attendees, agent_id, whatsapp, 
                        calendar_credentials, calendar_id, contact_name, conversation_id,
                        meeting=meeting, meeting_id=meeting_id, account_id=account_id, inbox_id=inbox_id
                    )
                
                # Se não encontrou email, pedir ao usuário
                # Salvar informações da reunião no Redis para uso posterior
                if agent_id and whatsapp:
                    try:
                        import json
                        meeting_info = {
                            "meeting_id": meeting_id,
                            "meeting": meeting,
                            "whatsapp": whatsapp
                        }
                        key = f"agent:existing_meeting_email:{conversation_key}:{whatsapp}"
                        self.redis.set(key, json.dumps(meeting_info), ex=60*60)  # Expira em 1 hora
                        print(f"✅ Informações da reunião salvas no Redis para envio de email: {key}")
                    except Exception as e:
                        print(f"⚠️ Erro ao salvar informações da reunião no Redis: {e}")
                
                return {
                    "answer": """📧 **Receber Detalhes por Email**

Perfeito! Para enviar os detalhes do seu agendamento por email, preciso do seu endereço de email.

**Por favor, informe seu email:**

**Exemplo:** joao@email.com

Assim que receber seu email, enviarei os detalhes do agendamento! 😊""",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {
                        "type": "waiting_for_email_existing_meeting",
                        "meeting_id": meeting_id,
                        "meeting": meeting
                    },
                    "scheduling_confidence": 0.9
                }
            
        except Exception as e:
            print(f"❌ Erro ao processar opção de reunião: {e}")
            return {
                "answer": f"❌ Erro ao processar opção: {str(e)}. Tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _process_meeting_query_improved(self, whatsapp: str, calendar_credentials: str, calendar_id: str) -> str:
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
• "Quero agendar uma reunião"
• "Gostaria de marcar uma consulta"
• "Preciso agendar para amanhã"

Estou aqui para ajudar! 😊"""
            
            # Formatar reuniões encontradas
            response = f"📅 **Suas Reuniões Agendadas**\n\n"
            
            for i, meeting in enumerate(existing_meetings, 1):
                start_datetime = meeting['start']
                if 'T' in start_datetime:
                    from datetime import datetime
                    dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                    formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
                else:
                    formatted_date = start_datetime
                
                response += f"{i}️⃣ **{meeting.get('summary', 'Reunião')}**\n"
                response += f"   📅 {formatted_date}\n\n"
            
            response += "**O que você gostaria de fazer?**\n\n"
            response += "**Opções disponíveis:**\n\n"
            response += "1️⃣ **Alterar horário** de uma reunião\n"
            response += "2️⃣ **Cancelar** uma reunião\n"
            response += "3️⃣ **Manter** reunião existente\n"
            response += "4️⃣ **Receber por email** - Enviar detalhes do agendamento por email\n\n"
            response += "**Para gerenciar suas reuniões, digite:**\n"
            response += "- **\"1\"** - para alterar horário\n"
            response += "- **\"2\"** - para cancelar reunião\n"
            response += "- **\"3\"** - para manter reunião existente\n"
            response += "- **\"4\"** - para receber detalhes por email\n\n"
            response += "Aguardo sua escolha! 😊"
            
            return response
            
        except Exception as e:
            print(f"❌ Erro ao processar consulta de reuniões: {e}")
            return "❌ Erro ao consultar suas reuniões. Tente novamente."
    
    def _check_existing_meetings(self, whatsapp_number: str, calendar_credentials: str, calendar_id: str) -> list:
        """Verifica se já existem reuniões agendadas para o WhatsApp"""
        try:
            from google_calendar_service import GoogleCalendarService
            
            # Normalizar WhatsApp para formato de busca (55numero)
            normalized_whatsapp = self._normalize_whatsapp_number(whatsapp_number)
            if not normalized_whatsapp:
                print(f"⚠️ WhatsApp inválido: {whatsapp_number}")
                return []
            
            print(f"🔍 Buscando reuniões com WhatsApp normalizado: {normalized_whatsapp} (original: {whatsapp_number})")
            
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            existing_meetings = calendar_service.search_meetings_by_whatsapp(normalized_whatsapp)
            
            print(f"🔍 Verificando reuniões existentes para WhatsApp {normalized_whatsapp}: {len(existing_meetings)} encontradas")
            return existing_meetings
            
        except Exception as e:
            print(f"❌ Erro ao verificar reuniões existentes: {e}")
            return []
    
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
                # Criar agente com checkpointer para memória E retriever
                from langchain.agents import create_agent
                
                # System prompt que inclui instruções para usar o contexto
                enhanced_system_prompt = f"""{system_prompt}

IMPORTANTE: Você tem acesso ao contexto dos documentos através da variável {{context}}. 
Sempre use as informações dos documentos para responder às perguntas do usuário.
Se não encontrar a informação nos documentos, diga claramente que não encontrou essa informação em sua base de dados."""
                
                # Criar agente com retriever integrado
                agent = create_agent(
                    llm,
                    tools=[],  # Por enquanto sem tools, pode ser expandido depois
                    system_prompt=enhanced_system_prompt,
                    checkpointer=self.checkpointer
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
                    print(f"🔍 DEBUG - Retriever encontrou {len(docs)} documentos")
                    if docs:
                        print(f"   Primeiro doc: {docs[0].page_content[:100]}...")
                except AttributeError:
                    try:
                        # Fallback para método antigo
                        docs = chain["retriever"].get_relevant_documents(message)
                        print(f"🔍 DEBUG - Retriever (método antigo) encontrou {len(docs)} documentos")
                    except AttributeError:
                        # Se nenhum método funcionar, usar lista vazia
                        docs = []
                        print("🔍 DEBUG - Retriever falhou, usando lista vazia")
                
                context = "\n".join([doc.page_content for doc in docs[:3]])
                print(f"🔍 DEBUG - Contexto extraído: {len(context)} caracteres")
            else:
                context = ""
                print("🔍 DEBUG - Sem retriever na chain!")
            
            # Usar LLM diretamente
            if "llm" in chain:
                system_prompt = chain.get("system_prompt", "")
                full_prompt = f"{system_prompt}\n\nContexto dos documentos:\n{context}\n\nMensagem do usuário: {message}\n\nResposta:"
                print(f"🔍 DEBUG - Enviando prompt para LLM...")
                response = chain["llm"].invoke(full_prompt)
                answer = response.content if hasattr(response, 'content') else str(response)
                print(f"🔍 DEBUG - Resposta do LLM: {answer[:100]}...")
                return answer
            else:
                print("🔍 DEBUG - Sem LLM na chain!")
                return "Erro: LLM não disponível."
        except Exception as e:
            print(f"❌ Erro no processamento simples: {e}")
            import traceback
            traceback.print_exc()
            return "Erro ao processar mensagem."
    
    def load_vectorstore(self, vectorstore_path: str) -> Optional[FAISS]:
        """Carrega vectorstore do disco"""
        try:
            if not os.path.exists(vectorstore_path):
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
    
    def _analyze_transfer_need(self, message: str, response: str) -> Dict[str, Any]:
        """Analisa se deve transferir para atendimento humano"""
        try:
            response_lower = response.lower()
            
            # Frases que indicam incapacidade de responder
            incapacity_phrases = [
                'não posso', 'não consigo', 'não tenho', 'não sei',
                'não encontrei', 'não disponível', 'não posso ajudar',
                'limitação', 'não posso responder', 'não tenho acesso'
            ]
            
            # Verificar se a resposta contém frases de incapacidade
            has_incapacity = any(phrase in response_lower for phrase in incapacity_phrases)
            
            if has_incapacity:
                return {
                    "should_transfer": True,
                    "reason": "Resposta indica limitação do agente"
                }
            
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
    
    def _extract_datetime_from_message(self, message: str, calendar_workdays: str, allow_llm_fallback: bool = True) -> Optional[Dict[str, Any]]:
        """Extrai informações de data e hora da mensagem.
        allow_llm_fallback: quando False, não usa LLM como fallback (evita falsos positivos em mensagens como 'produtos').
        """
        try:
            import re
            from datetime import datetime, timedelta
            
            # Normalizar mensagem
            normalized = self._normalize_text(message)
            # Substituir "as" por "às" antes de processar horários (para garantir detecção)
            normalized = re.sub(r'\bas\s+(\d{1,2}):?(\d{0,2})?\b', r'às \1:\2', normalized)
            normalized = re.sub(r'\bas\s+(\d{1,2})h', r'às \1h', normalized)
            # Também procurar por "teria pra" que pode indicar pergunta sobre disponibilidade
            normalized = re.sub(r'teria\s+pra\s+', '', normalized)
            print(f"🔍 Extraindo data/hora de: '{message}' -> '{normalized}'")
            
            # 1) Detectar datas numéricas tipo 15/11 ou 15/11/2025 (com ou sem prefixos "dia", "no dia")
            numeric_date = None
            m = re.search(r'(?:\bdia\s+|\bno\s+dia\s+)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b', normalized)
            if m:
                day = int(m.group(1))
                month = int(m.group(2))
                year = int(m.group(3)) if m.group(3) else datetime.now().year
                if year < 100:
                    year += 2000
                try:
                    numeric_date = datetime(year, month, day)
                    print(f"📅 Data numérica detectada: {numeric_date.strftime('%d/%m/%Y')}")
                except ValueError:
                    numeric_date = None

            # 2) Padrões para detectar datas por palavras
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
            
            # Detectar data
            detected_date = None
            date_pattern_found = None
            if numeric_date:
                detected_date = numeric_date
            else:
                for pattern, days_offset in date_patterns.items():
                    if pattern in normalized:
                        detected_date = datetime.now() + timedelta(days=days_offset)
                        date_pattern_found = pattern
                        print(f"📅 Data detectada: {pattern} -> {detected_date.strftime('%d/%m/%Y')}")
                        break
            
            # Detectar hora específica
            detected_hour = None
            detected_minute = 0
            
            # Padrões para horários
            hour_patterns = [
                (r'as\s+(\d{1,2}):(\d{0,2})', True),      # às 15:00, as 15:30
                (r'às\s+(\d{1,2}):(\d{0,2})', True),      # às 15:00
                (r'(\d{1,2}):(\d{0,2})', True),            # 15:00
                (r'(\d{1,2})h(\d{0,2})', True),            # 15h30
                (r'(?:às|as)?\s*(\d{1,2})\s*hrs?', False), # 15hrs, às 15hrs
                (r'(\d{1,2})\s+horas?', False),            # 15 horas
            ]
            
            for pattern, has_min in hour_patterns:
                hour_match = re.search(pattern, normalized)
                if hour_match:
                    hour = int(hour_match.group(1))
                    minute = int(hour_match.group(2)) if has_min and len(hour_match.groups()) > 1 and hour_match.group(2) else 0
                    if 0 <= hour <= 23 and 0 <= minute <= 59:
                        detected_hour = hour
                        detected_minute = minute
                        print(f"⏰ Horário detectado: {hour:02d}:{minute:02d}")
                        break
            
            # Só retornar se encontrou pelo menos data ou hora
            if detected_date or detected_hour is not None:
                # Se não detectou data, usar amanhã; se detectou data numérica no passado, pular para próximo ano
                if not detected_date:
                    detected_date = datetime.now() + timedelta(days=1)
                else:
                    now = datetime.now()
                    tentative = detected_date.replace(hour=detected_hour if detected_hour is not None else 9,
                                                       minute=detected_minute, second=0, microsecond=0)
                    if tentative < now:
                        try:
                            detected_date = detected_date.replace(year=detected_date.year + 1)
                            print(f"↪️ Data ajustada para o próximo ano: {detected_date.strftime('%d/%m/%Y')}")
                        except ValueError:
                            pass
                
                # Se não detectou hora, usar 9h como padrão
                if detected_hour is None:
                    detected_hour = 9
                
                # Criar datetime final
                final_datetime = detected_date.replace(hour=detected_hour, minute=detected_minute, second=0, microsecond=0)
                
                # Verificar se é dia útil
                workdays_list = [int(d) for d in calendar_workdays.split(',')]
                weekday = final_datetime.weekday() + 1  # weekday() retorna 0-6, workdays usa 1-7
                
                if weekday not in workdays_list:
                    # Ajustar para próximo dia útil
                    days_to_add = 0
                    while weekday not in workdays_list and days_to_add < 7:
                        days_to_add += 1
                        final_datetime = final_datetime + timedelta(days=1)
                        weekday = final_datetime.weekday() + 1
                    print(f"⚠️ Data ajustada para dia útil: {final_datetime.strftime('%d/%m/%Y')}")
                
                formatted_time = final_datetime.strftime('%d/%m/%Y às %H:%M')
                day_name = self._get_day_name(final_datetime.weekday())
                
                return {
                    "datetime": final_datetime,
                    "formatted": formatted_time,
                    "day_name": day_name,
                    "confidence": 0.8 if detected_date and detected_hour is not None else 0.6
                }
            
            # Fallback LLM: somente se permitido
            if allow_llm_fallback:
                llm_parsed = self._extract_datetime_with_llm(message)
                if llm_parsed and llm_parsed.get('datetime'):
                    final_datetime = llm_parsed['datetime']
                    formatted_time = final_datetime.strftime('%d/%m/%Y às %H:%M')
                    day_name = self._get_day_name(final_datetime.weekday())
                    return {
                        "datetime": final_datetime,
                        "formatted": formatted_time,
                        "day_name": day_name,
                        "confidence": 0.75
                    }
            return None
            
        except Exception as e:
            print(f"❌ Erro ao extrair data/hora da mensagem: {e}")
            return None

    def _extract_datetime_with_llm(self, message: str) -> Optional[Dict[str, Any]]:
        """Usa LLM como fallback para extrair data/hora em fuso America/Sao_Paulo.
        Retorna dict { datetime: datetime } ou None.
        """
        try:
            if not self.groq_client or not self.groq_client.is_available():
                return None
            prompt = (
                "Você é um extrator de data/hora.\n"
                "Entrada do usuário (pt-BR): '" + message + "'\n"
                "Devolva APENAS um JSON na linha seguinte, sem texto extra, no formato:\n"
                "{\"date\": \"YYYY-MM-DD\", \"time\": \"HH:MM\", \"timezone\": \"America/Sao_Paulo\"}.\n"
                "Se não for possível determinar, retorne {}.\n"
                "Regra: interprete datas futuras; se o dia/mês já passou este ano, use o próximo ano."
            )
            raw = self.groq_client.generate_text(prompt, model='llama-3.1-8b-instant', max_tokens=200, temperature=0.0)
            if not raw:
                return None
            # Extrair bloco JSON
            import json, re
            match = re.search(r"\{[\s\S]*\}", raw)
            if not match:
                return None
            data = json.loads(match.group(0))
            if not isinstance(data, dict) or 'date' not in data or 'time' not in data:
                return None
            from datetime import datetime
            dt = datetime.fromisoformat(f"{data['date']}T{data['time']}:00")
            return { 'datetime': dt }
        except Exception as e:
            print(f"⚠️ Falha no fallback LLM para data/hora: {e}")
            return None
    
    def _get_next_weekday(self, target_weekday: int) -> int:
        """Calcula quantos dias até o próximo dia da semana (0=segunda, 6=domingo)"""
        from datetime import datetime
        today = datetime.now().weekday()
        days_ahead = target_weekday - today
        if days_ahead <= 0:
            days_ahead += 7
        return days_ahead
    
    def _process_custom_datetime_request(self, datetime_info: Dict[str, Any], agent_id: str,
                                        calendar_credentials: str, calendar_id: str,
                                        calendar_start_hour: int, calendar_end_hour: int,
                                        calendar_workdays: str, calendar_duration_minutes: int,
                                        whatsapp: str, use_google_meeting: bool, contact_name: str = None) -> dict:
        """Processa solicitação de data/hora específica após horários sugeridos"""
        try:
            selected_datetime = datetime_info.get("datetime")
            formatted_time = datetime_info.get("formatted")
            day_name = datetime_info.get("day_name")
            
            if not selected_datetime:
                return {
                    "answer": "❌ Não consegui entender a data/hora solicitada. Por favor, escolha uma das opções sugeridas (1, 2 ou 3) ou informe uma data/hora válida.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Verificar disponibilidade
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            if not calendar_service.is_available():
                return {
                    "answer": "❌ Erro: Serviço de calendário não está disponível.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            from datetime import timedelta
            end_datetime = selected_datetime + timedelta(minutes=calendar_duration_minutes)
            
            # Verificar disponibilidade
            availability = calendar_service.check_availability(selected_datetime, end_datetime)
            
            if not availability.get("available", True):
                # Gerar novas sugestões automaticamente
                suggestions = self._suggest_random_available_times(
                    agent_id, calendar_credentials, calendar_id,
                    calendar_start_hour, calendar_end_hour, calendar_workdays,
                    calendar_duration_minutes, whatsapp, ""
                )
                suggestions_text = suggestions.get('answer') if isinstance(suggestions, dict) else None
                answer_text = f"""❌ **Horário Indisponível**

Infelizmente, o horário solicitado ({day_name}, {formatted_time}) não está disponível.

Aqui estão outras opções disponíveis para você escolher:
"""
                if suggestions_text:
                    answer_text += f"\n{suggestions_text}"
                else:
                    answer_text += "\nPor favor, me diga outro dia/horário e eu verifico para você."
                return {
                    "answer": answer_text,
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "unavailable_time_suggested"},
                    "scheduling_confidence": 0.9
                }
            
            # Horário disponível - criar agendamento automaticamente
            selected_time_data = {
                "datetime": selected_datetime,
                "formatted": formatted_time,
                "day_name": day_name,
                "whatsapp": whatsapp
            }
            
            # Criar agendamento automaticamente sem precisar de confirmação
            return self._create_appointment_automatically(
                selected_time_data, agent_id, calendar_credentials, calendar_id,
                calendar_duration_minutes, whatsapp, use_google_meeting, contact_name
            )
            
        except Exception as e:
            print(f"❌ Erro ao processar solicitação de data/hora específica: {e}")
            import traceback
            traceback.print_exc()
            return {
                "answer": f"❌ Erro ao processar sua solicitação: {str(e)}. Por favor, tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _create_appointment_automatically(self, selected_time_data: Dict[str, Any], agent_id: str,
                                         calendar_credentials: str, calendar_id: str,
                                         calendar_duration_minutes: int, whatsapp: str,
                                         use_google_meeting: bool, contact_name: str = None) -> dict:
        """Cria agendamento automaticamente quando usuário seleciona horário"""
        try:
            # Extrair informações do horário selecionado
            selected_datetime = selected_time_data.get("datetime")
            formatted_time = selected_time_data.get("formatted")
            day_name = selected_time_data.get("day_name")
            
            if not selected_datetime:
                return {
                    "answer": "❌ Erro: Data/hora inválida. Por favor, tente novamente.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Usar nome do contato como participante ou "Cliente" como fallback
            participant_name = contact_name if contact_name else "Cliente"
            subject = "Reunião Agendada pela IA"
            
            # Criar reunião real no Google Calendar
            from datetime import timedelta
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            
            if not calendar_service.is_available():
                return {
                    "answer": "❌ Erro: Serviço de calendário não está disponível. Por favor, tente novamente mais tarde.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Calcular data/hora de fim
            end_datetime = selected_datetime + timedelta(minutes=calendar_duration_minutes)
            
            # Normalizar WhatsApp antes de salvar
            normalized_whatsapp = self._normalize_whatsapp_number(whatsapp) if whatsapp else 'N/A'
            
            # Criar descrição do evento
            description = f"""Tipo: Reunião
Duração: {calendar_duration_minutes} minutos
Participantes: {participant_name}
Assunto: {subject}

Agendado via InovAI Analytics

<!-- METADATA_START -->
WHATSAPP: {normalized_whatsapp}
<!-- METADATA_END -->"""
            
            # Criar evento no Google Calendar (sem participantes inicialmente)
            created_event = calendar_service.create_event(
                summary=subject,
                start_datetime=selected_datetime,
                end_datetime=end_datetime,
                description=description,
                attendees=[],  # Não adicionar participantes inicialmente
                use_google_meeting=use_google_meeting
            )
            
            if not created_event.get('success', False):
                error_msg = created_event.get('error', 'Erro desconhecido')
                print(f"❌ Erro ao criar evento no Google Calendar: {error_msg}")
                return {
                    "answer": f"❌ Erro ao criar agendamento: {error_msg}",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            print(f"✅ Evento criado no Google Calendar: {created_event.get('event_id')}")
            
            # Salvar informações do evento no Redis para uso posterior (quando usuário fornecer email)
            if agent_id and whatsapp:
                try:
                    import json
                    event_info = {
                        "event_id": created_event.get('event_id'),
                        "start_datetime": selected_datetime.isoformat(),
                        "end_datetime": end_datetime.isoformat(),
                        "subject": subject,
                        "description": description,
                        "participant_name": participant_name,
                        "whatsapp": whatsapp
                    }
                    key = f"agent:last_event:{agent_id}:{whatsapp}"
                    self.redis.set(key, json.dumps(event_info), ex=60*60*24)  # Expira em 24 horas
                    print(f"✅ Informações do evento salvas no Redis: {key}")
                except Exception as e:
                    print(f"⚠️ Erro ao salvar informações do evento no Redis: {e}")
            
            # Montar resposta informando que agendamento foi criado e email é opcional
            response = f"""✅ **Agendamento Confirmado!**

Perfeito! Sua reunião foi agendada com sucesso:

📅 **Data/Hora:** {day_name}, {formatted_time}
👤 **Participante:** {participant_name}
✏️ **Assunto:** {subject}
📱 **WhatsApp:** {whatsapp}

🎉 Sua reunião foi registrada com sucesso!

📧 **Deseja receber um convite por email?**
Se quiser receber os detalhes do agendamento por email, é só informar seu endereço de email.

**Exemplo:** joao@email.com"""
            
            return {
                "answer": response,
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {
                    "type": "scheduling_completed",
                    "participant": participant_name,
                    "subject": subject,
                    "email": None,
                    "datetime": selected_datetime.isoformat() if selected_datetime else None,
                    "whatsapp": whatsapp,
                    "event_id": created_event.get('event_id'),
                    "event_link": created_event.get('event_link'),
                    "email_sent": False
                },
                "scheduling_confidence": 0.9
            }
            
        except Exception as e:
            print(f"❌ Erro ao criar agendamento automaticamente: {e}")
            import traceback
            traceback.print_exc()
            return {
                "answer": f"❌ Erro ao criar agendamento: {str(e)}. Por favor, tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
