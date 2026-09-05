# Petal Reader 사용자 안내서

## 1. 처음 설치

1. iPhone 또는 iPad의 Safari에서 Petal Reader GitHub Pages 주소를 엽니다.
2. Safari 공유 버튼을 누릅니다.
3. `홈 화면에 추가` → `추가`를 선택합니다.
4. 홈 화면에 생긴 Petal Reader를 엽니다.
5. 첫 EPUB은 홈 화면 앱에서 가져옵니다.

Safari 탭과 홈 화면 앱의 저장소가 항상 같다고 가정하지 않습니다. 배포 주소도 바꾸지 않는 것이 안전합니다.

## 2. EPUB 가져오기

Petal Reader는 사용 목적에 맞춰 DRM-free 영문 reflowable EPUB 2/3만 지원합니다. DRM EPUB 지원은 제공하지 않습니다.

1. `Import EPUB`을 누릅니다.
2. Files 문서 선택기에서 iCloud Drive의 EPUB을 선택합니다.
3. 여러 권을 한 번에 선택할 수 있습니다.
4. 검사·해시·저장 진행률이 표시됩니다. 필요하면 `Cancel import`를 누릅니다.

원본 EPUB은 수정하지 않습니다. 독서용 복사본만 현재 기기에 저장합니다. 동일한 파일 해시는 중복 저장하지 않습니다.

## 3. 읽기

- 왼쪽 짧은 탭: 이전 페이지
- 오른쪽 짧은 탭: 다음 페이지
- 중앙 짧은 탭: 위·아래 도구 표시/숨김
- 목차 버튼: 장 이동
- 검색 버튼: 책 전체 점진 검색과 취소
- 기록 버튼: Bookmarks, Highlights, Notes, Vocabulary
  (메모를 단 하이라이트는 Highlights와 Notes 양쪽에 표시됩니다)
- `Aa`: 읽기 설정
- 하단 슬라이더: 책 전체 위치 이동
- 북마크 아이콘: 현재 위치 저장

iPhone 세로·iPad 세로는 한 페이지가 기본입니다. iPad 가로 Auto는 충분한 폭이 있을 때 두 페이지를 사용합니다. 높이가 낮은 iPhone 가로 Auto는 한 페이지를 유지합니다.

## 4. 읽기 설정

프리셋:

- Original: 출판사 서식 우선
- Comfortable: 기본 장문 읽기
- Focus: 좁은 본문 폭
- Large Print: 큰 글자와 높은 줄 간격
- Custom: 마지막 상세 설정

상세 설정 (수치 항목은 슬라이더입니다. 드래그하거나 좌우 화살표 키로 미세 조정합니다):

- 글꼴: Georgia, Verdana, Lexend, Atkinson Hyperlegible, OpenDyslexic, Comic Neue
- 글자 크기 12–34px (기본 16px)
- 줄·글자·문단 간격
- 좌우·상하 여백
- 본문 폭
- 왼쪽/양쪽 정렬
- Auto/1 Page/2 Page
- Paginated/Chapter Scroll
- 페이지 애니메이션
- 출판사 서식 유지
- Paper, Rose, Mint, Sky, Lavender, Soft Beige

## 5. 선택·하이라이트·메모

본문을 길게 눌러 선택하면 다음 메뉴가 표시됩니다.

- Highlight: Core, Agree, Question, Word, Quote 중 색상 선택
- Note: 선택 문장과 개인 메모 저장
- Dictionary: 앱에 포함된 Open English WordNet 영영 정의 확인
- Copy: 선택 문장 복사

저장된 하이라이트를 누르면 내용을 확인하고, `Add note`/`Edit note`로 메모를 붙이거나 고치고, 제거할 수 있습니다. 기록 패널의 Highlights·Notes 행 오른쪽 메모 아이콘으로도 바로 편집할 수 있어, 메모 하나를 고치려고 책 위치로 이동할 필요가 없습니다.

