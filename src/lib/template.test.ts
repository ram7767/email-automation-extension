import { describe, it, expect } from 'vitest';
import { interpolate } from './template';

describe('interpolate', () => {
  it('substitutes whitelisted keys', () => {
    expect(interpolate('Hi {{recipientName}}', { recipientName: 'Ada' })).toBe('Hi Ada');
  });

  it('leaves unknown keys untouched (visible to user)', () => {
    expect(interpolate('Hi {{nope}}', { nope: 'evil' })).toBe('Hi {{nope}}');
  });

  it('does not evaluate code-looking placeholders', () => {
    expect(interpolate('{{constructor}}', { constructor: 'X' })).toBe('{{constructor}}');
  });

  it('handles missing vars gracefully', () => {
    expect(interpolate('{{role}} at {{company}}', { role: 'Dev' })).toBe('Dev at {{company}}');
  });

  it('tolerates whitespace inside braces', () => {
    expect(interpolate('Hi {{  recipientName  }}', { recipientName: 'Ada' })).toBe('Hi Ada');
  });
});
