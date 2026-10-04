import { createHash } from 'crypto';
import { canonicalSmsHash } from './sms.service';

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('canonicalSmsHash', () => {
  const sender = 'AD-GSTIND-S';
  const body = 'One Time Password is 123456. GSTN';

  it('collides for the same message captured at different sub-second precision', () => {
    const fromBroadcast = new Date('2026-10-04T13:40:14.697Z');
    const fromInbox = new Date('2026-10-04T13:40:14.000Z');
    expect(canonicalSmsHash(hash, sender, body, fromBroadcast)).toBe(
      canonicalSmsHash(hash, sender, body, fromInbox),
    );
  });

  it('distinguishes messages on different seconds', () => {
    const first = new Date('2026-10-04T13:40:14.697Z');
    const second = new Date('2026-10-04T13:40:15.697Z');
    expect(canonicalSmsHash(hash, sender, body, first)).not.toBe(
      canonicalSmsHash(hash, sender, body, second),
    );
  });

  it('distinguishes different bodies and senders', () => {
    const at = new Date('2026-10-04T13:40:14.697Z');
    const base = canonicalSmsHash(hash, sender, body, at);
    expect(canonicalSmsHash(hash, sender, `${body} `, at)).not.toBe(base);
    expect(canonicalSmsHash(hash, 'AX-GSTIND-S', body, at)).not.toBe(base);
  });
});
