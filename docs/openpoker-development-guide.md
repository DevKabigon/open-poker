# OpenPoker Development Guide

## 1. 문서 목적

이 문서는 현재의 `Solid + Vite` 단일 앱 초기 상태에서 출발해, `OpenPoker`를 실전형 온라인 포커 서비스로 단계적으로 확장하는 개발 과정을 정리한 실행 가이드다.

이 프로젝트의 핵심은 "포커 UI"가 아니라 **재현 가능하고 검증 가능한 상태 머신을 가진 실시간 테이블 서버**를 먼저 만드는 것이다.

OpenPoker의 초기 방향은 아래와 같다.

- 제품 이름: `OpenPoker`
- 장르: 온라인 포커
- 게임 타입: `6-max No-Limit Texas Hold'em Cash Game`
- 스타일 방향: `GGPoker`, `PokerStars`, `WPT` 같은 정통 온라인 포커 클라이언트의 정보 밀도와 테이블 감성을 참고
- 구현 우선순위: UI보다 도메인 엔진, 도메인 엔진보다 상태 일관성

이 문서는 다음 질문에 답하도록 작성한다.

- 지금 있는 Solid 프로젝트를 어떤 구조로 바꿔야 하는가
- 무엇을 먼저 만들고 무엇을 나중에 만들어야 하는가
- 도메인 패키지와 테이블 상태 머신은 어떻게 설계해야 하는가
- Durable Objects, Hono, D1, Queues는 각각 어디에 써야 하는가
- 프론트엔드는 어떤 방식으로 서버 상태를 소비해야 하는가
- 테스트는 어떤 순서와 기준으로 붙여야 하는가

---

## 2. 제품 목표

OpenPoker의 첫 번째 목표는 "대규모 포커 플랫폼"이 아니라 **안정적인 단일 테이블 실시간 포커 경험**을 만드는 것이다.

초기 MVP에서 달성해야 할 사용자 경험은 아래다.

- 유저가 로비에서 방을 선택하거나 생성한다.
- 테이블에 앉는다.
- 블라인드가 돌아가고, 프리플랍부터 쇼다운까지 한 핸드가 정상 진행된다.
- 베팅, 콜, 체크, 폴드, 올인이 규칙에 맞게 처리된다.
- 팟과 사이드팟이 정확히 계산된다.
- 쇼다운 시 승자와 분배 금액이 정확하다.
- 잠깐 끊겼다가 다시 접속해도 현재 테이블 상태를 복구할 수 있다.
- UI는 서버가 확정한 상태만 보여주고, 클라이언트는 임의로 게임 결과를 결정하지 않는다.

MVP에서 제외할 항목은 명확히 잘라낸다.

- 토너먼트
- Sit & Go
- 채팅
- 관전
- 친구 초대
- 이모지/리액션
- 보험
- 러닝 잇 트와이스
- 스트래들
- 핸드 리플레이 UI
- 다중 통화
- 레이크백, VIP 시스템
- 고급 반부정행위 시스템

---

## 3. 가장 중요한 설계 원칙

### 3.1 진실의 원천은 Durable Object다

현재 진행 중인 게임 상태는 `D1`이 아니라 `PokerRoom Durable Object`가 진실이어야 한다.

- DO는 실시간 테이블의 authoritative state를 가진다.
- D1은 장기 저장소다.
- D1은 핸드 종료 후 결과 저장, 유저 프로필, 칩 ledger, 통계 요약에만 사용한다.
- 실시간 베팅 순서, 현재 턴, 남은 액션 시간, 덱, 홀카드는 D1에 두지 않는다.

### 3.2 도메인 로직은 프레임워크 바깥에 둔다

포커 규칙은 `packages/domain`에 있어야 한다.

- Solid 컴포넌트 안에 룰을 넣지 않는다.
- Hono 라우터 안에 베팅 로직을 넣지 않는다.
- Durable Object 클래스 안에 족보 판정 알고리즘을 직접 쓰지 않는다.
- 포커 규칙은 순수 함수와 명시적인 타입으로 구성한다.

### 3.3 상태는 분리해서 다룬다

서버 상태를 하나의 큰 `GameState`로 클라이언트에 넘기지 않는다.

상태는 최소 세 가지로 구분한다.

- `InternalRoomState`
- `PublicTableView`
- `PrivatePlayerView`

예시:

