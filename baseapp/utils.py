from pathlib import Path
from langchain_community.document_loaders.pdf import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores.faiss import FAISS
from langchain_groq import ChatGroq
from langchain.memory import ConversationBufferMemory
from langchain.chains.conversational_retrieval.base import ConversationalRetrievalChain
from langchain.prompts import PromptTemplate
import os
from dotenv import load_dotenv, find_dotenv

# Tenta carregar do .env se existir, senão usa variáveis de ambiente
try:
    _ = load_dotenv(find_dotenv())
except:
    pass

# Verifica se a chave do Groq está configurada
if not os.getenv("GROQ_API_KEY"):
    print("⚠️  GROQ_API_KEY não encontrada! Configure a variável de ambiente.")

folder_files = Path(__file__).parent / "files"
model_name = "llama-3.1-8b-instant"  # Modelo rápido e eficiente do Groq

# Prompt personalizado para o sistema
CUSTOM_SYSTEM_PROMPT = """Você é um assistente especializado em análise de documentos PDF. Use as informações fornecidas nos documentos para responder às perguntas do usuário de forma precisa e útil.

Instruções importantes:
- Responda SEMPRE em português brasileiro
- Base suas respostas exclusivamente nas informações dos documentos fornecidos, sem mencionar que você usou os documentos para responder
- Se a informação não estiver nos documentos, diga claramente "Não encontrei essa informação em minha base de dados"
- Seja preciso, conciso e direto nas respostas
- Quando possível, cite trechos específicos dos documentos para embasar suas respostas
- Mantenha um tom profissional e prestativo

Contexto dos documentos:
{context}

Histórico da conversa:
{chat_history}

Pergunta do usuário: {question}

Resposta:"""

# Garante que a pasta files existe
folder_files.mkdir(exist_ok=True)

def importacao_documentos():
    documentos = []
    # Garante que a pasta existe
    folder_files.mkdir(exist_ok=True)
    
    for arquivo in folder_files.glob("*.pdf"):
        try:
            loader = PyPDFLoader(arquivo)
            documentos_arquivo = loader.load()
            documentos.extend(documentos_arquivo)
        except Exception as e:
            print(f"Erro ao carregar arquivo {arquivo}: {e}")
            continue
    return documentos

def split_documentos(documentos):
    recur_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=50,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    documentos = recur_splitter.split_documents(documentos)
    
    for i, doc in enumerate(documentos):
        doc.metadata["source"] = doc.metadata["source"].split("/")[-1]
        doc.metadata["doc_id"] = i
    return documentos

def cria_vector_store(documentos):
    # Usa embeddings do Hugging Face (gratuitos e eficientes)
    embedding_model = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={'device': 'cpu'}
    )
    vector_store = FAISS.from_documents(
        documents=documentos,
        embedding=embedding_model
    )
    return vector_store

def cria_chain_conversa():
    documentos = importacao_documentos()
    documentos = split_documentos(documentos)
    vector_store = cria_vector_store(documentos)
    
    # Usa o Groq para chat (mais rápido e econômico)
    chat = ChatGroq(
        model=model_name,
        temperature=0.1,  # Baixa temperatura para respostas mais consistentes
        max_tokens=2048
    )
    
    # Cria o prompt personalizado
    custom_prompt = PromptTemplate(
        template=CUSTOM_SYSTEM_PROMPT,
        input_variables=["context", "chat_history", "question"]
    )
    
    memory = ConversationBufferMemory(return_messages=True,
                                      memory_key="chat_history",
                                      output_key="answer")
    retriever = vector_store.as_retriever()
    
    # Cria o chain com o prompt personalizado
    chat_chain = ConversationalRetrievalChain.from_llm(
        llm=chat,
        memory=memory,
        retriever=retriever,
        return_source_documents=True,
        verbose=True,
        combine_docs_chain_kwargs={"prompt": custom_prompt}
    )
    return chat_chain