import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  CallMediaCloseCode,
  closeCodeFor,
  closeReason,
  decodeVideoMessage,
  encodeVideoMessage,
  parseCallMediaParams,
  parseControl,
} from './calls.media';

describe('call media framing', () => {
  it('round-trips a video frame', () => {
    const accessUnit = Buffer.from([0, 0, 0, 1, 0x65, 0x88, 0x84]);
    const encoded = encodeVideoMessage({
      keyframe: true,
      orientation: 3,
      durationMs: 67,
      accessUnit: accessUnit,
    });
    expect(encoded.length).toBe(8 + accessUnit.length);
    expect([...encoded.subarray(0, 4)]).toEqual([1, 1, 3, 0]);
    expect(encoded.readUInt32LE(4)).toBe(67);

    const decoded = decodeVideoMessage(encoded);
    expect(decoded).toEqual({
      keyframe: true,
      orientation: 3,
      durationMs: 67,
      accessUnit: accessUnit,
    });
  });

  it('rejects malformed video messages', () => {
    expect(decodeVideoMessage(Buffer.alloc(8))).toBeNull();
    const wrongKind = Buffer.alloc(12);
    wrongKind.writeUInt8(2, 0);
    expect(decodeVideoMessage(wrongKind)).toBeNull();
  });

  it('maps engine errors to close codes', () => {
    expect(closeCodeFor()).toBe(CallMediaCloseCode.NORMAL);
    expect(closeCodeFor(new NotFoundException())).toBe(
      CallMediaCloseCode.NOT_FOUND,
    );
    expect(closeCodeFor(new ConflictException())).toBe(
      CallMediaCloseCode.ALREADY_ATTACHED,
    );
    expect(closeCodeFor(new ServiceUnavailableException())).toBe(
      CallMediaCloseCode.TRY_AGAIN,
    );
    expect(closeCodeFor(new Error('x'))).toBe(CallMediaCloseCode.INTERNAL);
    expect(
      Buffer.byteLength(closeReason(new Error('é'.repeat(200)))),
    ).toBeLessThanOrEqual(123);
  });

  it('reads session and call from the query', () => {
    expect(
      parseCallMediaParams(
        '/api/calls/audio?session=s1&callId=ABC&x-api-key=k',
      ),
    ).toEqual({ session: 's1', callId: 'ABC' });
    expect(parseCallMediaParams('/api/calls/audio')).toEqual({
      session: '',
      callId: '',
    });
  });

  it('parses only typed JSON controls', () => {
    expect(parseControl('{"type":"flush"}')).toEqual({ type: 'flush' });
    expect(parseControl('{"x":1}')).toBeNull();
    expect(parseControl('nope')).toBeNull();
  });
});
