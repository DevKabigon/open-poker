# OpenPoker Domain Engine Roadmap

## 목적

이 문서는 `packages/domain`을 어떤 순서로 구현할지 정리한 도메인 전용 로드맵이다.

핵심 목표는 아래와 같다.

- 포커 규칙을 UI와 완전히 분리한다.
- 예외 상황을 테스트로 먼저 잠근다.
- reducer와 Durable Object가 기대할 수 있는 안정적인 상태 계약을 만든다.
- "기본 규칙"보다 "경계 조건과 예외 처리"를 우선한다.

## 왜 UI 없이 테스트하는가

포커 엔진은 브라우저로 눈으로 확인하는 방식보다 `TypeScript unit test`가 훨씬 안전하다.

- 사이드팟, re-open 규칙, heads-up 예외는 수동 클릭으로 검증하기 어렵다.
- 시각적으로 맞아 보여도 내부 상태가 틀릴 수 있다.
- 실시간 환경에 붙은 뒤 버그를 고치면 원인 추적이 훨씬 힘들다.

따라서 초반에는 `packages/domain`에서 순수 함수와 테스트만으로 검증한다.

## 구현 순서

### Phase 1. rules / state / invariants

첫 단계에서는 "유효한 테이블 상태가 무엇인가"를 고정한다.

만들 것:

- `rules.ts`
- `state.ts`
- `invariants.ts`
- unit tests

이 단계에서 아직 만들지 않는 것:

- 액션 검증
- 사이드팟
- 족보 판정
- reducer

### Phase 2. positions / blind order / acting order

둘째 단계에서는 좌석 순서를 순수 함수로 고정한다.

만들 것:

- 버튼 이동
- small blind / big blind 결정
- preflop acting order
- postflop acting order
- heads-up 예외 처리

### Phase 3. betting primitives

셋째 단계에서는 베팅 코어 규칙을 만든다.

만들 것:

- check / call / bet / raise / all-in validation
- current bet 계산
- min raise 규칙
- short all-in 규칙
- betting round 종료 판정

### Phase 4. side pots

넷째 단계에서는 투자 금액만으로 pot slice를 생성할 수 있어야 한다.

### Phase 5. hand evaluation / showdown

다섯째 단계에서는 7장 기준 족보 판정과 타이브레이커를 구현한다.

### Phase 6. command / event / reducer

마지막으로 `Command -> validate -> DomainEvent[] -> reduce()` 구조를 붙인다.

## 이번 단계의 설계 기준

### rules

첫 단계에서는 아래 규칙을 명시적으로 타입에 넣는다.

- Texas Hold'em
- No-Limit
- Cash Game
- 6-max
- ante 없음
- straddle 없음
- timeout 시 check 가능하면 check, 아니면 fold

### state

상태는 나중에 계산에 필요한 원본 값만 가진다.

최소 필수 필드:

- room id
- table config
- hand status
- street
- dealer / small blind / big blind / acting seat
- 각 seat의 stack / committed / totalCommitted
- currentBet
- lastFullRaiseSize
- board / deck / burnCards
- mainPot / sidePots

### invariants

모든 reducer 뒤에 항상 참이어야 하는 규칙이다.

반드시 검증할 것:

- seat 개수는 `config.maxSeats`와 같아야 한다.
- seat id는 유일해야 한다.
- occupied seat의 player id는 유일해야 한다.
- 음수 칩 값이 없어야 한다.
- `committed <= totalCommitted`
- `currentBet === max(seat.committed)`
- board 길이는 street와 일치해야 한다.
- acting seat는 실제로 액션 가능한 플레이어여야 한다.
- 카드 중복이 없어야 한다.

## 테스트 전략

첫 단계 테스트는 아래 세 묶음으로 시작한다.

### 1. rules 테스트

- 기본 config가 유효한지
- blind / buy-in 설정 오류를 잡는지

### 2. state 테스트

- `createInitialRoomState()`가 유효한 waiting state를 만드는지
- 빈 좌석이 명확하게 초기화되는지

### 3. invariants 테스트

- 중복 player id 감지
- street와 board 길이 불일치 감지
- acting seat가 fold/all-in/empty seat를 가리키는 경우 감지
- 카드 중복 감지

## 이후 단계에서 반드시 잠가야 할 예외 목록

나중 단계에서 반드시 고정 테스트로 만들 항목들:

- heads-up에서 버튼이 small blind인지
- preflop에서 BB option 처리
- short all-in이 action을 reopen 하지 않는 경우
- 모두 폴드하여 즉시 핸드 종료
- 언콜된 초과 베팅 반환
- odd chip 분배
- multi-way all-in side pot
- 휠 스트레이트
- split pot
- timeout auto-check / auto-fold

## 이번 단계 완료 기준

이 단계가 끝났다고 말할 수 있으려면 아래가 만족되어야 한다.

- `rules.ts`, `state.ts`, `invariants.ts`가 분리되어 있다.
- `pnpm test`로 도메인 테스트를 실행할 수 있다.
- `createInitialRoomState()`가 invariant를 통과한다.
- 일부 명백한 invalid state를 테스트로 잡아낸다.

## 다음 단계

이번 단계가 안정화되면 바로 다음으로 갈 것은 `positions / blind order / acting order`다.

이유는 간단하다.

- 누가 먼저 행동하는지가 틀리면 그 뒤 로직은 전부 틀린다.
- heads-up 예외는 아주 초기에 잠가야 한다.
- side pot보다 먼저, showdown보다 먼저, 액션 순서가 고정되어야 한다.
