import os
import tempfile
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
            
            # Criar prompt template
            prompt_template = PromptTemplate(
                template=system_prompt,
                input_variables=["context", "chat_history", "question"]
            )
            
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
            
            # Criar chain
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
            relevant_docs = retriever.get_relevant_documents(summary_prompt)
            
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
                       message: str, system_prompt: str, model: str, api_provider: str) -> str:
        """Conversa com o agente usando o vectorstore"""
        try:
            # Obter ou criar chain
            chain = self._get_or_create_chain(agent_id, vectorstore_path, system_prompt, model, api_provider)
            
            if not chain:
                return "Erro: Não foi possível inicializar o agente."
            
            # Processar mensagem
            response = chain.invoke({"question": message})
            answer = response.get("answer", "Não foi possível gerar uma resposta.")
            
            return answer
            
        except Exception as e:
            print(f"Erro ao processar mensagem: {e}")
            return f"Erro ao processar mensagem: {str(e)}"
    
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