```ts
type PublicTableView = {
  roomId: string
  handId: string | null
  street: 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
  dealerSeat: number | null
  actingSeat: number | null
  board: string[]
  mainPot: number
  sidePots: Array<{ amount: number; eligibleSeatIds: number[] }>
  seats: Array<{
    seatId: number
    playerId: string | null
    name: string | null
    stack: number
    committed: number
    hasFolded: boolean
    isAllIn: boolean
    isDisconnected: boolean
  }>
}

type PrivatePlayerView = {
  playerId: string
  holeCards: [string, string] | null
  allowedActions: Array<'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'>
  callAmount: number
  minRaiseTo: number | null
  maxRaiseTo: number | null
  actionDeadlineAt: string | null
}
```

### 3.4 모든 게임 진행은 deterministic 해야 한다

같은 입력이 들어오면 같은 결과가 나와야 한다.

- 셔플은 seed 기반 또는 RNG 호출이 기록 가능해야 한다.
- 커맨드는 순서가 보장되어야 한다.
- 상태 전이는 replay 가능해야 한다.
- 핸드 결과는 이벤트 로그만 있으면 재구성 가능해야 한다.

### 3.5 커맨드와 이벤트를 분리한다

핵심 파이프라인은 다음 구조를 따른다.

`Command -> validate -> DomainEvent[] -> reduce()`

예시:

- `PLAYER_ACTION` 커맨드를 받는다.
- 현재 턴, 스택, 최소 레이즈 규칙을 검증한다.
- 검증이 통과하면 `PlayerCalled`, `StreetAdvanced` 같은 이벤트를 만든다.
- `reduce()`가 이벤트를 적용해 새 상태를 만든다.

이 구조를 쓰면 아래 이점이 있다.

- 테스트가 쉽다.
- 재현이 쉽다.
- DO와 도메인이 분리된다.
- 나중에 핸드 리플레이를 만들기 좋다.

### 3.6 UI는 서버 확정 상태를 따라간다

클라이언트는 낙관적으로 "게임 결과"를 정하지 않는다.

- 버튼 잠금
- 로딩 표시
- 칩 애니메이션
- 액션 전송 중 스피너

정도만 낙관적으로 처리한다.

실제 값은 항상 서버 ack 기준으로 반영한다.

- 팟 금액
- 현재 턴
- 스택
- 보드 카드
- 쇼다운 결과

---

## 4. MVP 범위 정의

첫 번째 릴리스는 아래 규칙으로 제한한다.

### 4.1 게임 규칙

- 6인 테이블
- 노리밋 텍사스 홀덤
- 캐시 게임
- 2명 이상 착석 시 핸드 시작 가능
- 자동 블라인드 진행
- 액션 타이머 지원
- 폴드/체크/콜/베트/레이즈/올인/타임아웃 지원
- 쇼다운 및 승자 정산
- 사이드팟 지원

### 4.2 운영 규칙

- 방별 설정: 소블라인드, 빅블라인드, 최소/최대 바이인
- 개인별 스택 보유
- 핸드 종료 후 결과 저장
- 재접속 복구

### 4.3 의도적으로 단순화하는 규칙

- 초기에는 안테 없음
- 초기에는 레이크 없음
- 초기에는 미스딜 처리 없음
- 초기에는 유저 강퇴/투표 시스템 없음
- 초기에는 시트 변경은 간단한 leave/join으로 처리
- 초기에는 멀티테이블 플레이 없음

### 4.4 스타일 참고

GGPoker, PokerStars, WPT는 "화면 구성과 분위기" 참고 대상으로만 사용한다.

- 진한 테이블 중심 레이아웃
- 좌석 중심 정보 배치
- 보드와 팟 정보의 높은 가독성
- 액션 버튼의 빠른 인지성
- 칩 이동 애니메이션
- 남은 시간 표시

하지만 초기 구현은 외형보다 규칙 엔진을 우선한다.

---

## 5. 현재 레포 상태와 목표 레포 상태

현재 레포는 Solid Vite 단일 앱 구조다.

```text
open-poker/
  docs/
  public/
  src/
  index.html
  package.json
  vite.config.ts
```

이 상태는 UI 실험에는 좋지만, OpenPoker 같은 실시간 게임 서버 구조에는 금방 한계가 온다.

목표 구조는 아래와 같다.

```text
open-poker/
  apps/
    web/
    worker/
  packages/
    domain/
    protocol/
  docs/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  wrangler.toml
```

각 디렉토리의 역할은 아래와 같다.

### 5.1 `apps/web`

Solid 프론트엔드 앱.

- 로비 화면
- 테이블 화면
- 로그인/게스트 진입 화면
- WebSocket 연결
- 서버 상태 렌더링
- 최소한의 UI 전용 로컬 상태

### 5.2 `apps/worker`

