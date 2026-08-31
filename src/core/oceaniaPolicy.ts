export type PolicyMetricKey = 'eco' | 'community' | 'economy' | 'culture';
export type PolicyMetrics = Record<PolicyMetricKey, number>;
export type PolicyEffects = Record<string, Record<string, Partial<PolicyMetrics>>>;

export interface PolicyEvent {
  id: string;
  title: string;
  description: string;
  effects: PolicyEffects;
}

export interface PolicyEvidenceSupport {
  control: string;
  options: string[];
  effects: Partial<PolicyMetrics>;
  note: string;
}

export interface PolicyDeltaResult {
  delta: PolicyMetrics;
  eventApplied: boolean;
  evidenceApplied: boolean;
  evidenceNote: string;
}

const METRIC_KEYS: PolicyMetricKey[] = ['eco', 'community', 'economy', 'culture'];

/**
 * 선택의 기본 효과에 현재 사건과 주민 근거의 조건부 효과를 더한다.
 * 무작위가 없어 같은 선택·사건·근거는 언제나 같은 결과를 만든다.
 */
export function calculatePolicyDelta(
  baseEffects: PolicyEffects,
  choices: Record<string, string>,
  event?: PolicyEvent,
  support?: PolicyEvidenceSupport
): PolicyDeltaResult {
  const delta: PolicyMetrics = { eco: 0, community: 0, economy: 0, culture: 0 };
  let eventApplied = false;

  for (const [control, option] of Object.entries(choices)) {
    addEffect(delta, baseEffects[control]?.[option]);
    const eventEffect = event?.effects[control]?.[option];
    if (eventEffect) {
      addEffect(delta, eventEffect);
      eventApplied = true;
    }
  }

  const evidenceApplied = Boolean(
    support && support.options.includes(choices[support.control] ?? '')
  );
  if (evidenceApplied && support) addEffect(delta, support.effects);

  return {
    delta,
    eventApplied,
    evidenceApplied,
    evidenceNote: evidenceApplied && support ? support.note : ''
  };
}

function addEffect(target: PolicyMetrics, effect?: Partial<PolicyMetrics>): void {
  if (!effect) return;
  for (const key of METRIC_KEYS) {
    const value = effect[key];
    if (typeof value === 'number' && Number.isFinite(value)) target[key] += value;
  }
}
