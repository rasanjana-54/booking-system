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