Cloudflare Worker 진입점.

- Hono API
- 인증
- 로비 목록
- 방 생성/입장
- Durable Object 호출
- D1/Queues 연계

### 5.3 `packages/domain`

포커 규칙 엔진.

- 카드, 덱, 셔플
- 족보 판정
- 타이브레이커
- 사이드팟
- 액션 유효성 검사
- 스트리트 전환
- 한 핸드 전체 리듀서

### 5.4 `packages/protocol`

웹과 워커 간에 공유하는 계약 타입.

- WebSocket inbound message
- WebSocket outbound message
- API DTO
- 공용 view model

이 패키지는 필수는 아니지만, UI와 Worker가 같은 메시지 구조를 공유하기 시작하는 순간 거의 반드시 필요해진다.

---

## 6. 추천 개발 순서

OpenPoker는 반드시 아래 순서를 지키는 것이 좋다.

1. 현재 Solid 앱을 workspace 구조로 옮긴다.
2. `packages/domain`부터 만든다.
3. 단위 테스트와 시뮬레이션 테스트를 만든다.
4. 한 핸드 전체를 돌리는 상태 머신을 완성한다.
5. `PokerRoom` Durable Object를 붙인다.
6. Hono API를 붙인다.
7. 마지막에 테이블 UI를 얹는다.
8. 핸드 결과 저장, 통계, ledger를 붙인다.
9. 폴리시와 QA를 보강한 뒤 배포한다.

가장 먼저 구현할 3가지는 절대 바뀌지 않는다.

- 사이드팟 계산기
- 족보 판정기 + 타이브레이커
- 한 핸드 전체 리듀서

---

## 7. Phase 0: 레포 재구성

이 단계의 목표는 현재 Solid 단일 앱을 OpenPoker용 workspace로 바꾸는 것이다.

### 7.1 해야 할 일

- 루트에 `pnpm-workspace.yaml` 추가
- 현재 웹 앱 파일을 `apps/web`로 이동
- 루트 `package.json`은 workspace orchestration 역할만 하도록 변경
- 공통 `tsconfig.base.json` 추가
- `apps/worker` 생성
- `packages/domain` 생성
- `packages/protocol` 생성
- `wrangler.toml` 추가

### 7.2 현재 Solid 앱에서 이동할 파일

현재 루트의 아래 파일들은 대부분 `apps/web`로 이동한다.

- `src/`
- `public/`
- `index.html`
- `vite.config.ts`
- `tsconfig.app.json`
- `tsconfig.node.json`

루트에는 아래 성격의 파일만 남긴다.

- workspace 설정
- 공통 타입스크립트 설정
- 공통 스크립트
- 배포 설정
- 문서

### 7.3 루트 스크립트 예시

```json
{
  "name": "open-poker",
  "private": true,
  "scripts": {
    "dev:web": "pnpm --filter @openpoker/web dev",
    "dev:worker": "pnpm --filter @openpoker/worker dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

### 7.4 이 단계의 완료 기준

- 웹 앱이 `apps/web`에서 기존처럼 실행된다.
- `apps/worker`, `packages/domain`, `packages/protocol`이 생성되어 있다.
- 앞으로 도메인과 워커를 UI와 독립적으로 개발할 수 있다.

---

## 8. Phase 1: `packages/domain` 설계

이 단계는 OpenPoker의 실제 심장부다.

### 8.1 우선 구현할 모듈

- `card`
- `deck`
- `hand-evaluator`
- `tiebreaker`
- `side-pot`
- `betting-rules`
- `table-order`
- `state-machine`

### 8.2 권장 디렉토리 구조

```text
packages/domain/
  src/
    cards/
      card.ts
      deck.ts
      rank.ts
      suit.ts
    hand-ranking/
      evaluate-seven-cards.ts
      compare-hands.ts
      hand-rank.ts
    betting/
      side-pot.ts
      action-validation.ts
      raise-rules.ts
    table/
      positions.ts
      blind-order.ts
      acting-order.ts
    engine/
      commands.ts
      events.ts
      reducer.ts
      state.ts
      transitions.ts
    index.ts
  test/
```

### 8.3 핵심 타입

최소한 아래 타입부터 시작한다.

```ts
export type Suit = 'c' | 'd' | 'h' | 's'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

export type Card = {
  rank: Rank
  suit: Suit
}

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export type SeatId = number

export type PlayerActionType =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all-in'
  | 'timeout'
