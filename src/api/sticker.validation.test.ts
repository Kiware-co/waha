import { BadRequestException } from '@nestjs/common';
import { isWebP, validateStickerRequest } from '@waha/api/sticker.validation';

const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from('WEBPVP8X'),
  Buffer.alloc(10),
]).toString('base64');

function req(file: any): any {
  return { session: 'default', chatId: '573000000000@c.us', file };
}

describe('validateStickerRequest', () => {
  it('accepts base64 webp and defaults mimetype', () => {
    const r = req({ data: WEBP });
    expect(() => validateStickerRequest(r)).not.toThrow();
    expect(r.file.mimetype).toBe('image/webp');
  });

  it('accepts url', () => {
    expect(() =>
      validateStickerRequest(
        req({ mimetype: 'image/webp', url: 'https://example.com/s.webp' }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['no file', undefined],
    ['empty file', {}],
    ['both data and url', { data: WEBP, url: 'https://example.com/s.webp' }],
    ['png mimetype', { mimetype: 'image/png', data: WEBP }],
    [
      'png bytes',
      {
        mimetype: 'image/webp',
        data: Buffer.from('\x89PNG\r\n\x1a\n0000').toString('base64'),
      },
    ],
  ])('rejects %s', (_name, file) => {
    expect(() => validateStickerRequest(req(file))).toThrow(
      BadRequestException,
    );
  });

  it('rejects missing chatId', () => {
    expect(() =>
      validateStickerRequest({
        session: 'default',
        file: { data: WEBP },
      } as any),
    ).toThrow(BadRequestException);
  });

  it('detects webp', () => {
    expect(isWebP(Buffer.from(WEBP, 'base64'))).toBe(true);
    expect(isWebP(Buffer.from('nope'))).toBe(false);
  });
});
