/**
 * Events
 */
import { ApiProperty } from '@nestjs/swagger';
import { ChatIdProperty } from '@waha/structures/properties.dto';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

function CallIdProperty() {
  return ApiProperty({
    description: 'Call ID',
    example: 'ABCDEFGABCDEFGABCDEFGABCDEFG',
  });
}

export class RejectCallRequest {
  @ChatIdProperty()
  @IsString()
  @IsNotEmpty()
  from: string;

  @CallIdProperty()
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class CallData {
  @CallIdProperty()
  id: string;

  @ChatIdProperty()
  from?: string;

  timestamp: number;

  isVideo: boolean;

  isGroup: boolean;

  _data: any;
}

/**
 * Managed calls (GOWS + meowcaller)
 */
export enum CallState {
  RINGING = 'ringing',
  CALLING = 'calling',
  CONNECTING = 'connecting',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export enum CallEndReason {
  HANGUP_LOCAL = 'hangup_local',
  HANGUP_REMOTE = 'hangup_remote',
  REJECTED_LOCAL = 'rejected_local',
  REJECTED_REMOTE = 'rejected_remote',
  ANSWERED_ELSEWHERE = 'answered_elsewhere',
  REJECTED_ELSEWHERE = 'rejected_elsewhere',
  MISSED = 'missed',
  BUSY = 'busy',
  FAILED = 'failed',
}

export class CallSettings {
  @ApiProperty({
    description: 'Calls are handled for this session',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description:
      'Phone numbers allowed to call and be called, or ["*"] for everyone',
    example: ['573001112233'],
  })
  @IsArray()
  @IsString({ each: true })
  allow: string[];

  @ApiProperty({
    description:
      'False when the engine could not install call support (calls stay off, messaging is unaffected)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  available?: boolean;
}

export class StartCallRequest {
  @ApiProperty({
    description: 'Phone number in international format, digits only',
    example: '573001112233',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Place a video call', default: false })
  @IsOptional()
  @IsBoolean()
  video?: boolean = false;
}

export class AnswerCallRequest {
  @ApiProperty({
    description: 'Who answers; repeated in call events',
    example: 'agent-42',
    required: false,
  })
  @IsOptional()
  @IsString()
  agent?: string;
}

export class MuteCallRequest {
  @ApiProperty({ example: true })
  @IsBoolean()
  muted: boolean;
}

export class CallVideoRequest {
  @ApiProperty({
    description: 'Turn our camera on or off (asks to upgrade a voice call)',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;
}

export class CallInfo {
  @CallIdProperty()
  callId: string;

  @ApiProperty({ enum: ['incoming', 'outgoing'] })
  direction: string;

  @ApiProperty({ example: '573001112233' })
  phone: string;

  @ChatIdProperty()
  chatId: string;

  isVideo: boolean;

  @ApiProperty({ enum: CallState })
  state: CallState;

  muted: boolean;

  videoEnabled: boolean;

  peerVideoActive: boolean;

  @ApiProperty({ required: false })
  answeredBy?: string;

  @ApiProperty({ description: 'Unix seconds' })
  startedAt: number;

  @ApiProperty({ description: 'Unix seconds', required: false })
  connectedAt?: number;
}

export class CallEnded extends CallInfo {
  @ApiProperty({ enum: CallEndReason })
  reason: CallEndReason;

  @ApiProperty({ required: false })
  detail?: string;

  durationMs: number;

  connectedMs: number;
}

export class CallAudioSilent {
  @CallIdProperty()
  callId: string;

  silentMs: number;
}

export class CallVideoState {
  @CallIdProperty()
  callId: string;

  peerVideoActive: boolean;

  orientation: number;

  upgradeRequested: boolean;
}
