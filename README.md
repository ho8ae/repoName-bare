# @rawvv/grove 🌳

Git bare repository 기반 워크트리 관리 CLI 도구

## 소개

`grove`는 Git bare repository를 사용하여 여러 브랜치를 동시에 작업할 수 있게 해주는 CLI 도구입니다.

### 왜 bare repository인가요?

일반적인 Git 워크플로우에서는 브랜치를 전환할 때마다 `git checkout` 또는 `git switch`를 사용합니다. 하지만 이 방식은:

- 작업 중인 파일을 모두 stash하거나 commit해야 함
- node_modules 등 무거운 파일이 매번 재설치될 수 있음
- 여러 브랜치를 동시에 비교하기 어려움

bare repository + worktree 방식을 사용하면:

- 각 브랜치가 별도의 폴더로 존재
- 여러 브랜치를 동시에 열어서 작업 가능
- IDE에서 여러 브랜치 동시에 열기 가능

## 설치

```bash
npm install -g @rawvv/grove
```

## 사용법

### 초기화

새 프로젝트 폴더에서 실행:

```bash
mkdir my-project && cd my-project
grove init
```

### 인터랙티브 모드

```bash
grove
```

```
  ╭─────────────────────────────╮
  │  🌳 GROVE           v0.3.0  │
  ╰─────────────────────────────╯

  ● active  feat/my-feature [clean]
  ◎ base    main  │  prefix  feat/

  ───────────────────────────────────────────

    1  📁  워크트리 생성
    2  🔗  파일 복사
    3  🗑️   워크트리 삭제
    4  📋  목록 보기
    5  ⚙️   설정 초기화
    6  🔍  PR 리뷰

  ───────────────────────────────────────────
  ?  도움말   q  종료
```

### 서브커맨드

```bash
grove create      # 워크트리 생성
grove cd [이름]   # 워크트리로 이동 (아래 셸 설정 필요)
grove remove      # 워크트리 삭제 (다중 선택 + 브랜치 동시 삭제)
grove list        # 목록 보기 (active 마커 + clean/dirty 상태)
grove link        # 파일 복사 (FILES 설정 기반)
grove config      # 설정 초기화
grove pr-review   # PR 리뷰
grove help        # 커맨드 목록 및 설정 가이드
grove shell-init  # grove cd용 셸 함수 출력
```

### 워크트리 이동 (`grove cd`)

셸의 작업 디렉토리는 자식 프로세스가 바꿀 수 없으므로, 셸 함수를 한 번 등록해야 합니다.

`~/.zshrc` (또는 `~/.bashrc`)에 추가:

```bash
eval "$(grove shell-init)"
```

이후:

```bash
grove cd feat-login   # 이름 또는 브랜치명 부분 일치
grove cd              # 목록에서 선택
```

워크트리 **안**에서 실행해도 프로젝트 루트를 자동으로 찾습니다. 이동한 워크트리는 `active`로 기록되어 메뉴 대시보드에 표시됩니다.

### 워크트리 삭제 (`grove remove`)

체크박스로 여러 개를 한 번에 삭제합니다. (`Space` 선택 / `a` 전체 / `Enter` 확정)

- **머지 완료 워크트리는 자동 선택됩니다.** 일반 머지뿐 아니라 **squash 머지**도 감지합니다.
- 워크트리를 지우면 **로컬 브랜치도 함께** 삭제됩니다 (별도 확인 없음).
- 자동 선택에서 제외되는 경우 — 커밋 안 된 변경이 있거나(`변경 있음`), 아직 push되지 않은 브랜치(`원격 없음`)이거나, 보호 브랜치(`보호`)일 때. 배지로 표시되며 수동 선택은 가능합니다.
- 보호 브랜치(`main` `master` `dev` `develop` `staging` `production`)는 워크트리만 지우고 브랜치는 유지합니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| **워크트리 생성** | 새 브랜치 또는 기존 브랜치로 워크트리 생성 |
| **파일 복사** | `.env` 등 공통 파일을 워크트리에 복사 (docker bind mount 호환) |
| **훅 시스템** | 워크트리 생성 전후 커스텀 명령 자동 실행 (docker-compose 등) |
| **active 추적** | 현재 작업 중인 워크트리를 메뉴에서 바로 확인 |
| **워크트리 이동** | `grove cd`로 워크트리 간 이동 (이름/브랜치 부분 일치) |
| **워크트리 삭제** | 다중 선택 + 로컬 브랜치 동시 삭제, 머지 완료 항목 자동 선택 |
| **PR 리뷰** | GitHub PR을 워크트리로 체크아웃 (`gh` CLI 필요) |
| **새 버전 알림** | 업데이트 출시 시 메뉴에서 알림 표시 |

## 디렉토리 구조

```
my-project/
├── .bare/                 # Git bare repository
├── .worktree.config       # 설정 파일
├── .env                   # 공통 환경 변수 (복사 원본)
├── main/                  # main 브랜치 워크트리
├── feat-login/            # feature 브랜치 워크트리
└── pr-123/                # PR 리뷰용 워크트리
```

## 설정 파일

`.worktree.config`:

```bash
BARE_DIR=".bare"
DEFAULT_BASE_BRANCH="main"
DEFAULT_BRANCH_PREFIX="feat/"

# 워크트리 생성 시 복사할 파일 (소스:대상)
FILES=(
  ".env:.env"
  ".env.local:backend/.env.local"
)

# 새 워크트리 생성 전 실행 (기존 환경 정리)
PRE_SWITCH_COMMANDS=(
  "docker-compose down"
)

# 새 워크트리 생성 후 실행 (새 환경 시작)
POST_CREATE_COMMANDS=(
  "docker-compose up -d"
)
```

> `POST_CREATE_COMMANDS` 실행 시 `COMPOSE_PROJECT_NAME`이 워크트리 폴더명으로 자동 설정됩니다. 여러 워크트리를 동시에 띄워도 컨테이너 이름이 충돌하지 않습니다.

> 기존 `SYMLINKS` 키는 `FILES`로 변경되었습니다. 하위 호환을 위해 `SYMLINKS`도 계속 읽힙니다.

## 주의사항

- **절대 폴더를 rm -rf로 직접 삭제 금지** — worktree 메타데이터가 꼬임
- 꼬였을 때: `git -C .bare worktree prune`
- `.bare/worktrees/` 폴더를 직접 건드리지 말 것

## 요구사항

- Node.js >= 14.0.0
- Git >= 2.5.0
- GitHub CLI (`gh`) — PR 리뷰 기능 사용 시
