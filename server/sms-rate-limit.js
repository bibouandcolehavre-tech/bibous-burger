const createSmsAttemptLimiter = ({ maxAttempts = 3, windowMs = 15 * 60 * 1000, now = Date.now } = {}) => {
  const attempts = new Map();

  const currentAttempt = (phone) => {
    const timestamp = now();
    const existing = attempts.get(phone);
    if (!existing || timestamp - existing.startedAt >= windowMs) {
      return { count: 0, startedAt: timestamp };
    }
    return existing;
  };

  const check = (phone) => {
    const attempt = currentAttempt(phone);
    if (attempt.count < maxAttempts) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((attempt.startedAt + windowMs - now()) / 1000)),
    };
  };

  const recordSuccess = (phone) => {
    const attempt = currentAttempt(phone);
    attempt.count += 1;
    attempts.set(phone, attempt);
  };

  return { check, recordSuccess };
};

module.exports = { createSmsAttemptLimiter };
