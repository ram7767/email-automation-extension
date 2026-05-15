import { beforeEach, describe, expect, it } from 'vitest';
import { signal } from '@preact/signals-react';
import { bind } from './storage-bridge';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('storage-bridge', () => {
  it('hydrates the signal from storage on init', async () => {
    await chrome.storage.local.set({ greeting: 'hi' });
    const sig = signal<string>('placeholder');
    const dispose = bind(sig, 'greeting');
    await new Promise((r) => setTimeout(r, 5));
    expect(sig.value).toBe('hi');
    dispose();
  });

  it('writes to storage when the signal changes', async () => {
    const sig = signal<string>('a');
    const dispose = bind(sig, 'word');
    await new Promise((r) => setTimeout(r, 5));
    sig.value = 'b';
    await new Promise((r) => setTimeout(r, 5));
    const stored = await chrome.storage.local.get('word');
    expect(stored.word).toBe('b');
    dispose();
  });
});
