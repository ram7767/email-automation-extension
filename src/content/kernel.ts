import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { ModalApp } from './ModalApp';
import { extractAll, LINKEDIN, INDEED, type PageExtraction } from './selectors';
import shadowCss from './shadow.css?inline';

export interface SitePack {
  name: 'linkedin' | 'indeed';
  selectors: typeof LINKEDIN | typeof INDEED;
  extractors: {
    extractAll(root: ParentNode): PageExtraction;
  };
}

export interface KernelHandle {
  unmount(): void;
  refresh(): void;
}

const HOST_ID = 'email-automation-fab';
const DEBOUNCE_MS = 300;

interface KernelState {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  fabRoot: Root;
  modalRoot: Root;
  modalContainer: HTMLDivElement;
  observer: MutationObserver | null;
  detected: PageExtraction | null;
  modalOpen: boolean;
  pack: SitePack;
}

let state: KernelState | null = null;

export function isMounted(): boolean {
  return state !== null;
}

export function mount(opts: { sitePack: SitePack }): KernelHandle {
  if (state) {
    return { unmount, refresh };
  }
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('kernel: no document.body to mount into');
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-email-automation', 'true');
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = shadowCss;
  shadow.appendChild(styleEl);

  const fabContainer = document.createElement('div');
  fabContainer.dataset.eaContainer = 'fab';
  shadow.appendChild(fabContainer);

  const modalContainer = document.createElement('div');
  modalContainer.dataset.eaContainer = 'modal';
  shadow.appendChild(modalContainer);

  state = {
    host,
    shadow,
    fabRoot: createRoot(fabContainer),
    modalRoot: createRoot(modalContainer),
    modalContainer,
    observer: null,
    detected: null,
    modalOpen: false,
    pack: opts.sitePack,
  };

  attachObserver();
  window.addEventListener('pagehide', unmount, { once: true });

  refresh();
  return { unmount, refresh };
}

function attachObserver() {
  if (!state) return;
  if (typeof MutationObserver === 'undefined') return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  state.observer = observer;
}

export function refresh() {
  if (!state) return;
  const detected = state.pack.extractors.extractAll(document);
  state.detected = detected;
  renderFab();
}

function renderFab() {
  if (!state) return;
  const detected = state.detected;
  state.fabRoot.render(
    createElement(
      'button',
      {
        type: 'button',
        className: 'ea-fab',
        disabled: !detected?.email,
        title: detected?.email
          ? `Send via EmailAutomation to ${detected.email}`
          : 'No recipient email detected on this page',
        'aria-label': detected?.email
          ? `Send via EmailAutomation to ${detected.email}`
          : 'EmailAutomation: no email detected',
        onClick: openModal,
      },
      detected?.email ? `Send via EmailAutomation` : 'EmailAutomation',
    ),
  );
}

export function openModal() {
  if (!state) return;
  if (!state.detected?.email) return;
  state.modalOpen = true;
  renderModal();
}

function closeModal() {
  if (!state) return;
  state.modalOpen = false;
  renderModal();
}

function renderModal() {
  if (!state) return;
  if (!state.modalOpen || !state.detected) {
    state.modalRoot.render(null);
    return;
  }
  state.modalRoot.render(
    createElement(ModalApp, {
      extraction: state.detected,
      sourceUrl: typeof location !== 'undefined' ? location.href : '',
      onClose: closeModal,
    }),
  );
}

export function unmount() {
  if (!state) return;
  state.observer?.disconnect();
  try {
    state.fabRoot.unmount();
    state.modalRoot.unmount();
  } catch {
    // no-op
  }
  state.host.remove();
  state = null;
}

export function buildSitePack(name: 'linkedin' | 'indeed'): SitePack {
  // selectors module decides LinkedIn vs Indeed via location.hostname; the
  // pack just keeps a per-site identity and surfaces a stable extractor.
  const selectors = name === 'linkedin' ? LINKEDIN : INDEED;
  return {
    name,
    selectors,
    extractors: { extractAll },
  };
}
