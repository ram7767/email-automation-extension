import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LINKEDIN,
  INDEED,
  isValidEmail,
  extractEmail,
  extractRecruiterName,
  extractJobTitle,
  extractCompany,
  extractAll,
} from './selectors';

const FIXTURES = join(process.cwd(), 'test', 'fixtures');

function loadFixture(name: string): Document {
  const html = readFileSync(join(FIXTURES, name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

function setHostname(host: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname: host },
    writable: true,
    configurable: true,
  });
}

const originalLocation = window.location;

describe('selectors', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('exports selector arrays with at least one fallback', () => {
    for (const arr of Object.values(LINKEDIN)) {
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
    }
    for (const arr of Object.values(INDEED)) {
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
    }
  });

  describe('isValidEmail', () => {
    it('accepts ordinary addresses', () => {
      expect(isValidEmail('foo@bar.com')).toBe(true);
      expect(isValidEmail('a.b+c@example.co.uk')).toBe(true);
    });

    it('rejects malformed addresses', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('foo@bar')).toBe(false);
      expect(isValidEmail('foo@.com')).toBe(false);
      expect(isValidEmail('foo @bar.com')).toBe(false);
    });

    it('rejects ridiculously long input', () => {
      const big = 'a'.repeat(255) + '@x.com';
      expect(isValidEmail(big)).toBe(false);
    });

    it('rejects non-string input', () => {
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(42 as unknown as string)).toBe(false);
    });
  });

  describe('LinkedIn extraction', () => {
    beforeEach(() => setHostname('www.linkedin.com'));

    it('extracts email, name, title, company from fixture', () => {
      const doc = loadFixture('linkedin-profile.html');
      const all = extractAll(doc);
      expect(all.email).toBe('ada@example.com');
      expect(all.recipientName).toBe('Ada Lovelace');
      expect(all.role).toBe('Senior Software Engineer at Analytical Engines Co.');
      expect(all.company).toBe('Analytical Engines Co.');
    });

    it('returns null when nothing matches', () => {
      const doc = new DOMParser().parseFromString(
        '<!doctype html><html><body><p>nothing here</p></body></html>',
        'text/html',
      );
      expect(extractEmail(doc)).toBeNull();
      expect(extractRecruiterName(doc)).toBeNull();
      expect(extractJobTitle(doc)).toBeNull();
      expect(extractCompany(doc)).toBeNull();
    });
  });

  describe('Indeed extraction', () => {
    beforeEach(() => setHostname('www.indeed.com'));

    it('extracts email, name, title, company from fixture', () => {
      const doc = loadFixture('indeed-job.html');
      const all = extractAll(doc);
      expect(all.email).toBe('hiring@widgets.example');
      expect(all.recipientName).toBe('Grace Hopper');
      expect(all.role).toBe('Frontend Engineer');
      expect(all.company).toBe('Widgets Inc.');
    });

    it('skips invalid mailto links', () => {
      const doc = new DOMParser().parseFromString(
        '<!doctype html><html><body><a href="mailto:nope">x</a></body></html>',
        'text/html',
      );
      expect(extractEmail(doc)).toBeNull();
    });

    it('returns first valid email when multiple mailtos exist', () => {
      const doc = new DOMParser().parseFromString(
        '<!doctype html><html><body>' +
          '<a href="mailto:bad">x</a>' +
          '<a href="mailto:good@ok.com">y</a>' +
          '</body></html>',
        'text/html',
      );
      expect(extractEmail(doc)).toBe('good@ok.com');
    });
  });
});
