export function getApiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return payload.trim() || undefined;
  }

  if (Array.isArray(payload)) {
    const messages = payload
      .map(getApiErrorMessage)
      .filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.join('; ') : undefined;
  }

  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  return (
    getApiErrorMessage(record.error) ||
    getApiErrorMessage(record.message) ||
    getApiErrorMessage(record.details) ||
    getApiErrorMessage(record.status) ||
    getApiErrorMessage(record.code)
  );
}

export function getApiHttpErrorMessage(status: number, payload: unknown): string {
  const serverMessage = getApiErrorMessage(payload);
  if (serverMessage) return serverMessage;
  if (status >= 500) {
    return `The server could not complete the request (HTTP ${status}). Please try again later.`;
  }
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  return `The request failed (HTTP ${status}).`;
}
