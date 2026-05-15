const ALLOWED = new Set([
  'recipientName',
  'role',
  'company',
  'myName',
  'myLink',
]);

export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) => {
    if (!ALLOWED.has(key)) return match;
    return vars[key] ?? match;
  });
}
