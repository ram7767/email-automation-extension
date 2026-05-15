// LinkedIn/Indeed selectors. The `linkedin-indeed-selector-auditor` agent
// audits these against fixtures + live HTML. Update with care.

export const LINKEDIN = {
  EMAIL_NODE: '.pv-contact-info__contact-item a[href^="mailto:"]',
  RECRUITER_NAME: 'h1.text-heading-xlarge',
  JOB_TITLE: '.pv-text-details__left-panel .text-body-medium',
} as const;

export const INDEED = {
  EMAIL_NODE: 'a[href^="mailto:"]',
  COMPANY_NAME: '[data-testid="inlineHeader-companyName"] a',
  JOB_TITLE: 'h1[data-testid="jobsearch-JobInfoHeader-title"]',
} as const;
