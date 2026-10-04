import { readFileSync } from 'fs';
import { join } from 'path';
import { extractOtp } from './index';

const fixtures = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'otp-fixtures.json'), 'utf8'),
) as { text: string; expect: { code: string } | null; note: string }[];

describe('extractOtp', () => {
  it.each(fixtures)('$note', ({ text, expect: wanted }) => {
    const result = extractOtp(text);
    if (wanted) expect(result?.code).toBe(wanted.code);
    else expect(result).toBeNull();
  });

  it('masks the code inside the snippet', () => {
    const result = extractOtp('Your verification code is 778899 now');
    expect(result?.code).toBe('778899');
    expect(result?.snippet).not.toContain('778899');
  });
});
