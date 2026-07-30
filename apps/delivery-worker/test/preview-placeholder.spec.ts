import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /preview-placeholder', () => {
  it('returns a repository-owned SVG with the default dimensions', async () => {
    const response = await SELF.fetch('https://example.com/preview-placeholder');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');

    const svg = await response.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="640"');
    expect(svg).toContain('height="480"');
  });

  it('honors width/height query params within safe bounds', async () => {
    const response = await SELF.fetch('https://example.com/preview-placeholder?w=200&h=100');
    const svg = await response.text();

    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
  });

  it('clamps out-of-range dimensions instead of failing', async () => {
    const response = await SELF.fetch('https://example.com/preview-placeholder?w=999999&h=-5');
    const svg = await response.text();

    expect(svg).toContain('width="2000"');
    expect(svg).toContain('height="16"');
  });
});
