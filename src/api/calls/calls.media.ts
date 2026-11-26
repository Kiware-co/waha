import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Binary framing of the call video WebSocket: an 8-byte header, then one
 * H.264 Annex-B access unit.
 *   byte 0   kind (1 = H.264 access unit)
 *   byte 1   flags (bit 0 = keyframe / IDR)
 *   byte 2   orientation (clockwise quarter turns, 0-3)
 *   byte 3   reserved (0)
 *   4..7     durationMs, uint32 little-endian (0 from the server)
 */
export const VIDEO_HEADER_BYTES = 8;
export const VIDEO_KIND_H264 = 1;
export const VIDEO_FLAG_KEYFRAME = 1;

export interface VideoMessage {
  keyframe: boolean;
  orientation: number;
  durationMs: number;
  accessUnit: Buffer;
}

export function encodeVideoMessage(message: VideoMessage): Buffer {
  const header = Buffer.alloc(VIDEO_HEADER_BYTES);
  header.writeUInt8(VIDEO_KIND_H264, 0);
  header.writeUInt8(message.keyframe ? VIDEO_FLAG_KEYFRAME : 0, 1);
  header.writeUInt8(message.orientation & 0x03, 2);
  header.writeUInt8(0, 3);
  header.writeUInt32LE(message.durationMs >>> 0, 4);
  return Buffer.concat([header, message.accessUnit]);
}

/** Returns null for a message that is not a well-formed H.264 frame. */
export function decodeVideoMessage(data: Buffer): VideoMessage | null {
  if (data.length <= VIDEO_HEADER_BYTES) {
    return null;
  }
  if (data.readUInt8(0) !== VIDEO_KIND_H264) {
    return null;
  }
  return {
    keyframe: (data.readUInt8(1) & VIDEO_FLAG_KEYFRAME) !== 0,
    orientation: data.readUInt8(2) & 0x03,
    durationMs: data.readUInt32LE(4),
    accessUnit: data.subarray(VIDEO_HEADER_BYTES),
  };
}

/** WebSocket close codes used by the call media sockets. */
export enum CallMediaCloseCode {
  NORMAL = 1000,
  INTERNAL = 1011,
  TRY_AGAIN = 1013,
  UNAUTHORIZED = 4401,
  FORBIDDEN = 4403,
  NOT_FOUND = 4404,
  ALREADY_ATTACHED = 4409,
}

export function closeCodeFor(error?: Error): CallMediaCloseCode {
  if (!error) {
    return CallMediaCloseCode.NORMAL;
  }
  if (error instanceof NotFoundException) {
    return CallMediaCloseCode.NOT_FOUND;
  }
  if (error instanceof ConflictException) {
    return CallMediaCloseCode.ALREADY_ATTACHED;
  }
  if (error instanceof ForbiddenException) {
    return CallMediaCloseCode.FORBIDDEN;
  }
  if (error instanceof ServiceUnavailableException) {
    return CallMediaCloseCode.TRY_AGAIN;
  }
  return CallMediaCloseCode.INTERNAL;
}

/** A close reason must fit in 123 bytes. */
export function closeReason(error?: Error): string {
  const reason = error ? error.message || 'error' : 'call ended';
  return Buffer.from(reason)
    .subarray(0, 120)
    .toString();
}

export function parseCallMediaParams(
  url: string,
): {
  session: string;
  callId: string;
} {
  const query = new URL(url, 'http://localhost').searchParams;
  return {
    session: query.get('session') ?? '',
    callId: query.get('callId') ?? '',
  };
}

export function parseControl(
  data: Buffer | string,
): Record<string, any> | null {
  try {
    const value = JSON.parse(data.toString());
    if (value && typeof value === 'object' && typeof value.type === 'string') {
      return value;
    }
  } catch (err) {
    return null;
  }
  return null;
}
