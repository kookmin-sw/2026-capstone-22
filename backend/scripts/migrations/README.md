# Gemini File Search Chatbot - DB 마이그레이션 가이드

## 개요

개발/프로덕션 서버에 배포 시 Corpus/Document 테이블을 생성하고,
기존 Gemini File Search Store 데이터를 로컬 DB에 동기화하는 방법입니다.

## 사전 요구사항

1. PostgreSQL 데이터베이스가 준비되어 있어야 함
2. `users` 테이블이 존재하고 최소 1명의 사용자가 있어야 함
3. Gemini API 키가 필요함

## 배포 순서

### 1단계: 스키마 생성 (SQL 실행)

```bash
# psql 사용
psql -h <호스트> -U <사용자> -d <데이터베이스> -f 001_create_corpus_tables.sql

# 예시
psql -h localhost -U chatbot_user -d chatbot_db -f 001_create_corpus_tables.sql
```

또는 DBeaver/pgAdmin에서 `001_create_corpus_tables.sql` 파일 내용을 복사하여 실행

### 2단계: 데이터 동기화 (Python 스크립트 실행)

```bash
# 환경변수 설정
export DATABASE_URL="postgresql://user:password@host:5432/dbname"
export GEMINI_API_KEY="your-gemini-api-key"

# 먼저 dry-run으로 확인
python sync_gemini_to_db.py --dry-run

# 실제 동기화 실행
python sync_gemini_to_db.py
```

### 3단계: 결과 확인

```sql
-- Corpus 확인
SELECT * FROM corpora;

-- Document 수 확인
SELECT c.display_name, COUNT(d.id) as doc_count
FROM corpora c
LEFT JOIN documents d ON c.id = d.corpus_id
GROUP BY c.id, c.display_name;
```

## 스크립트 옵션

### sync_gemini_to_db.py

| 옵션 | 설명 | 예시 |
|------|------|------|
| `--dry-run` | 실제 DB 변경 없이 확인만 | `python sync_gemini_to_db.py --dry-run` |
| `--corpus` | 특정 corpus만 동기화 | `python sync_gemini_to_db.py --corpus fileSearchStores/ccc-xxx` |
| `--database-url` | DB 연결 URL (환경변수 대신) | `python sync_gemini_to_db.py --database-url "postgresql://..."` |
| `--gemini-api-key` | API 키 (환경변수 대신) | `python sync_gemini_to_db.py --gemini-api-key "AI..."` |

## 테이블 스키마

### corpora

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL | PK |
| corpus_name | VARCHAR(255) | Gemini File Search Store 이름 (UNIQUE) |
| display_name | VARCHAR(255) | 표시 이름 |
| description | TEXT | 설명 |
| created_by | INTEGER | 생성자 (FK → users.id) |
| created_at | TIMESTAMP | 생성 시간 |
| updated_at | TIMESTAMP | 수정 시간 |

### documents

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL | PK |
| corpus_id | INTEGER | FK → corpora.id (CASCADE) |
| document_name | VARCHAR(512) | Gemini 문서 이름 |
| display_name | VARCHAR(512) | 원본 파일명 |
| file_path | VARCHAR(1024) | 로컬 파일 경로 (선택) |
| file_size | BIGINT | 파일 크기 (bytes) |
| mime_type | VARCHAR(255) | MIME 타입 |
| uploaded_at | TIMESTAMP | 업로드 시간 |

## 인덱스

- `idx_corpora_corpus_name` - corpus_name 조회용
- `idx_documents_document_name` - document_name 조회용 (삭제 시)
- `idx_documents_corpus_id` - JOIN 성능
- `idx_documents_display_name` - 파일명 검색
- `idx_documents_corpus_display` - corpus_id + display_name 복합

## 트러블슈팅

### "users 테이블이 없습니다"
- 애플리케이션을 최소 1회 실행하여 기본 테이블을 생성하거나
- users 테이블을 수동으로 생성하세요

### "사용자가 없습니다"
- 애플리케이션을 실행하면 기본 admin 사용자가 생성됩니다
- 또는 수동으로 사용자를 추가하세요

### 동기화 중 Timeout
- Gemini API Rate Limit에 걸릴 수 있습니다
- 잠시 후 다시 시도하거나, `--corpus` 옵션으로 하나씩 동기화하세요

## 자동 동기화

서버 시작 시 자동으로 동기화가 실행됩니다 (`main.py`의 `auto_sync_on_startup`).
수동 동기화가 필요한 경우만 이 스크립트를 사용하세요.

## API 엔드포인트

서버 실행 후 API로도 동기화할 수 있습니다:

```bash
# 특정 corpus 동기화
curl -X POST "http://localhost:8888/api/corpus/{corpus_name}/sync" \
  -H "Authorization: Bearer <token>"
```
