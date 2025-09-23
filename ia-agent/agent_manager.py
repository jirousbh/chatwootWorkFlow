import os
import tempfile
import unicodedata
import re
from pathlib import Path
from typing import Optional, List
from langchain_community.document_loaders.pdf import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores.faiss import FAISS
from langchain_groq import ChatGroq
from langchain.memory import ConversationBufferMemory
from langchain.chains.conversational_retrieval.base import ConversationalRetrievalChain
from langchain.prompts import PromptTemplate
from groq_client import GroqClient

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
                           system_prompt: str, model: str, api_provider: str) -> Optional[ConversationalRetrievalChain]:
        """Obtém ou cria chain para um agente"""
        try:
            # Verificar cache
            cache_key = f"{agent_id}_{vectorstore_path}"
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
                    temperature=0.1,
                    max_tokens=2048
                )
            else:
                print(f"Provider não suportado: {api_provider}")
                return None
            
            # Criar prompt template usando o padrão do ConversationalRetrievalChain
            from langchain.chains.conversational_retrieval.prompts import CONDENSE_QUESTION_PROMPT, QA_PROMPT
            
            # Usar o template padrão do LangChain que já tem as variáveis corretas
            prompt_template = QA_PROMPT
            
            # Configurar memória
            memory = ConversationBufferMemory(
                return_messages=True,
                memory_key="chat_history",
                output_key="answer"
            )
            
            # Criar retriever
            retriever = vectorstore.as_retriever(
                search_kwargs={"k": 4}  # Buscar 4 chunks mais relevantes
            )
            
            # Criar chain com configuração corrigida
            chain = ConversationalRetrievalChain.from_llm(
                llm=llm,
                memory=memory,
                retriever=retriever,
                return_source_documents=True,
                verbose=False,
                combine_docs_chain_kwargs={"prompt": prompt_template}
            )
            
            # Armazenar no cache
            self.agent_chains[cache_key] = chain
            
            return chain
            
        except Exception as e:
            print(f"Erro ao criar chain: {e}")
            return None
    
    def generate_summary(self, agent_id: str, vectorstore_path: str, 
                        summary_prompt: str, model: str, api_provider: str) -> str:
        """Gera resumo do documento usando o summary_prompt"""
        try:
            # Carregar vectorstore
            vectorstore = self.load_vectorstore(vectorstore_path)
            if not vectorstore:
                return "Erro: Não foi possível carregar os documentos."
            
            # Buscar documentos mais relevantes para o resumo
            retriever = vectorstore.as_retriever(search_kwargs={"k": 8})
            relevant_docs = retriever.invoke(summary_prompt)
            
            # Combinar contexto dos documentos
            context = "\n\n".join([doc.page_content for doc in relevant_docs])
            
            # Usar Groq diretamente para o resumo
            if api_provider == 'groq':
                full_prompt = f"""Baseado nos seguintes documentos:

{context}

{summary_prompt}

Responda em português brasileiro."""
                
                response = self.groq_client.generate_text(
                    prompt=full_prompt,
                    model=model,
                    max_tokens=1024,
                    temperature=0.3
                )
                
                return response or "Não foi possível gerar o resumo."
            else:
                return "Provider não suportado para resumo."
                
        except Exception as e:
            print(f"Erro ao gerar resumo: {e}")
            return f"Erro ao gerar resumo: {str(e)}"
    
    def chat_with_agent(self, agent_id: str, vectorstore_path: str, 
                       message: str, system_prompt: str, model: str, api_provider: str) -> dict:
        """Conversa com o agente usando o vectorstore"""
        try:
            # Obter ou criar chain
            chain = self._get_or_create_chain(agent_id, vectorstore_path, system_prompt, model, api_provider)
            
            if not chain:
                return {
                    "answer": "Erro: Não foi possível inicializar o agente.",
                    "should_transfer": False,
                    "transfer_reason": None
                }
            
            # Processar mensagem
            response = chain.invoke({"question": message})
            answer = response.get("answer", "Não foi possível gerar uma resposta.")
            
            # Detectar se deve transferir para humano
            transfer_analysis = self._analyze_transfer_need(message, answer)
            
            return {
                "answer": answer,
                "should_transfer": transfer_analysis["should_transfer"],
                "transfer_reason": transfer_analysis["reason"]
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
        text = re.sub(r'[^\w\s]', '', text)  # remove pontuação
        return text.strip()

    def _analyze_transfer_need(self, user_message: str, agent_response: str) -> dict:
        """Analisa se deve transferir para atendimento humano"""
        try:
            # Normalize as mensagens
            user_lower = self._normalize_text(user_message)
            response_lower = self._normalize_text(agent_response)

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

            # Frases do agente indicando limitação
            incapacity_phrases = [
                'nao posso ajudar', 'nao consigo', 'nao tenho informacao',
                'nao sei', 'nao encontrei', 'fora do meu conhecimento',
                'preciso transferir', 'vou transferir', 'atendente humano',
                'vou te passar para um atendente'
            ]

            if any(phrase in response_lower for phrase in incapacity_phrases):
                return {
                    "should_transfer": True,
                    "reason": f"Agente indicou incapacidade na resposta"
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
