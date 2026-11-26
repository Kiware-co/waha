import * as grpc from '@grpc/grpc-js';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CallAudioChannel,
  CallAudioStats,
  CallVideoChannel,
  CallVideoControl,
  CallVideoFrame,
} from '@waha/core/abc/calls';
import { messages } from '@waha/core/engines/gows/grpc/gows';
import { CallInfo, CallSettings, CallState } from '@waha/structures/calls.dto';
import { promisify } from 'util';

/**
 * Maps a gRPC error from the GOWS call engine to the HTTP error the API returns.
 */
export function callHttpError(err: any): Error {
  if (err instanceof HttpException) {
    return err;
  }
  const message = err?.details || err?.message || 'call error';
  switch (err?.code) {
    case grpc.status.NOT_FOUND:
      return new NotFoundException(message);
    case grpc.status.PERMISSION_DENIED:
      return new ForbiddenException(message);
    case grpc.status.FAILED_PRECONDITION:
      return new ConflictException(message);
    case grpc.status.INVALID_ARGUMENT:
      return new UnprocessableEntityException(message);
    case grpc.status.UNAVAILABLE:
      return new ServiceUnavailableException(message);
    default:
      return err;
  }
}

export function toCallInfo(info: messages.CallInfo): CallInfo {
  return {
    callId: info.callId,
    direction: info.direction,
    phone: info.phone,
    chatId: info.chatId,
    isVideo: info.isVideo,
    state: info.state as CallState,
    muted: info.muted,
    videoEnabled: info.videoEnabled,
    peerVideoActive: info.peerVideoActive,
    answeredBy: info.answeredBy || undefined,
    startedAt: Number(info.startedAt),
    connectedAt: Number(info.connectedAt) || undefined,
  };
}

function toCallSettings(settings: messages.CallSettings): CallSettings {
  return {
    enabled: settings.enabled,
    allow: settings.allow ?? [],
    available: settings.available,
  };
}

/**
 * Managed calls of one GOWS session.
 */
export class GowsCalls {
  constructor(
    private client: messages.MessageServiceClient,
    private session: messages.Session,
  ) {}

  private async unary<T>(method: any, request: any): Promise<T> {
    try {
      return await promisify(method.bind(this.client))(request);
    } catch (err) {
      throw callHttpError(err);
    }
  }

  private callRequest(callId: string) {
    return new messages.CallRequest({ session: this.session, callId: callId });
  }

  async getSettings(): Promise<CallSettings> {
    const settings = await this.unary<messages.CallSettings>(
      this.client.GetCallSettings,
      this.session,
    );
    return toCallSettings(settings);
  }

  async setSettings(settings: CallSettings): Promise<CallSettings> {
    const request = new messages.SetCallSettingsRequest({
      session: this.session,
      enabled: settings.enabled,
      allow: settings.allow ?? [],
    });
    const result = await this.unary<messages.CallSettings>(
      this.client.SetCallSettings,
      request,
    );
    return toCallSettings(result);
  }

  async list(): Promise<CallInfo[]> {
    const result = await this.unary<messages.CallInfoList>(
      this.client.ListCalls,
      this.session,
    );
    return (result.calls ?? []).map(toCallInfo);
  }

  async get(callId: string): Promise<CallInfo> {
    const info = await this.unary<messages.CallInfo>(
      this.client.GetCall,
      this.callRequest(callId),
    );
    return toCallInfo(info);
  }

  async start(phone: string, video: boolean): Promise<CallInfo> {
    const request = new messages.StartCallRequest({
      session: this.session,
      phone: phone,
      video: video,
    });
    const info = await this.unary<messages.CallInfo>(
      this.client.StartCall,
      request,
    );
    return toCallInfo(info);
  }

  async answer(callId: string, agent: string): Promise<CallInfo> {
    const request = new messages.AnswerCallRequest({
      session: this.session,
      callId: callId,
      agent: agent ?? '',
    });
    try {
      const info = await promisify(this.client.AnswerCall.bind(this.client))(
        request,
      );
      return toCallInfo(info as messages.CallInfo);
    } catch (err) {
      const error = callHttpError(err);
      if (error instanceof ConflictException) {
        throw await this.conflictWithOwner(callId, error);
      }
      throw error;
    }
  }

