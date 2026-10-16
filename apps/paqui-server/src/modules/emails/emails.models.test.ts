import { describe, expect, test } from 'vitest';
import { formatSenderAddress, parseEmailAddress } from './emails.models';

describe('emails models', () => {
  describe('parseEmailAddress', () => {
    test('a named address is split into its name and email, a bare address only has an email', () => {
      expect(parseEmailAddress({ address: 'Paqui <noreply@heypaqui.com>' })).to.eql({ name: 'Paqui', email: 'noreply@heypaqui.com' });
      expect(parseEmailAddress({ address: '"Acme SL" <noreply@heypaqui.com>' })).to.eql({ name: 'Acme SL', email: 'noreply@heypaqui.com' });
      expect(parseEmailAddress({ address: 'noreply@heypaqui.com' })).to.eql({ email: 'noreply@heypaqui.com' });
    });
  });

  describe('formatSenderAddress', () => {
    test('the display name is replaced while the platform sending address is kept', () => {
      expect(formatSenderAddress({ fromEmail: 'Paqui <noreply@heypaqui.com>', displayName: 'Acme SL' })).to.eql('"Acme SL" <noreply@heypaqui.com>');
      expect(formatSenderAddress({ fromEmail: 'noreply@heypaqui.com', displayName: 'Acme SL' })).to.eql('"Acme SL" <noreply@heypaqui.com>');
    });

    test('without a display name, the platform sender is used as is', () => {
      expect(formatSenderAddress({ fromEmail: 'Paqui <noreply@heypaqui.com>', displayName: null })).to.eql('Paqui <noreply@heypaqui.com>');
      expect(formatSenderAddress({ fromEmail: 'Paqui <noreply@heypaqui.com>', displayName: '  ' })).to.eql('Paqui <noreply@heypaqui.com>');
    });

    test('characters that could spoof the address or inject headers are stripped from the display name', () => {
      expect(formatSenderAddress({ fromEmail: 'Paqui <noreply@heypaqui.com>', displayName: 'Evil" <ceo@bank.com>\r\nBcc: victim@example.com' }))
        .to
        .eql('"Evil ceo@bank.com Bcc: victim@example.com" <noreply@heypaqui.com>');
    });
  });
});
