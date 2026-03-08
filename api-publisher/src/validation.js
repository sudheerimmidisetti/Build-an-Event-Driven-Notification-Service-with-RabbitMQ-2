function validateEventPayload(body) {
  const errors = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    errors.push("Request body must be a JSON object.");
    return { valid: false, errors };
  }

  const { type, payload } = body;

  if (typeof type !== "string" || !type.trim()) {
    errors.push('"type" is required and must be a non-empty string.');
  }

  if (type && type.length > 100) {
    errors.push('"type" must be at most 100 characters.');
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push('"payload" is required and must be a JSON object.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateEventPayload,
};
