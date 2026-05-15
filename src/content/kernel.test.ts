import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';

vi.mock('./shadow.css?inline', () => ({ default: '.ea-fab { display: inline-flex; }' }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mount, unmount, isMounted, buildSitePack } = await import('./kernel');

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setHostname(host: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname: host, href: `https://${host}/x` },
    writable: true,
    configurable: true,
  });
}

const originalLocation = window.location;

describe('kernel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setHostname('www.linkedin.com');
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      profiles: null,
    });
  });

  afterEach(() => {
    if (isMounted()) unmount();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('mounts a single host div with a shadow root, no global styles', async () => {
    document.body.innerHTML =
      '<main><h1 class="text-heading-xlarge">Ada</h1><a href="mailto:ada@example.com">m</a></main>';
    await act(async () => {
      mount({ sitePack: buildSitePack('linkedin') });
    });
    await flush();

    const hosts = document.body.querySelectorAll('#email-automation-fab');
    expect(hosts.length).toBe(1);

    const host = hosts[0]!;
    expect(host.shadowRoot).not.toBeNull();

    // Modal markup MUST live inside the shadow root, not the host page DOM.
    expect(document.body.innerHTML).not.toContain('ea-modal');
    expect(document.body.innerHTML).not.toContain('ea-fab');

    // Inside the shadow we should find both the FAB stylesheet and the FAB button.
    const sheet = host.shadowRoot!.querySelector('style');
    expect(sheet?.textContent ?? '').toContain('.ea-fab');
    const fab = host.shadowRoot!.querySelector('.ea-fab');
    expect(fab).not.toBeNull();
  });

  it('debounces MutationObserver-driven refresh', async () => {
    document.body.innerHTML = '<main></main>';
    await act(async () => {
      mount({ sitePack: buildSitePack('linkedin') });
    });
    await flush();
    const host = document.body.querySelector('#email-automation-fab')!;
    const fab = () => host.shadowRoot!.querySelector('.ea-fab') as HTMLButtonElement | null;
    expect(fab()).not.toBeNull();
    expect(fab()!.hasAttribute('disabled')).toBe(true);

    const observerSpy = vi.spyOn(globalThis, 'setTimeout');

    const main = document.querySelector('main')!;
    const a = document.createElement('a');
    a.href = 'mailto:hello@example.com';
    a.textContent = 'hello@example.com';
    main.appendChild(a);
    main.appendChild(document.createElement('span'));
    main.appendChild(document.createElement('span'));

    // Allow MutationObserver microtasks to flush.
    await new Promise((r) => setTimeout(r, 50));
    // Despite three quick mutations, refresh has not fired yet (debounce > 50ms).
    expect(fab()!.hasAttribute('disabled')).toBe(true);
    // Multiple mutations should coalesce into a single pending timer.
    const debounceCalls = observerSpy.mock.calls.filter(
      ([, ms]) => typeof ms === 'number' && ms === 300,
    );
    expect(debounceCalls.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(fab()!.hasAttribute('disabled')).toBe(false);

    observerSpy.mockRestore();
  });

  it('disconnects observer on pagehide', () => {
    document.body.innerHTML = '<main></main>';
    mount({ sitePack: buildSitePack('linkedin') });
    expect(isMounted()).toBe(true);
    window.dispatchEvent(new Event('pagehide'));
    expect(isMounted()).toBe(false);
    expect(document.body.querySelector('#email-automation-fab')).toBeNull();
  });

  it('mount is idempotent (second call is a no-op)', () => {
    document.body.innerHTML = '<main></main>';
    mount({ sitePack: buildSitePack('linkedin') });
    mount({ sitePack: buildSitePack('linkedin') });
    expect(document.body.querySelectorAll('#email-automation-fab').length).toBe(1);
  });

  it('buildSitePack picks the right selectors per site', () => {
    const li = buildSitePack('linkedin');
    const ind = buildSitePack('indeed');
    expect(li.name).toBe('linkedin');
    expect(ind.name).toBe('indeed');
    expect(li.selectors.JOB_TITLE).not.toEqual(ind.selectors.JOB_TITLE);
  });
});
