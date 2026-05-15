import type { Signal } from '@preact/signals-react';

export function bind<T>(sig: Signal<T>, key: string): () => void {
  let isHydrating = true;
  let pendingWrites = 0;

  void chrome.storage.local.get(key).then((stored) => {
    const value = stored[key] as T | undefined;
    if (value !== undefined) sig.value = value;
    isHydrating = false;
  });

  const dispose = sig.subscribe((value) => {
    if (isHydrating) return;
    pendingWrites++;
    void chrome.storage.local.set({ [key]: value }).then(() => {
      setTimeout(() => {
        pendingWrites--;
      }, 50);
    });
  });

  const onChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ): void => {
    if (area !== 'local' || !(key in changes)) return;
    if (pendingWrites > 0) return;
    sig.value = changes[key]!.newValue as T;
  };
  chrome.storage.onChanged.addListener(onChange);

  return () => {
    dispose();
    chrome.storage.onChanged.removeListener(onChange);
  };
}
