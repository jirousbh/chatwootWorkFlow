import gradio as gr
import time
import shutil
import os
from pathlib import Path
from utils import cria_chain_conversa, folder_files

# Verifica se a chave do Groq está configurada
if not os.getenv("GROQ_API_KEY"):
    print("⚠️  GROQ_API_KEY não encontrada! Configure a variável de ambiente no Hugging Face.")

# Variável global para armazenar o chain
chain = None

# Prompt para gerar resumo dos documentos
SUMMARY_PROMPT = """Analise rapidamente os documentos e crie um resumo conciso sobre:

1. **Assunto principal** do(s) documento(s)
2. **3-5 tópicos principais** que podem ser perguntados
3. **Exemplos de perguntas** específicas que o usuário pode fazer

Seja direto e objetivo. Máximo 150 palavras.

Responda em português brasileiro."""

def save_uploaded_files(uploaded_files):
    """Salva arquivos enviados na pasta especificada e inicializa o chatbot automaticamente."""
    global chain
    
    if not uploaded_files:
        return "📁 Selecione arquivos PDF para fazer upload", "", []
    
    try:
        # Cria a pasta files se não existir
        folder_files.mkdir(exist_ok=True)
        
        # Remove arquivos antigos na pasta
        for file in folder_files.glob("*.pdf"):
            file.unlink()
        
        # Salva novos arquivos enviados
        saved_files = []
        for file_path in uploaded_files:
            # No Gradio, uploaded_files contém os caminhos dos arquivos
            # Extrai o nome do arquivo do caminho
            filename = os.path.basename(file_path)
            destination = folder_files / filename
            
            # Copia o arquivo para a pasta de destino
            shutil.copy2(file_path, destination)
            saved_files.append(filename)
        
        upload_status = f"✅ {len(saved_files)} arquivo(s) carregado(s) automaticamente: {', '.join(saved_files)}"
        
        # Inicializa o chatbot automaticamente após o upload
        try:
            chain = cria_chain_conversa()
            
            # Lista os PDFs carregados
            pdf_files = list(folder_files.glob("*.pdf"))
            pdf_names = [pdf.name for pdf in pdf_files]
            
            # Gera resumo do conteúdo dos PDFs
            try:
                # Usa o chain para gerar um resumo do conteúdo
                summary_response = chain.invoke({"question": SUMMARY_PROMPT})
                content_summary = summary_response.get("answer", "Não foi possível analisar o conteúdo dos documentos.")
                
            except Exception as e:
                content_summary = f"Erro ao analisar conteúdo: {str(e)}"
            
            # Cria mensagem de boas-vindas com resumo
            welcome_message = f"""🤖 **Olá! Sou seu assistente de documentos PDF.**

📚 **Documentos:** {', '.join(pdf_names)}

📋 **Resumo do conteúdo:**

{content_summary}

💡 **Dica:** Faça perguntas específicas sobre os tópicos acima!"""
            
            # Retorna status e mensagem de boas-vindas para o chat
            init_status = f"✅ Chatbot inicializado automaticamente! {len(pdf_names)} documento(s) carregado(s)."
            chat_history = [["", welcome_message]]  # Mensagem do bot sem pergunta do usuário
            
            return upload_status, init_status, chat_history
            
        except Exception as e:
            init_status = f"❌ Erro ao inicializar chatbot automaticamente: {str(e)}"
            return upload_status, init_status, []
        
    except Exception as e:
        return f"❌ Erro ao carregar arquivos: {str(e)}", "", []

def initialize_chatbot():
    """Inicializa o chatbot com os PDFs carregados."""
    global chain
    
    # Garante que a pasta files existe
    folder_files.mkdir(exist_ok=True)
    
    if len(list(folder_files.glob("*.pdf"))) == 0:
        return "❌ Adicione arquivos PDF para inicializar o chatbot", []
    
    try:
        chain = cria_chain_conversa()
        
        # Lista os PDFs carregados
        pdf_files = list(folder_files.glob("*.pdf"))
        pdf_names = [pdf.name for pdf in pdf_files]
        
        # Gera resumo do conteúdo dos PDFs
        try:
            # Usa o chain para gerar um resumo do conteúdo
            summary_response = chain.invoke({"question": SUMMARY_PROMPT})
            content_summary = summary_response.get("answer", "Não foi possível analisar o conteúdo dos documentos.")
            
        except Exception as e:
            content_summary = f"Erro ao analisar conteúdo: {str(e)}"
        
        # Cria mensagem de boas-vindas com resumo
        welcome_message = f"""🤖 **Olá! Sou seu assistente de documentos PDF.**

📚 **Documentos:** {', '.join(pdf_names)}

📋 **Resumo do conteúdo:**

{content_summary}

💡 **Dica:** Faça perguntas específicas sobre os tópicos acima!"""
        
        # Retorna status e mensagem de boas-vindas para o chat
        status = f"✅ Chatbot inicializado com sucesso! {len(pdf_names)} documento(s) carregado(s)."
        chat_history = [["", welcome_message]]  # Mensagem do bot sem pergunta do usuário
        
        return status, chat_history
    except Exception as e:
        return f"❌ Erro ao inicializar chatbot: {str(e)}", []

