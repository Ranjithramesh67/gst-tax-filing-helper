import { EMAIL_PROVIDER_PRESETS, presetFor, type EmailProviderId } from './emailProviders';

describe('email provider catalog', () => {
  it('has exactly six entries in the expected order with unique ids', () => {
    expect(EMAIL_PROVIDER_PRESETS).toHaveLength(6);
    expect(EMAIL_PROVIDER_PRESETS.map((p) => p.id)).toEqual([
      'gmail',
      'outlook',
      'zoho',
      'godaddy',
      'hostinger',
      'other',
    ]);
  });

  it('gives every IMAP provider a port in range', () => {
    for (const preset of EMAIL_PROVIDER_PRESETS.filter((p) => p.action === 'imap')) {
      expect(preset.port).toBeGreaterThanOrEqual(1);
      expect(preset.port).toBeLessThanOrEqual(65535);
    }
  });

  it('prefills the documented hosts', () => {
    expect(presetFor('zoho').host).toBe('imap.zoho.com');
    expect(presetFor('godaddy').host).toBe('imap.secureserver.net');
    expect(presetFor('hostinger').host).toBe('imap.hostinger.com');
    expect(presetFor('other').host).toBeUndefined();
  });

  it('gives OAuth providers no host or port', () => {
    for (const preset of EMAIL_PROVIDER_PRESETS.filter((p) => p.action === 'oauth')) {
      expect(preset.host).toBeUndefined();
      expect(preset.port).toBeUndefined();
    }
    expect(presetFor('gmail').action).toBe('oauth');
    expect(presetFor('outlook').action).toBe('oauth');
  });

  it('returns the matching preset and throws on an unknown id', () => {
    expect(presetFor('hostinger').label).toBe('Hostinger email');
    expect(() => presetFor('nope' as EmailProviderId)).toThrow();
  });
});
