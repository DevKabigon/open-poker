# OpenPoker Domain State Machine Contract

## 목적

이 문서는 `packages/domain`의 다음 단계인 `Command -> validate -> DomainEvent[] -> reduce()` 구조에서
어떤 입력과 출력을 고정할지 정리한 계약 문서다.

핵심 목적은 아래와 같다.

- 외부 입력과 내부 계산 결과를 분리한다.
- 랜덤 요소와 자동 진행을 이벤트 레벨에서 고정한다.
- 나중에 Durable Object에서 그대로 재생 가능한 이벤트 스트림을 만든다.
- reducer가 helper 함수들을 "호출해서 재계산"하는 코드가 아니라 "사실을 적용"하는 코드가 되게 한다.

## 기본 원칙

### 1. Command는 의도이고 Event는 사실이다

- `Command`는 외부에서 들어오는 요청이다.
- `DomainEvent`는 도메인이 검증 후 확정한 결과다.

예:

- `START_HAND`는 "다음 핸드를 시작해라"라는 의도다.
- `HAND_STARTED`는 "딜러는 2번, SB는 3번, BB는 5번, 남은 덱은 이 순서다"라는 사실이다.

### 2. Event는 reducer가 재계산 없이 적용할 수 있어야 한다

이벤트 재생 시 로직 구현이 바뀌어도 과거 이벤트가 다른 상태를 만들면 안 된다.

그래서 이벤트에는 아래처럼 "결정된 결과"가 들어가야 한다.

- 홀카드 배분 결과
- 남은 덱 순서
- 적용된 validated action
- street advance 때 실제 burn / board 카드
- showdown 정산 결과

반대로 event에 seed만 넣고 reducer가 다시 셔플하면 안 된다.

### 3. 자동 진행도 event로 남긴다

포커 엔진은 외부 커맨드 하나에 대해 내부적으로 여러 단계가 자동으로 이어질 수 있다.

예:

- 플레이어 액션 후 betting round 종료
- all-in runout으로 flop/turn/river 자동 진행
- 마지막 surviving player가 생겨 핸드 즉시 종료

이 자동 진행도 모두 event로 남겨야 한다.

## Command 계약

이번 단계에서 우선 고정할 command는 아래 다섯 개다.

### `START_HAND`

새 핸드를 시작한다.

필드:

- `type = "start-hand"`
- `seed`
- `handId?`
- `timestamp?`

설명:

- `seed`는 셔플 재현성을 위해 필요하다.
- `handId`는 외부에서 지정 가능하지만 없으면 도메인이 기본값을 만든다.

### `ACT`

현재 acting seat가 액션한다.

필드:

- `type = "act"`
- `seatId`
- `action`
- `timestamp?`

설명:

- `action`은 현재의 `ActionRequest`를 그대로 사용한다.
- 합법성 검사는 reducer 안에서 현재 state 기준으로 수행한다.

### `TIMEOUT`

현재 acting seat의 시간이 만료되었다.

필드:

- `type = "timeout"`
- `seatId`
- `timestamp?`

설명:

- timeout은 외부에서 `check` 또는 `fold`를 직접 보내지 않는다.
- reducer가 현재 state를 보고 "체크 가능하면 체크, 아니면 폴드"로 해석한다.

### `ADVANCE_STREET`

현재 street가 종료되어 다음 street로 진행한다.

필드:

- `type = "advance-street"`
- `timestamp?`

설명:

- command에는 카드가 없다.
- reducer는 현재 `state.deck`에서 필요한 burn / board 카드를 뽑고, 그 결과를 event에 고정한다.

### `SETTLE_SHOWDOWN`

showdown 상태를 정산한다.

필드:

- `type = "settle-showdown"`
- `timestamp?`

설명:

- command는 정산 의도만 가진다.
- 실제 승자, split, odd chip, payout은 event에서 고정된다.

## DomainEvent 계약

### `HAND_STARTED`

핸드 시작 결과를 고정한다.

포함해야 할 것:

- `handId`
- `handNumber`
- `blindAssignments`
- `blindPostings`
- `holeCardAssignments`
- `remainingDeck`
- `resolution`
- `timestamp`

중요:

- `remainingDeck`가 꼭 필요하다.
- replay 시 reducer는 다시 셔플하지 않고 event의 deck 결과를 적용해야 한다.

### `ACTION_APPLIED`

플레이어 액션 또는 timeout 해석 결과를 고정한다.

포함해야 할 것:

- `seatId`
- `source = "player" | "timeout"`
- `action`
- `resolution`
- `winningSeatId`
- `timestamp`

중요:

- `action`은 이미 validated / normalized 된 결과여야 한다.
- 예를 들어 timeout이 fold로 해석되면 event에는 fold가 들어간다.

### `HAND_AWARDED_UNCONTESTED`

마지막 surviving player가 생겨 showdown 없이 핸드가 끝난 경우의 결과다.

포함해야 할 것:

- `winnerSeatId`
- `amount`
- `timestamp`

설명:

- 이 event는 나중 reducer에서 "폴드로 전원 탈락" 케이스를 명확히 분리하는 데 중요하다.

### `STREET_ADVANCED`

다음 street 진행 결과를 고정한다.

포함해야 할 것:

- `fromStreet`
- `toStreet`
- `burnCard?`
- `boardCards`
- `requiresAction`
- `isTerminal`
- `timestamp`

중요:

- burn / board 카드가 실제 fact다.
- all-in runout 자동 진행도 street advance event 여러 개로 남긴다.

### `SHOWDOWN_SETTLED`

showdown 정산 결과를 고정한다.

포함해야 할 것:

- `potAwards`
- `payouts`
- `uncalledBetReturn`
- `timestamp`

중요:

- reducer는 replay 시 evaluator를 다시 돌리지 않아도 된다.
- 승자와 분배가 이미 fact로 들어와 있어야 한다.

## Reducer가 해야 할 일

reducer는 아래 순서로 움직이게 설계한다.

1. command를 구조적으로 검증한다.
2. 현재 state 기준으로 command가 합법인지 검사한다.
3. helper 함수를 사용해 결과를 계산한다.
4. 계산 결과를 `DomainEvent[]`로 만든다.
5. event를 순서대로 reduce한다.

## 자동 진행 규칙

### 액션 이후

- `needs-action`: 다음 외부 command를 기다린다.
- `round-complete`: 보통 `ADVANCE_STREET`가 이어진다.
- `all-in-runout`: flop -> turn -> river -> showdown까지 자동 event 생성 가능
- `hand-complete`: `HAND_AWARDED_UNCONTESTED`로 바로 종료

### showdown 이후

- `SHOWDOWN_SETTLED` event 적용 후 상태는 `settled`

## 이번 단계 구현 범위

이번 단계에서는 아래까지만 먼저 구현한다.

- `commands.ts`
- `events.ts`
- command / event 구조 검증 함수
- 문서화

아직 이 단계에서 하지 않는 것:

- 전체 reducer
- command dispatch loop
- auto-generated event chaining

## 다음 단계

이 계약이 고정되면 다음으로 갈 것은 `reducer.ts`다.

그때는 아래 helper들을 하나의 흐름으로 묶는다.

- `startNextHand`
- `validateActionRequest`
- `applyValidatedActionToBettingRound`
- `drawCardsForStreetTransition`
- `advanceToNextStreet`
- `settleShowdown`
