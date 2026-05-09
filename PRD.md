# Mediavault PRD

Status: Historical requirements snapshot
Last reviewed: 2026-04-19
Superseded by:

- `docs/architecture/personal-video-vault-target-architecture.md`
- `docs/roadmap/current-refactor-status.md`
- `docs/roadmap/personal-video-vault-rearchitecture-phases.md`

Important note:

- this document records an early MVP definition and no longer describes the live product in full
- the current app uses shared-password auth rather than a first-run admin-account bootstrap flow
- playlists are implemented and are no longer “out of scope”
- use the documents above for current architecture, refactor state, and ownership boundaries
- quoted historical statements below are preserved for context and are not authoritative for current development

# 최종 PRD (Product Requirements Document) - Mediavault

**버전: 2.0**  
**프로젝트명: Mediavault**
**최종 업데이트: 2025-01-12**

> Historical note: at the time this PRD was written, it was intended as the MVP blueprint. It is no longer the current source of truth for the live project.

> **v2.0 업데이트 사항:** 보안 시스템을 XOR 암호화에서 업계 표준인 DASH + AES-128 암호화로 업그레이드하여 보안성과 호환성을 대폭 개선하였다.
> 

### 1. 프로젝트 개요 (Overview)

### 1-1. 문제 정의 (Problem Statement)

사용자들은 자신의 컴퓨터에 수많은 동영상 파일을 저장하고 있으나, 이를 외부에서 다른 기기로 보기 위해서는 클라우드 서비스에 유료로 업로드하거나, 기술적 지식이 필요한 NAS를 구축해야 하는 불편함이 있다.

### 1-2. 프로젝트 목표 (Goals)

- 사용자가 자신의 PC(또는 홈서버)를 복잡한 설정 없이 개인 미디어 서버로 활용할 수 있도록 한다.
- 로컬 PC의 동영상을 웹 환경에서 실시간으로 스트리밍하여 감상하는 직관적인 경험을 제공한다.
- 개인 사용자를 위한 최소 기능에 집중하여 MVP를 빠르게 개발하고 핵심 가치를 검증한다.

### 1-3. 타겟 사용자 (Target User)

- 자신의 PC 또는 홈서버에 다수의 동영상(영화, 드라마, 개인 녹화 영상 등)을 보관하고 있는 개인.
- 기술적인 복잡함을 싫어하고, 간단한 솔루션을 통해 외부에서 영상을 소비하고 싶어 하는 사용자.

### 2. 제품 기능 명세 (Product Features)

### 2-1. 시스템 아키텍처

- **DASH 스트리밍:** 클라우드에 파일을 동기화하지 않고, 사용자의 서버 PC에서 웹 클라이언트로 DASH(Dynamic Adaptive Streaming over HTTP) 프로토콜을 통해 암호화된 동영상 데이터를 스트리밍하는 방식을 채택한다.

### 2-2. PC 에이전트 (Backend Agent)

- **역할:** 웹 클라이언트의 요청에 따라 동영상 스트리밍 및 파일 관리를 수행하는 백엔드 서비스.
- **요구사항:**
    - **폴더 관리:** 사용자가 설정한 '준비 폴더'와 '라이브러리 폴더' 두 경로를 관리한다.
    - **파일 스캔:** 사용자 요청 시 '준비 폴더'를 스캔하여 새로운 파일 목록을 표시한다.

### 2-3. 동영상 관리 및 메타데이터

- **파일 식별자(Key) 정책:**
    - 라이브러리에 영상 추가 시, 시스템은 **`uuidv4`로 고유 ID를 생성**하여 해당 파일의 내부 식별자(Key)로 사용한다.
    - DASH 변환된 파일은 `data/videos/{uuidv4}/` 디렉토리에 다음과 같이 저장된다:
        - `manifest.mpd`: DASH 매니페스트 파일
        - `video/init.mp4`, `video/segment-0001.m4s`, `video/segment-0002.m4s`, ...: AES-128로 암호화된 비디오 세그먼트
        - `audio/init.mp4`, `audio/segment-0001.m4s`, `audio/segment-0002.m4s`, ...: AES-128로 암호화된 오디오 세그먼트
        - `key.bin`: 비디오별 고유 AES-128 암호화 키
        - `thumbnail.jpg`: 자동 생성된 썸네일 이미지 (마찬가지로 AES 암호화 적용)
    - 사용자가 입력한 제목, 태그, 그리고 원본 파일명 등의 모든 메타데이터는 DB에서 이 `uuidv4` Key에 매핑되어 관리된다.
- **메타데이터:**
    - **제목 (Title):** 필수 입력 항목.
    - **태그 (Tags):** 선택 입력 항목. 쉼표(,)로 다중 입력이 가능하다.

### 2-4. 파일 보호 (File Protection)

- **목표:** 파일 원본이 다운로드되더라도 일반적인 플레이어에서 재생되지 않도록 한다.
- **방식:**
    - **DASH + AES-128 암호화:** 업계 표준인 DASH 프로토콜과 AES-128 암호화를 사용한다.
    - **비디오별 고유 키:** 각 비디오마다 고유한 AES-128 암호화 키를 생성하여 보안성을 극대화한다.
    - **Clear Key DRM:** W3C EME(Encrypted Media Extensions) 표준을 준수하여 브라우저 네이티브 DRM 지원을 통해 암호화 키를 안전하게 전달한다.
    - **세그먼트 암호화:** 동영상과 오디오는 작은 세그먼트(.m4s 파일)로 분할되어 각각 독립적으로 암호화된다.
    - **JWT 토큰 기반 인증:** DASH 매니페스트와 세그먼트 접근은 JWT 토큰을 통해 인증되어, 권한이 없는 접근을 차단한다.

