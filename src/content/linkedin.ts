import { mount, buildSitePack } from './kernel';

try {
  mount({ sitePack: buildSitePack('linkedin') });
} catch {
  // mount fails only when document.body is not available — content scripts
  // run at document_idle so this should never happen in production.
}
