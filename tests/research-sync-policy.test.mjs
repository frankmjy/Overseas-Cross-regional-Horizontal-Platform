import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPollDelay } from '../research/web/sync-policy.mjs';

test('idle views do not poll; only initial load and active sync request status', () => {
  assert.equal(nextPollDelay({ hasData: true }), null);
  assert.equal(nextPollDelay({ hasData: false, initialAttempts: 0 }), 2000);
  assert.equal(nextPollDelay({ hasData: true, pending: true }), 2000);
  assert.equal(nextPollDelay({ hasData: true, refreshing: true }), 2000);
});

test('repeated failures and exhausted initial loading stop automatic requests', () => {
  assert.equal(nextPollDelay({ hasData: true, pending: true, failures: 3 }), null);
  assert.equal(nextPollDelay({ hasData: false, initialAttempts: 15 }), null);
});