```

### 8.4 초기 상태 설계에서 반드시 들어가야 할 값

`InternalRoomState`에는 최소 아래 정보가 필요하다.

- room id
- hand id
- hand sequence
- seat 상태
- 버튼 위치
- small blind seat
- big blind seat
- acting seat
- street
- deck
- board
- hole cards
- current wager
- min raise increment
- per-seat committed amount
- per-seat total invested amount
- folded/all-in 상태
- action deadline
- event sequence
- replay용 metadata

### 8.5 족보 판정 구현 전략

처음부터 미세 최적화하지 않는다.

MVP에서는 아래 방식이 가장 안전하다.

- 7장 중 가능한 5장 조합 `21개`를 모두 생성한다.
- 각 5장 조합을 평가한다.
- 가장 높은 족보를 선택한다.
- 같은 족보면 타이브레이커 배열로 비교한다.

이 방식은 극단적 성능 최적화는 아니지만, 구현과 검증이 쉽고 버그 가능성이 낮다.

족보 판정 시 반드시 테스트할 항목:

- 하이카드
- 원페어
- 투페어
- 트립스
- 스트레이트
- 휠 스트레이트 `A-2-3-4-5`
- 플러시
- 풀하우스
- 포카드
- 스트레이트 플러시
- 로열 플러시
- 동일 족보 간 키커 비교

### 8.6 사이드팟 구현 전략

사이드팟 계산은 투자 금액 기준으로 처리한다.

핵심 아이디어:

1. 폴드 여부와 무관하게 각 플레이어의 총 투자액을 모은다.
2. 0보다 큰 투자액을 오름차순으로 정렬한다.
3. 각 임계값 구간마다 살아 있는 eligible player를 계산한다.
4. 그 구간의 금액 차이 x 남은 참여자 수로 팟을 만든다.
5. eligible player가 1명뿐이면 이미 자동 승리 처리 가능한지 별도 판단한다.

테스트는 반드시 표 기반으로 만든다.

예시 케이스:

- 3인 모두 동일 스택 올인
- 3인 중 1명만 짧은 스택 올인
- 4인 복수 사이드팟
- 폴드한 플레이어의 투자액이 포함된 케이스
- 메인팟과 사이드팟 우승자가 서로 다른 케이스

### 8.7 액션 검증에서 빼먹기 쉬운 것

- 현재 턴 플레이어만 액션 가능
- 체크는 콜 금액이 0일 때만 가능
- 콜은 필요한 금액 이상 스택이 있어야 함
- 올인은 현재 스택 전부
- 최소 레이즈 규칙 유지
- 이미 폴드한 플레이어는 액션 불가
- 이미 올인한 플레이어는 액션 불가
- 스트리트 종료 조건 정확히 계산
- 헤즈업에서 버튼/블라인드/액션 순서 예외 처리

### 8.8 이 단계의 완료 기준

- 카드/덱/족보/타이브레이커/사이드팟이 모두 순수 함수로 구현되어 있다.
- 랜덤 입력 없이도 테스트 가능한 구조다.
- 도메인 패키지는 UI와 Cloudflare 런타임 없이 독립 실행 가능하다.

---

## 9. Phase 2: 테스트 먼저 붙이기

도메인 코드를 만들면서 동시에 테스트를 붙인다.

### 9.1 테스트 도구

추천:

- `vitest`
- 필요 시 `fast-check` 같은 property-based testing 라이브러리

### 9.2 반드시 있어야 하는 테스트 그룹

#### A. 족보 예제 테스트

입력 카드 7장과 기대 결과를 고정한다.

- 정확한 족보 이름
- 정렬된 타이브레이커
- 비교 결과

#### B. 사이드팟 표 테스트

표 한 줄이 하나의 시나리오가 되도록 만든다.

- 플레이어별 투자액
- 폴드 여부
- expected pots
- eligible seats

#### C. 랜덤 베팅 시퀀스 테스트

규칙 내에서 무작위 액션을 생성한다.

검증해야 할 불변식:

- 전체 칩 총합 보존
- 음수 스택 없음
- 덱 중복 없음
- acting seat가 항상 합법적
- 올인/폴드 플레이어에게 턴이 가지 않음
- 스트리트 전환 후 committed 금액이 적절히 리셋됨

#### D. 한 핸드 전체 시뮬레이션 테스트

프리플랍부터 쇼다운까지 고정 시나리오를 돌린다.

- heads-up 시나리오
- 3인 올인 시나리오
- 중간 폴드로 즉시 승부 종료
- 리버까지 체크다운
- 타임아웃으로 자동 폴드

### 9.3 테스트 파일 예시 구조

```text
packages/domain/test/
  hand-evaluator.spec.ts
  compare-hands.spec.ts
  side-pot.spec.ts
  action-validation.spec.ts
  hand-simulation.spec.ts