기록 패널은 검색, 장, 색상, 날짜순 필터를 제공합니다.

## 6. 단어장

`Dictionary`를 누를 때만 앱에 포함된 사전 조각을 같은 GitHub Pages 주소에서 읽습니다. 외부 API로 단어나 문장을 보내지 않습니다.

저장 항목:

- 단어와 품사
- 영영 정의와 예문
- 책 속 선택 문장
- 한국어 뜻 또는 암기 메모

## 7. JSON 백업·복원

`Backup & storage` → `Export JSON`:

- 책 정보, 읽기 위치, 설정, 북마크, 하이라이트, 메모, 단어장을 저장합니다.
- EPUB 파일·검색 캐시·사전 캐시는 포함하지 않습니다.
- iOS Share Sheet가 지원되면 `Save to Files` → iCloud Drive를 선택합니다.

복원:

1. `Import JSON`을 누릅니다.
2. 미리보기에서 신규·변경·충돌·연결되지 않은 기록 수를 확인합니다.
3. `Merge` 또는 `Replace all`을 선택합니다.
4. Replace는 현재 JSON 백업을 먼저 저장한 뒤 진행합니다.

다른 기기에 복원하면 EPUB이 없으므로 해당 책 메뉴의 `Reconnect EPUB`으로 원본을 다시 선택합니다. 같은 파일은 SHA-256 해시로 연결됩니다. 개정판처럼 해시가 다른 파일은 CFI, 책 위치, TextQuote를 순서대로 시도하며 유일하지 않은 기록은 `unresolved`로 보존합니다.

## 8. Obsidian Markdown

`Backup & storage`의 Obsidian 영역에서 책을 선택합니다.

- 파일명: `책제목--bookId-short.md`
- YAML: title, author, book_id, tags, progress, exported_at, app_version
- 섹션: Highlights, Notes, Vocabulary, Bookmarks
- 같은 기록은 다시 내보내도 같은 블록 ID를 사용합니다.

Petal Reader는 기존 Markdown을 다시 가져오거나 병합하지 않습니다. Markdown은 Obsidian 보관용이고 앱 복원은 JSON으로 합니다.

## 9. 저장공간과 삭제

- `Request storage protection`: 브라우저에 영구 저장을 요청합니다. 거절되어도 앱은 동작하지만 정기 백업이 필요합니다.
- `Delete app copy only`: EPUB 복사본만 지우고 기록은 유지합니다.
- `Delete book and all records`: 책과 관련 기록을 삭제 tombstone으로 남긴 뒤 앱에서 숨깁니다.
- `Erase all local data`: 현재 기기의 모든 Petal Reader 데이터를 지웁니다.

## 10. 문제 해결

- 책이 열리지 않음: DRM/fixed-layout 여부를 확인하고 EPUB을 다시 연결합니다.
- 기록은 있지만 책이 없음: 책 메뉴 → `Reconnect EPUB`.
- 업데이트 후 이상함: 앱을 완전히 닫고 다시 엽니다. 업데이트 배너가 있으면 읽기 위치 저장 후 적용합니다.
- 데이터가 사라짐: 최신 JSON 백업을 복원합니다.
- Share Sheet가 없음: 브라우저 다운로드 파일을 Files 앱으로 옮깁니다.
- 주소가 바뀜: 이전 주소에서 JSON을 백업한 후 새 주소에서 복원합니다.

## Daybook Journal 개인정보와 과거 기록

- 독서 session은 자정을 넘으면 날짜별로 나뉘며 실제 session과 저장 산출물은 `exact`입니다. 최신 읽기 위치만으로 만든 0초 과거 record는 `inferred`입니다.
- **Upload content to private Journal**을 끄면 quote/note/definition/example/sentence와 pending 본문이 제외됩니다.
- 날짜 범위 **Remove content from journal dates**는 현재 projection을 정제하며 Petal 로컬 기록과 private Git의 과거 commit은 지우지 않습니다.