  /** 409 body names who already answered, so the losing agent can be told */
  private async conflictWithOwner(
    callId: string,
    error: ConflictException,
  ): Promise<ConflictException> {
    let answeredBy: string | undefined;
    try {
      const info = await this.get(callId);
      answeredBy = info.answeredBy;
    } catch (ignored) {
      answeredBy = undefined;
    }
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: error.message,
      answeredBy: answeredBy ?? null,
    });
  }

  async reject(callId: string): Promise<void> {
    await this.unary(this.client.RejectManagedCall, this.callRequest(callId));
  }

  async hangup(callId: string): Promise<void> {
    await this.unary(this.client.HangupCall, this.callRequest(callId));
  }

  async mute(callId: string, muted: boolean): Promise<CallInfo> {
    const request = new messages.MuteCallRequest({
      session: this.session,
      callId: callId,
      muted: muted,
    });
    const info = await this.unary<messages.CallInfo>(
      this.client.MuteCall,
      request,
    );
    return toCallInfo(info);
  }

  async video(callId: string, enabled: boolean): Promise<CallInfo> {
    const request = new messages.SetCallVideoRequest({
      session: this.session,
      callId: callId,
      enabled: enabled,
    });
    const info = await this.unary<messages.CallInfo>(
      this.client.SetCallVideo,
      request,
    );
    return toCallInfo(info);
  }

  openAudio(callId: string): CallAudioChannel {
    const stream = this.client.CallAudio();
    stream.write(
      new messages.CallAudioIn({ attach: this.callRequest(callId) }),
    );
    return new GowsAudioChannel(stream);
  }

  openVideo(callId: string): CallVideoChannel {
    const stream = this.client.CallVideo();
    stream.write(
      new messages.CallVideoIn({ attach: this.callRequest(callId) }),
    );
    return new GowsVideoChannel(stream);
  }
}

/**
 * Calls the end listeners once, whatever ends the stream first.
 */
class EndOnce {
  private ended = false;
  private listeners: Array<(error?: Error) => void> = [];

  add(listener: (error?: Error) => void) {
    this.listeners.push(listener);
  }

  fire(error?: Error) {
    if (this.ended) {
      return;
    }
    this.ended = true;
    for (const listener of this.listeners) {
      listener(error);
    }
  }
}

function watchEnd(stream: grpc.ClientDuplexStream<any, any>, end: EndOnce) {
  stream.on('end', function onEnd() {
    end.fire();
  });
  stream.on('error', function onError(err: any) {
    if (err?.code === grpc.status.CANCELLED) {
      end.fire();
      return;
    }
    end.fire(callHttpError(err));
  });
}

class GowsAudioChannel implements CallAudioChannel {
  private end = new EndOnce();

  constructor(
    private stream: grpc.ClientDuplexStream<
      messages.CallAudioIn,
      messages.CallAudioOut
    >,
  ) {
    watchEnd(stream, this.end);
  }

  onFrame(listener: (pcm: Buffer) => void) {
    this.stream.on('data', function onData(msg: messages.CallAudioOut) {
      if (msg.pcm?.length) {
        listener(Buffer.from(msg.pcm));
      }
    });
  }

  onStats(listener: (stats: CallAudioStats) => void) {
    this.stream.on('data', function onData(msg: messages.CallAudioOut) {
      if (msg.has_stats) {
        listener({
          inFrames: Number(msg.stats.inFrames),
          outFrames: Number(msg.stats.outFrames),
          inPeak: msg.stats.inPeak,
        });
      }
    });
  }

  onEnd(listener: (error?: Error) => void) {
    this.end.add(listener);
  }

  write(pcm: Buffer) {
    this.stream.write(new messages.CallAudioIn({ pcm: pcm }));
  }

  flush() {
    this.stream.write(new messages.CallAudioIn({ flush: true }));
  }

  close() {
    this.stream.end();
    this.stream.cancel();
    this.end.fire();
  }
}

class GowsVideoChannel implements CallVideoChannel {
  private end = new EndOnce();

  constructor(
    private stream: grpc.ClientDuplexStream<
      messages.CallVideoIn,
      messages.CallVideoOut
    >,
  ) {
    watchEnd(stream, this.end);
  }

  onFrame(listener: (frame: CallVideoFrame) => void) {
    this.stream.on('data', function onData(msg: messages.CallVideoOut) {
      if (msg.accessUnit?.length) {
        listener({
          accessUnit: Buffer.from(msg.accessUnit),
          keyframe: msg.keyframe,
          orientation: msg.orientation,
        });
      }
    });
  }

  onControl(listener: (control: CallVideoControl) => void) {
    this.stream.on('data', function onData(msg: messages.CallVideoOut) {
      if (!msg.control) {
        return;
      }
      if (msg.control === 'peer_video') {
        listener({
          type: msg.control,
          active: msg.active,
          orientation: msg.orientation,
        });
        return;
      }
      listener({ type: msg.control });
    });
  }

  onEnd(listener: (error?: Error) => void) {
    this.end.add(listener);
  }

  send(accessUnit: Buffer, durationMs: number) {
    this.stream.write(
      new messages.CallVideoIn({
        accessUnit: accessUnit,
        durationMs: durationMs,
      }),
    );
  }

  setOrientation(orientation: number) {
    this.stream.write(
      new messages.CallVideoIn({
        setOrientation: true,
        orientation: orientation,
      }),
    );
  }

  close() {
    this.stream.end();
    this.stream.cancel();
    this.end.fire();
  }
}