```

### 9.4 이 단계의 완료 기준

- 핵심 규칙 코드에 테스트가 먼저 붙어 있다.
- 버그가 생겨도 DO나 UI까지 올라가기 전에 잡을 수 있다.

---

## 10. Phase 3: 한 핸드 전체를 돌리는 상태 머신

이 단계에서 OpenPoker의 실제 게임 흐름이 완성된다.

### 10.1 핵심 구조

권장 구조:

```ts
type Result =
  | { ok: true; events: DomainEvent[] }
  | { ok: false; reason: string }

function validateCommand(state: InternalRoomState, command: Command): Result
function reduce(state: InternalRoomState, event: DomainEvent): InternalRoomState
function reduceMany(state: InternalRoomState, events: DomainEvent[]): InternalRoomState
```

### 10.2 커맨드 예시

```ts
type Command =
  | { type: 'start-hand'; now: number }
  | { type: 'post-blind'; seatId: number; amount: number; now: number }
  | { type: 'player-action'; seatId: number; action: PlayerActionType; amount?: number; now: number }
  | { type: 'timeout'; seatId: number; now: number }
  | { type: 'reveal-showdown'; now: number }
```

### 10.3 이벤트 예시

```ts
type DomainEvent =
  | { type: 'hand-started'; handId: string; dealerSeat: number }
  | { type: 'blind-posted'; seatId: number; amount: number }
  | { type: 'hole-cards-dealt'; seatId: number; cards: [Card, Card] }
  | { type: 'player-folded'; seatId: number }
  | { type: 'player-called'; seatId: number; amount: number }
  | { type: 'player-raised-to'; seatId: number; amount: number }
  | { type: 'street-advanced'; street: Street; board: Card[] }
  | { type: 'pots-created'; pots: SidePot[] }
  | { type: 'hand-settled'; payouts: Array<{ seatId: number; amount: number }> }
```

### 10.4 스트리트 전환 조건

매우 중요하다.

한 스트리트가 끝나는 조건은 단순히 "한 바퀴 돌았다"가 아니다.

다음을 모두 고려해야 한다.

- 살아 있는 플레이어 수
- 폴드하지 않은 플레이어 수
- 올인 아닌 플레이어 수
- 현재 최대 투자액과 각 플레이어 투자액의 일치 여부
- 마지막 공격적 액션 이후 모든 플레이어가 응답했는지 여부

### 10.5 핸드 종료 조건

아래 두 종류를 정확히 구분한다.

- 모든 상대가 폴드해서 즉시 종료
- 쇼다운까지 가서 보드/홀카드로 승자 결정

### 10.6 상태 머신 구현 순서

아래 순서대로 가면 가장 덜 흔들린다.

1. seating 상태
2. hand start
3. blind posting
4. preflop dealing
5. preflop betting
6. flop transition
7. turn transition
8. river transition
9. showdown
10. payout
11. next hand ready

### 10.7 타임아웃 처리 규칙

초기 MVP에서는 가장 단순하게 간다.

- 체크 가능하면 자동 체크
- 체크 불가면 자동 폴드

향후 확장:

- sit out
- auto-post blind
- reconnect grace period

### 10.8 이 단계의 완료 기준

- 한 핸드가 시작부터 종료까지 reducer만으로 진행된다.
- UI 없이도 테스트에서 한 핸드를 끝까지 돌릴 수 있다.
- 재현 가능한 이벤트 로그가 나온다.

---

## 11. Phase 4: `PokerRoom` Durable Object

도메인 패키지가 안정화된 다음에만 DO를 붙인다.

### 11.1 `PokerRoom`의 책임

- 방 하나당 DO 하나
- WebSocket 연결 관리
- 플레이어 커맨드 수신
- 명령 순서 직렬화
- 도메인 리듀서 호출
- 현재 상태 스냅샷 저장
- 가장 가까운 타이머 하나만 Alarm 등록
- 재시작 또는 hibernation 후 상태 복구

### 11.2 DO가 하면 안 되는 일

- 족보 계산 로직 직접 구현
- 사이드팟 계산 로직 직접 구현
- 프론트엔드 뷰 상태를 원본 상태처럼 수정
- D1을 실시간 상태 저장소처럼 사용

### 11.3 권장 내부 구성

```text
apps/worker/src/
  durable-objects/
    poker-room.ts
  routes/
    auth.ts
    lobby.ts
    rooms.ts
  services/
    room-service.ts
    persistence.ts
  index.ts
