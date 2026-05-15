// LinkedIn/Indeed selectors. The `linkedin-indeed-selector-auditor` agent
// audits these against fixtures + live HTML. Update with care.
//
// Each selector exports a string[] so we can fall through alternatives —
// LinkedIn changes its DOM frequently. First match wins.

export const LINKEDIN: {
  EMAIL_NODE: string[];
  RECRUITER_NAME: string[];
  JOB_TITLE: string[];
  COMPANY_NAME: string[];
} = {
  EMAIL_NODE: [
    '.pv-contact-info__contact-item a[href^="mailto:"]',
    'a[href^="mailto:"]',
    '[data-test-contact-info] a[href^="mailto:"]',
  ],
  RECRUITER_NAME: [
    'h1.text-heading-xlarge',
    'h1.top-card-layout__title',
    'h1[data-test-profile-name]',
    'main h1',
  ],
  JOB_TITLE: [
    '.pv-text-details__left-panel .text-body-medium',
    '[data-test-current-position]',
    '.top-card__job-title',
    '.text-body-medium.break-words',
  ],
  COMPANY_NAME: [
    '[data-test-current-company]',
    '.pv-text-details__company-name',
    '.top-card__current-company',
    'a[data-test-app-aware-link][href*="/company/"]',
  ],
};

export const INDEED: {
  EMAIL_NODE: string[];
  RECRUITER_NAME: string[];
  JOB_TITLE: string[];
  COMPANY_NAME: string[];
} = {
  EMAIL_NODE: [
    'a[href^="mailto:"]',
    '[data-testid="job-email"] a',
    '[data-testid="contact-email"]',
  ],
  RECRUITER_NAME: [
    '[data-testid="recruiter-name"]',
    '.recruiter-name',
    '[data-testid="jobsearch-RecruiterInfo"] [data-testid="name"]',
  ],
  JOB_TITLE: [
    'h1[data-testid="jobsearch-JobInfoHeader-title"]',
    'h1.jobsearch-JobInfoHeader-title',
    'h1[data-testid="simpler-jobTitle"]',
  ],
  COMPANY_NAME: [
    '[data-testid="inlineHeader-companyName"] a',
    '[data-testid="inlineHeader-companyName"]',
    '[data-testid="jobsearch-JobInfoHeader-companyName"]',
    '.jobsearch-CompanyInfoContainer a',
  ],
};

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const MAX_FIELD_LENGTH = 200;

function querySelectorFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const found = root.querySelector(sel);
      if (found) return found;
    } catch {
      // invalid selector — skip
    }
  }
  return null;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_FIELD_LENGTH);
}

export function isValidEmail(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value.length > 254) return false;
  return EMAIL_RE.test(value);
}

function isLinkedIn(): boolean {
  if (typeof location === 'undefined') return false;
  return /(^|\.)linkedin\.com$/i.test(location.hostname);
}

function selectorsFor(): {
  EMAIL_NODE: string[];
  RECRUITER_NAME: string[];
  JOB_TITLE: string[];
  COMPANY_NAME: string[];
} {
  return isLinkedIn() ? LINKEDIN : INDEED;
}

export function extractEmail(root: ParentNode): string | null {
  const sels = selectorsFor().EMAIL_NODE;
  for (const sel of sels) {
    const matches = root.querySelectorAll(sel);
    for (const node of Array.from(matches)) {
      const href = node.getAttribute('href') ?? '';
      const candidate = href.startsWith('mailto:')
        ? href.slice('mailto:'.length).split('?')[0]
        : (node.textContent ?? '').trim();
      if (candidate && isValidEmail(candidate)) return candidate;
    }
  }
  return null;
}

export function extractRecruiterName(root: ParentNode): string | null {
  const found = querySelectorFirst(root, selectorsFor().RECRUITER_NAME);
  return cleanText(found?.textContent ?? null);
}

export function extractJobTitle(root: ParentNode): string | null {
  const found = querySelectorFirst(root, selectorsFor().JOB_TITLE);
  return cleanText(found?.textContent ?? null);
}

export function extractCompany(root: ParentNode): string | null {
  const found = querySelectorFirst(root, selectorsFor().COMPANY_NAME);
  return cleanText(found?.textContent ?? null);
}

export interface PageExtraction {
  email: string | null;
  recipientName: string | null;
  role: string | null;
  company: string | null;
}

export function extractAll(root: ParentNode): PageExtraction {
  return {
    email: extractEmail(root),
    recipientName: extractRecruiterName(root),
    role: extractJobTitle(root),
    company: extractCompany(root),
  };
}
