export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

interface CircuitState {
  failures: number;
  openUntil: number;
}

export class AiCircuitBreaker {
  private readonly states = new Map<string, CircuitState>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  canRequest(key: string, now = Date.now()) {
    const state = this.states.get(key);
    if (!state) return true;
    if (state.openUntil > 0 && state.openUntil <= now) {
      this.states.delete(key);
      return true;
    }
    return state.openUntil === 0;
  }

  recordSuccess(key: string) {
    this.states.delete(key);
  }

  recordFailure(key: string, now = Date.now()) {
    const current = this.states.get(key) ?? { failures: 0, openUntil: 0 };
    const failures = current.failures + 1;
    this.states.set(key, {
      failures,
      openUntil: failures >= this.options.failureThreshold ? now + this.options.cooldownMs : 0,
    });
  }

  reset() {
    this.states.clear();
  }
}

export async function runWithTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
