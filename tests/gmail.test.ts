import { describe, it, expect } from 'vitest';
import {
  encryptToken,
  decryptToken,
  parseEmailHeaders,
  parseGmailMessage,
  type GmailRawMessage,
} from '@/lib/gmail-service';

describe('Gmail Service Cryptography', () => {
  it('Should successfully encrypt and decrypt a token', () => {
    const token = 'ya29.a0AfB_byE4zR9-8...sample-google-token';
    const encrypted = encryptToken(token);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(token);
    expect(typeof encrypted).toBe('string');

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it('Should throw on corrupt or tampered encrypted payloads', () => {
    const token = 'secret-token';
    const encrypted = encryptToken(token);
    
    // Corrupt the ciphertext by changing the last few characters
    const tampered = encrypted.slice(0, -4) + 'abcd';
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('Should throw when decrypting random invalid strings', () => {
    expect(() => decryptToken('invalidhexstring1234567890abcdef')).toThrow();
  });
});

describe('Gmail Email Header Parsing', () => {
  it('Should parse simple From headers', () => {
    const headers = [
      { name: 'Subject', value: 'Hello BrainMate' },
      { name: 'From', value: 'John Doe <john@example.com>' },
      { name: 'Date', value: 'Sun, 17 May 2026 12:00:00 GMT' },
    ];

    const result = parseEmailHeaders(headers);
    expect(result.subject).toBe('Hello BrainMate');
    expect(result.from_name).toBe('John Doe');
    expect(result.from_email).toBe('john@example.com');
  });

  it('Should handle quoted sender names', () => {
    const headers = [
      { name: 'Subject', value: 'Urgent' },
      { name: 'From', value: '"Doe, John" <john.doe@example.com>' },
      { name: 'Date', value: 'Sun, 17 May 2026 12:00:00 GMT' },
    ];

    const result = parseEmailHeaders(headers);
    expect(result.from_name).toBe('Doe, John');
    expect(result.from_email).toBe('john.doe@example.com');
  });

  it('Should handle raw emails without names', () => {
    const headers = [
      { name: 'Subject', value: 'Alert' },
      { name: 'From', value: 'support@example.com' },
      { name: 'Date', value: 'Sun, 17 May 2026 12:00:00 GMT' },
    ];

    const result = parseEmailHeaders(headers);
    expect(result.from_name).toBe('support@example.com');
    expect(result.from_email).toBe('support@example.com');
  });

  it('Should fall back when Subject is missing', () => {
    const headers = [
      { name: 'From', value: 'support@example.com' },
    ];

    const result = parseEmailHeaders(headers);
    expect(result.subject).toBe('(no subject)');
  });
});

describe('Gmail MIME Extraction & Parsing', () => {
  const baseRawMessage = {
    id: 'msg123',
    threadId: 'thread123',
    snippet: 'This is a snippet...',
    labelIds: ['INBOX', 'UNREAD'],
    internalDate: '1779144000000', // Epoch in ms
  };

  it('Should parse plain text messages successfully', () => {
    const textPlainBase64 = Buffer.from('Hello world! This is plain text.', 'utf-8').toString('base64url');
    const rawMessage: GmailRawMessage = {
      ...baseRawMessage,
      payload: {
        headers: [
          { name: 'Subject', value: 'Plain Text Email' },
          { name: 'From', value: 'Sender <sender@example.com>' },
        ],
        mimeType: 'text/plain',
        body: {
          data: textPlainBase64,
        },
      },
    };

    const email = parseGmailMessage(rawMessage);
    expect(email.subject).toBe('Plain Text Email');
    expect(email.body_plain).toBe('Hello world! This is plain text.');
    expect(email.is_unread).toBe(true);
    expect(email.word_count).toBe(6);
  });

  it('Should extract and clean HTML messages if plain text is missing', () => {
    const htmlBase64 = Buffer.from(
      '<html><head><style>body {color: red;}</style></head><body><p>Hello! Check out <script>alert(1)</script>this email.</p></body></html>',
      'utf-8'
    ).toString('base64url');

    const rawMessage: GmailRawMessage = {
      ...baseRawMessage,
      payload: {
        headers: [
          { name: 'Subject', value: 'HTML Email' },
          { name: 'From', value: 'Sender <sender@example.com>' },
        ],
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/html',
            body: {
              data: htmlBase64,
            },
          },
        ],
      },
    };

    const email = parseGmailMessage(rawMessage);
    expect(email.body_plain).toContain('Hello! Check out this email.');
    expect(email.body_plain).not.toContain('<style>');
    expect(email.body_plain).not.toContain('<script>');
  });

  it('Should recursively look through nested parts', () => {
    const textPlainBase64 = Buffer.from('Nested plain content.', 'utf-8').toString('base64url');

    const rawMessage: GmailRawMessage = {
      ...baseRawMessage,
      payload: {
        headers: [
          { name: 'Subject', value: 'Nested Email' },
          { name: 'From', value: 'Sender <sender@example.com>' },
        ],
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: textPlainBase64,
                },
              },
            ],
          },
        ],
      },
    };

    const email = parseGmailMessage(rawMessage);
    expect(email.body_plain).toBe('Nested plain content.');
  });
});
