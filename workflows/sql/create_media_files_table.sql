-- Criar tabela para armazenar informações de arquivos de mídia
CREATE TABLE IF NOT EXISTS media_files (
    id VARCHAR(255) PRIMARY KEY,
    original_name VARCHAR(500) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    mimetype VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Criar índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_media_files_upload_date ON media_files(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_media_files_mimetype ON media_files(mimetype);
CREATE INDEX IF NOT EXISTS idx_media_files_active ON media_files(is_active);

-- Comentários nas colunas
COMMENT ON TABLE media_files IS 'Tabela para armazenar metadados de arquivos de mídia carregados';
COMMENT ON COLUMN media_files.id IS 'ID único do arquivo (timestamp)';
COMMENT ON COLUMN media_files.original_name IS 'Nome original do arquivo enviado';
COMMENT ON COLUMN media_files.filename IS 'Nome do arquivo no sistema de arquivos';
COMMENT ON COLUMN media_files.file_path IS 'Caminho completo do arquivo no servidor';
COMMENT ON COLUMN media_files.mimetype IS 'Tipo MIME do arquivo (video/mp4, image/jpeg, etc.)';
COMMENT ON COLUMN media_files.size IS 'Tamanho do arquivo em bytes';
COMMENT ON COLUMN media_files.upload_date IS 'Data e hora do upload';
COMMENT ON COLUMN media_files.created_by IS 'Usuário que fez o upload (opcional)';
COMMENT ON COLUMN media_files.description IS 'Descrição opcional do arquivo';
COMMENT ON COLUMN media_files.is_active IS 'Se o arquivo está ativo/disponível'; 