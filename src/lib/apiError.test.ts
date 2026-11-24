import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getApiErrorMessage, getApiHttpErrorMessage } from './apiError.ts';

describe('API error messages', () => {
  it('extracts readable messages from string and nested error payloads', () => {
    assert.equal(getApiErrorMessage({ error: 'Access denied.' }), 'Access denied.');
    assert.equal(
      getApiErrorMessage({ error: { message: 'Firestore permission denied.' } }),
      'Firestore permission denied.'
    );
    assert.equal(
      getApiErrorMessage({ details: ['Missing access.', { status: 'PERMISSION_DENIED' }] }),
      'Missing access.; PERMISSION_DENIED'
    );
  });

  it('does not turn empty or message-less objects into object string output', () => {
    assert.equal(getApiErrorMessage({ error: {} }), undefined);
    assert.equal(getApiErrorMessage(null), undefined);
  });

  it('provides useful messages when the server returns no readable error payload', () => {
    assert.match(getApiHttpErrorMessage(500, undefined), /HTTP 500/);
    assert.equal(
      getApiHttpErrorMessage(429, undefined),
      'Too many requests. Please wait a moment and try again.'
    );
    assert.equal(
      getApiHttpErrorMessage(500, { error: 'Database unavailable.' }),
      'Database unavailable.'
    );
  });
});