### 2-5. 웹 인터페이스 (Web Interface)

- **역할:** 사용자가 라이브러리를 관리하고, 영상을 검색하며, 시청하는 웹 기반 클라이언트.
- **요구사항:**
    - **UI/UX 벤치마크:** 전반적인 라이브러리, 검색, 재생 페이지의 사용자 경험은 **유튜브(YouTube)**를 벤치마킹하여 직관적이고 익숙한 인터페이스를 제공한다.
    - **레이아웃:**
        - **라이브러리:** 썸네일과 제목이 표시되는 그리드(격자) 뷰를 기본으로 한다.
        - **네비게이션:** 화면 상단에 검색창과 '영상 추가' 알림 아이콘이 포함된 고정 네비게이션 바를 배치한다.
    - **비디오 플레이어:**
        - `@vidstack/react` 라이브러리를 활용한다.
        - 필수 컨트롤: 재생/일시정지, 볼륨 조절, 전체화면, 10초 앞/뒤로 가기, 재생 속도 조절.

### 3. 사용자 흐름 및 시나리오 (User Flow & Scenarios)

### 3-1. 최초 설정 (Initial Setup Flow)

1. **[사용자]** 서비스를 실행한다.
2. **[사용자]** 웹 브라우저로 서버 주소에 접속한다.
3. **[시스템]** 관리자 계정이 없으면 '최초 관리자 계정 생성' 페이지로 이동시킨다.
4. **[사용자]** 이메일(ID)과 비밀번호를 입력하여 계정을 생성한다.
5. **[시스템]** 사용자 정보를 DB에 저장하고, 비어있는 메인 라이브러리 페이지로 이동시킨다.

### 3-2. 새 동영상 추가 (Add New Video Flow)

1. **[사용자]** '준비 폴더'에 동영상 파일을 넣는다.
2. **[사용자]** 웹 UI 상단의 '동영상 추가' 아이콘을 클릭한다.
3. **[시스템]** '준비 폴더'를 스캔하여 새 파일 목록을 표시한다.
4. **[시스템]** '추가할 동영상 목록' 페이지를 표시한다.
5. **[사용자]** 목록에서 특정 파일을 선택하여 제목과 태그를 입력하고 '라이브러리에 추가' 버튼을 클릭한다.
6. **[시스템]**
    - 입력된 메타데이터와 함께 `uuidv4` Key를 생성하여 DB에 저장한다.
    - 원본 파일을 `data/videos/{uuidv4}/` 디렉토리로 이동시킨다.
    - FFmpeg와 Shaka Packager를 사용하여 DASH 변환을 수행한다:
        - 동영상을 HEVC로 인코딩 후 암호화된 세그먼트(.m4s)로 분할
        - 비디오와 오디오 트랙을 분리하여 적응형 스트리밍 지원
        - AES-128 암호화 키 생성 및 저장
        - DASH 매니페스트(manifest.mpd) 생성
        - 자동 썸네일 생성
    - 모달과 라이브러리 UI를 갱신한다.
7. **[사용자]** 라이브러리에 새 영상이 추가된 것을 확인한다.

### 3-3. 동영상 탐색 및 재생 (Browse and Play Flow)

1. **[사용자]** 메인 라이브러리 페이지에서 썸네일 그리드를 탐색한다.
2. **[사용자 - 검색]** 상단 검색창에 키워드를 입력하여 제목 또는 태그로 영상을 검색한다.
3. **[사용자 - 필터링]** 특정 영상의 태그(예: `#일상`)를 클릭하여 해당 태그가 달린 영상만 필터링한다.
4. **[사용자 - 재생]** 시청할 동영상의 썸네일을 클릭한다.
5. **[시스템]** 별도의 동영상 재생 페이지로 이동하여 즉시 스트리밍을 시작한다. 플레이어 하단에는 영상의 제목과 태그가 표시된다.

### 4. 정책 및 범위 (Policies & Scope)

### 4-1. 예외 처리 정책 (Error Handling)

- **비디오 외 파일:** '준비 폴더'에 동영상이 아닌 파일(이미지, 텍스트 등)이 추가될 경우, 시스템은 해당 파일을 무시하고 '추가할 동영상 목록' 모달에 경고 메시지와 함께 표시한다. 라이브러리 추가는 불가능하다.
- **스트리밍 중단:** 네트워크 불안정 등으로 인한 스트리밍 중단은 MVP 범위에서 별도의 UI로 처리하지 않으며, 브라우저의 기본 동작에 따른다.

### 4-2. 범위 외 사항 (Out of Scope for MVP)

다음 기능들은 MVP 버전에 포함되지 않으며, 향후 버전에서 고려될 수 있다.

- 다중 사용자 지원 및 영상 공유 기능
- 다중 화질 지원을 위한 트랜스코딩
- 자막(.smi, .srt 등) 파일 지원
- 재생 목록(Playlist) 기능
