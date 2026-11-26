import { BadRequestException } from '@nestjs/common';
import { MessageStickerRequest } from '@waha/structures/chatting.dto';

const STICKER_MIMETYPE = 'image/webp';

/**
 * Validates the body before touching the session,
 * so a bad request never reaches the engine.
 */
export function validateStickerRequest(request: MessageStickerRequest) {
  const file: any = request?.file;
  if (!request?.chatId || typeof request.chatId !== 'string') {
    throw new BadRequestException('chatId is required');
  }
  if (!file || typeof file !== 'object') {
    throw new BadRequestException('file is required');
  }
  const hasData = typeof file.data === 'string' && file.data.length > 0;
  const hasUrl = typeof file.url === 'string' && file.url.length > 0;
  if (hasData === hasUrl) {
    throw new BadRequestException(
      'file must have exactly one of "data" (base64) or "url"',
    );
  }
  if (!file.mimetype) {
    file.mimetype = STICKER_MIMETYPE;
  }
  if (file.mimetype !== STICKER_MIMETYPE) {
    throw new BadRequestException(
      `file.mimetype must be "${STICKER_MIMETYPE}", got "${file.mimetype}"`,
    );
  }
  if (hasData && !isWebP(Buffer.from(file.data, 'base64'))) {
    throw new BadRequestException('file.data is not a WebP image');
  }
}

export function isWebP(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}
