function getApiErrorMessage(payload) {
  if (typeof payload === "string") {
    return payload.trim() || void 0;
  }
  if (Array.isArray(payload)) {
    const messages = payload.map(getApiErrorMessage).filter((message) => Boolean(message));
    return messages.length > 0 ? messages.join("; ") : void 0;
  }
  if (typeof payload !== "object" || payload === null) {
    return void 0;
  }
  const record = payload;
  return getApiErrorMessage(record.error) || getApiErrorMessage(record.message) || getApiErrorMessage(record.details) || getApiErrorMessage(record.status) || getApiErrorMessage(record.code);
}
function getApiHttpErrorMessage(status, payload) {
  const serverMessage = getApiErrorMessage(payload);
  if (serverMessage) return serverMessage;
  if (status >= 500) {
    return `The server could not complete the request (HTTP ${status}). Please try again later.`;
  }
  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  return `The request failed (HTTP ${status}).`;
}
export {
  getApiErrorMessage,
  getApiHttpErrorMessage
};
