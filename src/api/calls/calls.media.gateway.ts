import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { CallAudioChannel, CallVideoChannel } from '@waha/core/abc/calls';
import { CaslAbilityFactory } from '@waha/core/auth/casl.ability';
import { Action, session as SessionName } from '@waha/core/auth/casl.types';
import { WebSocketAuth } from '@waha/core/auth/WebSocketAuth';
import { WebSocket } from '@waha/nestjs/ws/ws';
import { IncomingMessage } from 'http';

import {
  CallMediaCloseCode,
  closeCodeFor,
  closeReason,
  decodeVideoMessage,
  encodeVideoMessage,
  parseCallMediaParams,
  parseControl,
} from './calls.media';

const AUDIO_STATS_TYPE = 'stats';

/**
 * Shared connection checks for the call media sockets: API key, session access,
 * a working session and a call id. Returns the channel, or closes the socket.
 */
abstract class CallMediaGateway<C extends CallAudioChannel | CallVideoChannel>
  implements OnGatewayConnection {
  protected abstract logger: Logger;

  constructor(
    protected manager: SessionManager,
    protected auth: WebSocketAuth,
    protected casl: CaslAbilityFactory,
  ) {}

  protected abstract open(session: any, callId: string): C;

  protected abstract bridge(socket: WebSocket, channel: C): void;

  async handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    const user = await this.auth.validateRequest(request);
    if (!user) {
      socket.close(CallMediaCloseCode.UNAUTHORIZED, 'Unauthorized');
      return;
    }
    const params = parseCallMediaParams(request.url ?? '');
    if (!params.session || !params.callId) {
      socket.close(CallMediaCloseCode.NOT_FOUND, 'session and callId required');
      return;
    }
    const ability = this.casl.createForUser(user);
    if (!ability.can(Action.Send, new SessionName(params.session))) {
      socket.close(CallMediaCloseCode.FORBIDDEN, 'Forbidden');
      return;
    }

    let channel: C;
    try {
      const session = await this.manager.getWorkingSession(params.session);
      channel = this.open(session, params.callId);
    } catch (err) {
      socket.close(closeCodeFor(err), closeReason(err));
      return;
    }

    this.logger.debug(
      `Call media attached: session=${params.session} call=${params.callId}`,
    );
    channel.onEnd(function onChannelEnd(error?: Error) {
      if (socket.readyState === socket.OPEN) {
        socket.close(closeCodeFor(error), closeReason(error));
      }
    });
    socket.on('close', function onSocketClose() {
      channel.close();
    });
    socket.on('error', function onSocketError() {
      channel.close();
    });
    this.bridge(socket, channel);
  }
}

function sendIfOpen(socket: WebSocket, data: Buffer | string) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  socket.send(data, { binary: typeof data !== 'string' });
}

/**
 * GET /api/calls/audio?session=&callId=&x-api-key=
 * Binary: s16le PCM, 16 kHz, mono. Server sends exactly 1920-byte frames.
 */
@WebSocketGateway({ path: '/api/calls/audio' })
export class CallAudioGateway extends CallMediaGateway<CallAudioChannel> {
  protected logger = new Logger('CallAudioGateway');

  constructor(
    manager: SessionManager,
    auth: WebSocketAuth,
    casl: CaslAbilityFactory,
  ) {
    super(manager, auth, casl);
  }

  protected open(session: any, callId: string): CallAudioChannel {
    return session.openCallAudio(callId);
  }

  protected bridge(socket: WebSocket, channel: CallAudioChannel) {
    channel.onFrame(function onPeerAudio(pcm: Buffer) {
      sendIfOpen(socket, pcm);
    });
    channel.onStats(function onStats(stats) {
      sendIfOpen(
        socket,
        JSON.stringify({
          type: AUDIO_STATS_TYPE,
          inFrames: stats.inFrames,
          outFrames: stats.outFrames,
          inPeak: stats.inPeak,
        }),
      );
    });
    socket.on('message', function onAgentMessage(
      data: Buffer,
      isBinary: boolean,
    ) {
      if (isBinary) {
        if (data.length >= 2) {
          channel.write(data);
        }
        return;
      }
      const control = parseControl(data);
      if (control?.type === 'flush') {
        channel.flush();
      }
    });
  }
}

/**
 * GET /api/calls/video?session=&callId=&x-api-key=
 * Binary: 8-byte header + H.264 Annex-B access unit (see calls.media.ts).
 */
@WebSocketGateway({ path: '/api/calls/video' })
export class CallVideoGateway extends CallMediaGateway<CallVideoChannel> {
  protected logger = new Logger('CallVideoGateway');

  constructor(
    manager: SessionManager,
    auth: WebSocketAuth,
    casl: CaslAbilityFactory,
  ) {
    super(manager, auth, casl);
  }

  protected open(session: any, callId: string): CallVideoChannel {
    return session.openCallVideo(callId);
  }

  protected bridge(socket: WebSocket, channel: CallVideoChannel) {
    channel.onFrame(function onPeerVideo(frame) {
      sendIfOpen(
        socket,
        encodeVideoMessage({
          keyframe: frame.keyframe,
          orientation: frame.orientation,
          durationMs: 0,
          accessUnit: frame.accessUnit,
        }),
      );
    });
    channel.onControl(function onControl(control) {
      sendIfOpen(socket, JSON.stringify(control));
    });
    socket.on('message', function onAgentMessage(
      data: Buffer,
      isBinary: boolean,
    ) {
      if (isBinary) {
        const message = decodeVideoMessage(data);
        if (message) {
          channel.send(message.accessUnit, message.durationMs);
        }
        return;
      }
      const control = parseControl(data);
      if (control?.type === 'orientation' && Number.isInteger(control.value)) {
        channel.setOrientation(control.value & 0x03);
      }
    });
  }
}
