import sys
import os
import logging

# logging 설정 (OCR 과정을 보기 위함)
logging.basicConfig(level=logging.INFO)

# 프로젝트 루트(backend)를 path에 추가하여 app 패키지를 찾을 수 있게 함
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from app.services.text_extraction_service import extract_text_hybrid

def run_test(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    # 파일 확장자에 따른 mime_type 설정
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        mime_type = "application/pdf"
    elif ext in [".png", ".jpg", ".jpeg"]:
        mime_type = f"image/{ext[1:]}"
    else:
        mime_type = "application/octet-stream"

    print(f"\n" + "="*50)
    print(f"테스트 파일: {file_path}")
    print(f"MIME 타입: {mime_type}")
    print("="*50)

    try:
        # 하이브리드 추출 실행
        result = extract_text_hybrid(file_path, mime_type)
        
        print(f"\n[추출 결과]")
        print(f"- 추출 방식: {result.get('extraction_method')}")
        print(f"- 스캔 PDF 여부: {result.get('scanned_pdf_possible')}")
        
        if result.get('error'):
            print(f"- 오류 발생: {result.get('error')}")
        
        print(f"\n[텍스트 내용 (최대 1000자)]")
        print("-" * 30)
        print(result.get('full_text', "")[:1000])
        print("-" * 30)
        
    except Exception as e:
        print(f"\n[테스트 실패] {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # 1. 아규먼트로 파일 경로를 받았는지 확인
    if len(sys.argv) > 1:
        test_file = sys.argv[1]
    else:
        # 2. 기본 테스트용 로고 파일 (루트 기준 경로)
        # 스크립트가 backend/ 에 있으므로 상위 디렉토리의 frontend 경로를 찾음
        test_file = os.path.join(current_dir, "..", "frontend/public/readytalk-logo.png")
    
    run_test(test_file)
