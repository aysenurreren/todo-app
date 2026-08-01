// ── Circuit Breaker ────────────────────────────────────────────
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name        = name;
    this.state       = "CLOSED";    // CLOSED, OPEN, HALF_OPEN
    this.failures    = 0;
    this.successess  = 0;
    this.lastFailure = null;

    this.threshold   = options.threshold  || 5;    // kaç hatada açılsın
    this.timeout     = options.timeout    || 30000; // kaç ms açık kalsın
    this.halfOpenMax = options.halfOpenMax || 1;    // yarı açıkta kaç istek
  }

  async execute(fn) {
    if (this.state === "OPEN") {
      // Timeout geçti mi? Yarı açık moduna geç
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = "HALF_OPEN";
        this.successess = 0;
      } else {
        throw new Error(`[CircuitBreaker] ${this.name} devresi açık`);
      }
    }

    try {
      const result = await fn();

      // Başarılı istek
      if (this.state === "HALF_OPEN") {
        this.successess++;
        if (this.successess >= this.halfOpenMax) {
          this.reset();
        }
      } else {
        this.failures = 0;
      }

      return result;
    } catch (err) {
      this.failures++;
      this.lastFailure = Date.now();

      if (this.failures >= this.threshold) {
        this.state = "OPEN";
        console.error(`[CircuitBreaker] ${this.name} devresi açıldı!`);
      }

      throw err;
    }
  }

  reset() {
    this.state    = "CLOSED";
    this.failures = 0;
    this.successess = 0;
    console.log(`[CircuitBreaker] ${this.name} devresi kapandı`);
  }

  getState() {
    return {
      name:     this.name,
      state:    this.state,
      failures: this.failures,
    };
  }
}

// PostgreSQL ve Redis için ayrı circuit breaker
export const dbCircuitBreaker    = new CircuitBreaker("PostgreSQL", { threshold: 5, timeout: 30000 });
export const redisCircuitBreaker = new CircuitBreaker("Redis",      { threshold: 5, timeout: 10000 });

export default CircuitBreaker;