```

### 11.4 DO 내부 상태 예시

```ts
class PokerRoom extends DurableObject {
  private roomState: InternalRoomState | null = null
  private connections = new Map<string, WebSocket>()
  private sessionByConnection = new Map<string, { playerId: string; seatId: number | null }>()
}
```

### 11.5 저장 전략

DO storage에는 아래 정도를 저장한다.

- room config
- latest snapshot
- event sequence
- latest hand summary pointer

매 액션마다 전체 로그를 D1에 쓰지 않는다.

실시간 경로는 최대한 DO 내부에서 끝내고, 핸드 종료 후 비동기 저장으로 넘긴다.

### 11.6 hibernation 복구 전략

DO는 언제든 잠들거나 재시작될 수 있다고 가정한다.

그래서 아래가 필요하다.

- 스냅샷 직렬화 가능 상태 구조
- 이벤트 시퀀스 번호
- 핸드 진행 중이면 복구 후 다시 타이머 계산
- 재접속 시 public/private view 재전송

### 11.7 WebSocket 메시지 흐름

권장 흐름:

1. 클라이언트가 Worker API에서 인증 또는 게스트 세션을 받는다.
2. 클라이언트가 룸 입장 API를 호출한다.
3. Worker가 room join token 또는 room access metadata를 내려준다.
4. 클라이언트가 room WebSocket에 연결한다.
5. DO가 연결을 인증한다.
6. DO가 `PublicTableView`와 해당 플레이어의 `PrivatePlayerView`를 즉시 보낸다.
7. 플레이어 액션은 `commandId`와 함께 전송한다.
8. DO는 적용 결과를 ack 또는 state patch로 브로드캐스트한다.

### 11.8 메시지 설계 원칙

- 모든 클라이언트 메시지에 `commandId` 포함
- 중복 커맨드는 무시 가능해야 함
- 서버 메시지에 `roomVersion` 또는 `eventSeq` 포함
- public/private payload를 명확히 분리

### 11.9 Alarm 전략

항상 "가장 가까운 타이머 1개"만 등록한다.

예시:

- 현재 액션 제한 시간
- 핸드 간 딜레이
- 재접속 grace period

이벤트가 발생할 때마다 다음 예정 타이머를 재계산한다.

### 11.10 이 단계의 완료 기준

- 한 테이블이 DO 하나로 정상 동작한다.
- 여러 플레이어 연결이 같은 authoritative state를 본다.
- DO 재시작 후 상태를 복구할 수 있다.

---

## 12. Phase 5: Hono API, 인증, 로비, D1, Queues

DO가 작동하면 그 다음에 Worker API 레이어를 붙인다.

### 12.1 Hono API의 역할

- 인증
- 유저 프로필 조회
- 로비 목록
- 방 생성
- 방 입장
- 핸드 종료 후 결과 반영
- 운영성 엔드포인트

### 12.2 초기 인증 전략

혼자 빠르게 MVP를 만들 때는 아래 순서를 추천한다.

1. 개발용 게스트 로그인
2. 닉네임 기반 세션
3. 나중에 실제 인증 추가

초기부터 소셜 로그인까지 붙이면 핵심 루프보다 인증 구현이 더 커질 수 있다.

### 12.3 D1에 저장할 것

- users
- player_profiles
- rooms
- chip_ledger
- hand_summaries
- hand_players
- player_stats

### 12.4 D1에 저장하지 말아야 할 것

- 현재 덱
- 현재 액션 타이머
- 현재 턴
- 홀카드 원본 live state
- 커밋 중인 베팅 상태

### 12.5 Queues로 미루기 좋은 작업

- 핸드 히스토리 아카이브
- 플레이어 통계 집계
- 알림
- 운영 로그 적재

### 12.6 API 예시

- `POST /api/auth/guest`
- `GET /api/lobby/rooms`
- `POST /api/rooms`
- `POST /api/rooms/:roomId/join`
- `POST /api/rooms/:roomId/leave`
- `GET /api/rooms/:roomId/state`

### 12.7 이 단계의 완료 기준

- 프론트엔드가 API를 통해 방을 만들고 입장할 수 있다.
- 핸드 종료 후 D1에 결과가 반영된다.
- 무거운 후처리는 Queues로 분리된다.

---

## 13. Phase 6: `apps/web` Solid 프론트엔드

이 단계는 보기에는 화려하지만 실제로는 가장 마지막이다.

### 13.1 프론트엔드의 역할

- 로비 표시
- 방 생성/입장
- 테이블 렌더링
- WebSocket 연결 유지
- public/private state 렌더링
- 액션 입력 UI 제공

### 13.2 프론트엔드가 하지 말아야 할 일

- 족보 판정
- 승자 계산
- 사이드팟 계산
- 현재 턴 판정
- 서버와 다른 게임 진실 생성

### 13.3 페이지 구조 추천

- `/` 로비
- `/table/:roomId` 테이블
- `/dev` 개발용 테스트 페이지

### 13.4 테이블 화면 구성 추천

- 중앙: 포커 테이블
- 중앙 상단: 보드 카드
- 중앙 중단: 메인팟/사이드팟 표시
- 좌석 주변: 아바타, 닉네임, 스택, 타이머, 마지막 액션
- 하단: 내 액션 패널
- 우상단 또는 상단: 테이블 정보, 블라인드, 핸드 번호

### 13.5 스타일 방향

초기 스타일 방향:

- 딥그린 또는 다크 카지노 톤
- 대비가 강한 액션 버튼
- 읽기 쉬운 숫자 타이포
- 좌석 상태가 한눈에 보이는 UI
- 팟과 현재 턴을 강하게 강조

참고는 하되 그대로 복제하지 않는다.

- GGPoker의 밀도
- PokerStars의 안정감
- WPT의 방송형 테이블 감성

### 13.6 상태 관리 원칙

Solid에서는 로컬 store를 두되, authoritative state는 항상 서버에서 온 값이다.

클라이언트 쪽 상태는 아래 정도로 제한한다.

- 연결 상태
- 마지막으로 받은 public view
- 내 private view
- pending command ids
- 버튼 disabled 상태
- 임시 애니메이션 상태

### 13.7 UI 컴포넌트 후보

- `LobbyPage`
- `TablePage`
- `PokerTable`
- `BoardCards`
- `SeatRing`
- `SeatView`
- `PotDisplay`
- `DealerButton`
- `ActionBar`
- `TimerRing`
- `ConnectionStatus`

### 13.8 액션 UI 처리 원칙

- 클릭 즉시 서버로 커맨드 전송
- 응답 전까지 버튼 잠금
- 응답 오면 최신 상태로 동기화
- 실패하면 에러 배너 또는 토스트

### 13.9 이 단계의 완료 기준

- 두 명 이상의 플레이어가 브라우저에서 같은 방에 들어가 플레이 가능하다.
- UI는 서버 확정 상태를 안정적으로 따라간다.

---

## 14. Phase 7: 데이터 모델과 저장 전략

### 14.1 D1 스키마 초안

초기에는 아래 정도면 충분하다.

- `users`
- `player_profiles`
- `rooms`
- `room_memberships`
- `chip_ledger`
- `hand_summaries`
- `hand_results`

### 14.2 `chip_ledger` 원칙

칩 이동은 가능하면 ledger 형태로 기록한다.

예시:

- buy-in
- top-up
- hand settlement
- admin adjustment

잔액만 덮어쓰는 구조보다 추적이 쉽다.

### 14.3 핸드 결과 저장 시점

핸드가 끝난 다음에만 저장한다.

핸드 중간 액션을 D1에 실시간 반영하려고 하면 복잡도만 올라간다.

### 14.4 저장 흐름 추천

1. DO에서 핸드 종료
2. 승자 정산 완료
3. hand summary 생성
4. Queue에 저장 작업 발행
5. consumer가 D1 반영

필요하면 아주 핵심적인 결과만 동기 저장하고, 나머지는 비동기로 넘긴다.

---

## 15. Phase 8: 운영, 로깅, 관측 가능성

실시간 게임은 버그가 생기면 재현이 어려우므로 로그 설계가 중요하다.

### 15.1 최소 로그 단위

- room id
- hand id
- command id
- event sequence
- acting seat
- action type
- state version

### 15.2 꼭 필요한 운영 확인 항목

- 현재 활성 room 수
- room별 마지막 이벤트 시각
- 복구 후 재개 여부
- queue 적체 여부
- D1 저장 실패율

### 15.3 디버그 모드 추천

개발 환경에서는 아래 기능이 있으면 좋다.

- 현재 internal state 덤프
- 마지막 50개 event 조회
- 특정 hand replay
- 강제 start-hand 버튼
- 테스트 카드 고정 셔플

---

## 16. Phase 9: 테스트 전략 전체 그림

### 16.1 도메인 테스트

가장 중요하다.

- 족보
- 타이브레이커
- 사이드팟
- 액션 검증
- 상태 머신

### 16.2 Worker 통합 테스트

- room 생성
- room 입장
- WebSocket 연결
- 액션 전송
- timeout 처리
- reconnect 처리

### 16.3 UI 테스트

- 로비 진입
- 테이블 렌더링
- 액션 버튼 상태
- 서버 ack 후 상태 갱신

### 16.4 회귀 테스트에서 특히 중요한 것

- heads-up 액션 순서
- 최소 레이즈 규칙
- 올인 후 사이드팟
- 폴드한 플레이어의 투자액 처리
- 휠 스트레이트 비교
- 재접속 후 private view 복원

---

## 17. 단계별 구현 체크리스트

### 17.1 Milestone 1: Workspace 전환

- `apps/web`로 현재 Solid 앱 이동
- `apps/worker` 생성
- `packages/domain` 생성
- `packages/protocol` 생성
- 공통 타입스크립트 설정 정리

### 17.2 Milestone 2: 도메인 코어

- 카드 타입
- 덱
- 7장 족보 판정
- 타이브레이커
- 사이드팟
- 액션 검증

### 17.3 Milestone 3: 상태 머신

- hand start
- blind posting
- street progression
- showdown
- payout
- replay log

### 17.4 Milestone 4: Durable Object

- room state 보관
- WebSocket 연결
- alarm 처리
- snapshot 저장
- recovery 처리

### 17.5 Milestone 5: API + Persistence

- guest auth
- room create/join
- lobby list
- hand result 저장
- queue consumer

### 17.6 Milestone 6: Web UI

- lobby
- table
- action bar
- pot/board/seats
- reconnect UX

### 17.7 Milestone 7: Polish

- 애니메이션
- 사운드
- 라운드 전환 감성
- 에러 처리 강화
- 운영 로그 강화

---

## 18. 자주 저지르는 실수

### 18.1 UI부터 만드는 것

가장 흔한 실패 원인이다.

테이블을 예쁘게 만들기 시작하면 금방 "서버 규칙이 아직 없는데 화면만 있음" 상태가 된다.

### 18.2 D1을 live state 저장소로 쓰는 것

포커 진행 중 상태를 D1에 두면 동시성, 지연, 복구 흐름이 복잡해진다.

### 18.3 도메인 로직을 DO 안에 섞는 것

처음에는 빨라 보여도 테스트가 매우 어려워지고, 규칙 버그가 Worker 런타임에 묶인다.

### 18.4 giant state 하나만 전송하는 것

private 정보와 public 정보를 섞으면 보안과 렌더링 모두 나빠진다.

### 18.5 reducer 없이 조건문으로 핸드를 흘려보내는 것

작게 시작해도 나중에는 반드시 꼬인다.

---

## 19. MVP 완료 기준

아래 조건이 만족되면 OpenPoker MVP 1차 버전으로 본다.

- 2명 이상이 같은 방에서 플레이 가능
- 한 핸드가 프리플랍부터 쇼다운까지 안정적으로 진행됨
- 사이드팟이 정확함
- 족보 및 타이브레이커가 정확함
- 타임아웃이 정상 처리됨
- 재접속 시 현재 테이블 상태를 복원함
- 핸드 종료 후 결과가 D1에 기록됨
- UI가 서버 확정 상태를 안정적으로 표시함

---

## 20. MVP 이후 확장 순서

MVP가 안정화된 뒤에 아래 순서로 확장하는 것이 좋다.

1. 관전자 모드
2. 채팅
3. 핸드 히스토리 UI
4. 테이블 필터와 로비 고도화
5. 사운드와 연출 강화
6. 프로필/전적 화면
7. 레이크/운영 도구
8. 토너먼트

토너먼트는 별도 상태 머신 수준의 복잡도가 있으므로 캐시게임 이후로 미루는 것이 맞다.

---

## 21. 바로 다음 액션

현재 레포 기준으로 가장 먼저 해야 할 일은 아래다.

1. Solid 앱을 `apps/web`로 옮기는 workspace 전환
2. `packages/domain` 생성
3. `side-pot.spec.ts`부터 시작
4. `evaluate-seven-cards.ts`와 `compare-hands.ts` 구현
5. `InternalRoomState`, `Command`, `DomainEvent`, `reduce()` 뼈대 작성

이 순서를 지키면 OpenPoker는 "예쁜 데모"가 아니라 **실제로 굴러가는 포커 엔진 위에 UI를 얹는 구조**로 커질 수 있다.

---

## 22. 한 줄 요약

OpenPoker는 포커 사이트를 만드는 프로젝트가 아니라, **Durable Objects 위에서 동작하는 replayable real-time poker table server를 먼저 만들고, 그 위에 Solid UI를 얹는 프로젝트**로 진행해야 한다.
