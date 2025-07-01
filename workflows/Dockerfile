FROM node:18-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install --only=production

# Copiar código da aplicação
COPY . .

# Copiar workflow personalizado explicitamente
#COPY wizard-bh-buritis-workflow.json ./wizard-bh-buritis-workflow.json

# Criar diretórios necessários
RUN mkdir -p logs workflows

# Expor porta
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["npm", "start"] 