def chat_with_documents(message, history):
    """Processa mensagem do usuário e retorna resposta do chatbot."""
    global chain
    
    if chain is None:
        return "❌ Chatbot não inicializado. Faça upload de PDFs e inicialize o chatbot primeiro."
    
    try:
        # Adiciona a mensagem do usuário ao histórico
        history.append([message, None])
        
        # Processa a mensagem com o chain
        response = chain.invoke({"question": message})
        answer = response.get("answer", "Não foi possível gerar uma resposta.")
        
        # Atualiza o histórico com a resposta
        history[-1][1] = answer
        
        return history, ""
    except Exception as e:
        error_msg = f"❌ Erro ao processar mensagem: {str(e)}"
        history.append([message, error_msg])
        return history, ""

def clear_chat():
    """Limpa o histórico do chat."""
    global chain
    if chain and hasattr(chain, 'memory'):
        chain.memory.clear()
    return [], ""

# Interface Gradio
with gr.Blocks(title="ChatPDF - Gradio", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🤖 Bem Vindo ao ChatPDF")
    gr.Markdown("Faça upload de seus PDFs e converse com eles usando IA!")
    
    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("## 📁 Upload de PDFs")
            
            # Upload de arquivos
            file_upload = gr.File(
                label="Adicione arquivos PDF",
                file_types=[".pdf"],
                file_count="multiple"
            )
            
            # Status do upload (agora automático)
            save_status = gr.Textbox(label="Status do Upload", interactive=False)
            
            # Botão para reinicializar chatbot (opcional)
            init_btn = gr.Button("🔄 Reinicializar Chatbot", variant="secondary")
            init_status = gr.Textbox(label="Status do Chatbot", interactive=False)
            
            gr.Markdown("*💡 O chatbot é inicializado automaticamente após o upload de PDFs*")
            
            # Botão para limpar chat
            clear_btn = gr.Button("🗑️ Limpar Chat", variant="stop")
        
        with gr.Column(scale=2):
            gr.Markdown("## 💬 Chat com seus Documentos")
            
            # Interface de chat
            chatbot = gr.Chatbot(
                label="Conversa",
                height=500,
                show_label=False
            )
            
            # Input para mensagem
            msg_input = gr.Textbox(
                label="Digite sua mensagem",
                placeholder="Converse com seus documentos... (Ctrl+Enter para enviar)",
                lines=2
            )
            
            # Botão para enviar mensagem
            send_btn = gr.Button("📤 Enviar", variant="primary")
            
            # Nota sobre atalhos de teclado
            gr.Markdown("*💡 Dica: Use Enter para nova linha, Ctrl+Enter para enviar mensagem*")
    
    # Eventos
    # Upload automático quando arquivos são selecionados + inicialização automática do chatbot
    file_upload.change(
        fn=save_uploaded_files,
        inputs=[file_upload],
        outputs=[save_status, init_status, chatbot]
    )
    
    init_btn.click(
        fn=initialize_chatbot,
        inputs=[],
        outputs=[init_status, chatbot]
    )
    
    clear_btn.click(
        fn=clear_chat,
        inputs=[],
        outputs=[chatbot, msg_input]
    )
    
    send_btn.click(
        fn=chat_with_documents,
        inputs=[msg_input, chatbot],
        outputs=[chatbot, msg_input]
    )
    
    # Permitir envio com Enter
    msg_input.submit(
        fn=chat_with_documents,
        inputs=[msg_input, chatbot],
        outputs=[chatbot, msg_input]
    )

if __name__ == "__main__":
    demo.launch()