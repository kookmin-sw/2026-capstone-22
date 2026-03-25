-- ============================================================
-- Gemini File Search Chatbot - Corpus/Document 테이블 마이그레이션
--
-- 실행 방법:
--   psql -h <host> -U <user> -d <database> -f 001_create_corpus_tables.sql
--
-- 또는 DBeaver/pgAdmin에서 직접 실행
-- ============================================================

-- 1. corpora 테이블 생성
-- Gemini File Search Store 정보 저장
CREATE TABLE IF NOT EXISTS corpora (
    id SERIAL PRIMARY KEY,
    corpus_name VARCHAR(255) NOT NULL UNIQUE,  -- Gemini corpus name (e.g., 'fileSearchStores/ccc-m5s9m4ual5v5')
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- corpus_name 인덱스 (빠른 조회용)
CREATE INDEX IF NOT EXISTS idx_corpora_corpus_name ON corpora(corpus_name);

-- 2. documents 테이블 생성
-- Gemini에 업로드된 문서 정보 저장
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    corpus_id INTEGER NOT NULL REFERENCES corpora(id) ON DELETE CASCADE,
    document_name VARCHAR(512) NOT NULL,  -- Gemini document name (e.g., 'fileSearchStores/xxx/documents/yyy')
    display_name VARCHAR(512) NOT NULL,   -- 원본 파일명
    file_path VARCHAR(1024),              -- 로컬 파일 경로 (선택)
    file_size BIGINT,                     -- 파일 크기 (bytes)
    mime_type VARCHAR(255),               -- MIME 타입
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- document_name 인덱스 (삭제 시 빠른 조회용)
CREATE INDEX IF NOT EXISTS idx_documents_document_name ON documents(document_name);

-- corpus_id 인덱스 (조인 성능 향상)
CREATE INDEX IF NOT EXISTS idx_documents_corpus_id ON documents(corpus_id);

-- display_name 인덱스 (파일명으로 검색 시)
CREATE INDEX IF NOT EXISTS idx_documents_display_name ON documents(display_name);

-- 복합 인덱스 (corpus_id + display_name으로 빠른 조회)
CREATE INDEX IF NOT EXISTS idx_documents_corpus_display ON documents(corpus_id, display_name);


-- ============================================================
-- 마이그레이션 완료 확인
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '마이그레이션 완료: corpora, documents 테이블 생성됨';
    RAISE NOTICE '다음 단계: sync_gemini_to_db.py 스크립트로 데이터 동기화';
END $$;
