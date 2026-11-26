import * as grpc from '@grpc/grpc-js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { messages } from '@waha/core/engines/gows/grpc/gows';

import { callHttpError, toCallInfo } from './calls.gows';

function grpcError(code: grpc.status, details: string) {
  return { code: code, details: details, message: `${code} ${details}` };
}

describe('GOWS calls', () => {
  it('maps engine errors to HTTP errors', () => {
    expect(callHttpError(grpcError(grpc.status.NOT_FOUND, 'x'))).toBeInstanceOf(
      NotFoundException,
    );
    expect(
      callHttpError(grpcError(grpc.status.PERMISSION_DENIED, 'x')),
    ).toBeInstanceOf(ForbiddenException);
    expect(
      callHttpError(grpcError(grpc.status.FAILED_PRECONDITION, 'x')),
    ).toBeInstanceOf(ConflictException);
    expect(
      callHttpError(grpcError(grpc.status.INVALID_ARGUMENT, 'x')),
    ).toBeInstanceOf(UnprocessableEntityException);
    expect(
      callHttpError(grpcError(grpc.status.UNAVAILABLE, 'calls engine is off')),
    ).toBeInstanceOf(ServiceUnavailableException);
    const other = new Error('boom');
    expect(callHttpError(other)).toBe(other);
  });

  it('converts call info', () => {
    const info = toCallInfo(
      new messages.CallInfo({
        callId: 'ABC',
        direction: 'incoming',
        phone: '573001112233',
        chatId: '573001112233@c.us',
        isVideo: true,
        state: 'ringing',
        startedAt: 100,
      }),
    );
    expect(info).toEqual({
      callId: 'ABC',
      direction: 'incoming',
      phone: '573001112233',
      chatId: '573001112233@c.us',
      isVideo: true,
      state: 'ringing',
      muted: false,
      videoEnabled: false,
      peerVideoActive: false,
      answeredBy: undefined,
      startedAt: 100,
      connectedAt: undefined,
    });
  });
});
