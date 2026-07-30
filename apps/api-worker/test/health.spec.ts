import { isValidHealthCheckResponse } from '@imageryx/test-utils';
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /health', () => {
  it('returns a healthy api-worker status matching the shared contract', async () => {
    const response = await SELF.fetch('https://example.com/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(isValidHealthCheckResponse(body, 'api-worker')).toBe(true);
  });

  it('echoes a request id header for log correlation', async () => {
    const response = await SELF.fetch('https://example.com/health');

    expect(response.headers.get('X-Request-Id')).toBeTruthy();
  });
});
