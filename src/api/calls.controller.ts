import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  SessionApiParam,
  WorkingSessionParam,
} from '@waha/nestjs/params/SessionApiParam';

import { SessionManager } from '../core/abc/manager.abc';
import { WhatsappSession } from '../core/abc/session.abc';
import {
  AnswerCallRequest,
  CallInfo,
  CallSettings,
  CallVideoRequest,
  MuteCallRequest,
  RejectCallRequest,
  StartCallRequest,
} from '../structures/calls.dto';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanSession, FromParam } from '@waha/core/auth/policies';

import { Action } from '@waha/core/auth/casl.types';

@ApiSecurity('api_key')
@Controller('api/:session/calls')
@ApiTags('📞 Calls')
@UseGuards(PoliciesGuard)
@CheckPolicies(CanSession(Action.Send, FromParam('session')))
export class CallsController {
  constructor(private manager: SessionManager) {}

  @Post('reject')
  @SessionApiParam
  @ApiOperation({ summary: 'Reject incoming call' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  rejectCall(
    @WorkingSessionParam session: WhatsappSession,
    @Body() request: RejectCallRequest,
  ) {
    return session.rejectCall(request.from, request.id);
  }

  @Get('settings')
  @SessionApiParam
  @ApiOperation({ summary: 'Get the call switch of the session' })
  getSettings(@WorkingSessionParam session: WhatsappSession) {
    return session.getCallSettings();
  }

  @Put('settings')
  @SessionApiParam
  @ApiOperation({
    summary: 'Turn managed calls on/off and set the allowed numbers',
    description:
      'Applied at once without restarting the session, and saved with the session config. allow=["*"] allows everyone.',
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async setSettings(
    @WorkingSessionParam session: WhatsappSession,
    @Body() request: CallSettings,
  ): Promise<CallSettings> {
    const settings = await session.setCallSettings(request);
    const config = { ...(session.sessionConfig ?? {}) };
    config.calls = { enabled: settings.enabled, allow: settings.allow };
    session.sessionConfig = config;
    if (await this.manager.sessionConfigRepository?.exists(session.name)) {
      await this.manager.sessionConfigRepository.saveConfig(
        session.name,
        config,
      );
    }
    return settings;
  }

  @Get('')
  @SessionApiParam
  @ApiOperation({ summary: 'Calls in progress (ringing or connected)' })
  listCalls(
    @WorkingSessionParam session: WhatsappSession,
  ): Promise<CallInfo[]> {
    return session.listCalls();
  }

  @Post('start')
  @SessionApiParam
  @HttpCode(201)
  @ApiOperation({ summary: 'Place a voice or video call to an allowed number' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  startCall(
    @WorkingSessionParam session: WhatsappSession,
    @Body() request: StartCallRequest,
  ): Promise<CallInfo> {
    return session.startCall(request);
  }

  @Get(':callId')
  @SessionApiParam
  @ApiOperation({ summary: 'Get a call in progress' })
  getCall(
    @WorkingSessionParam session: WhatsappSession,
    @Param('callId') callId: string,
  ): Promise<CallInfo> {
    return session.getCall(callId);
  }

  @Post(':callId/answer')
  @SessionApiParam
  @HttpCode(200)
  @ApiOperation({
    summary: 'Answer a ringing call',
    description: 'The first answer wins; later ones get 409 with answeredBy',
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  answerCall(
    @WorkingSessionParam session: WhatsappSession,
    @Param('callId') callId: string,
    @Body() request: AnswerCallRequest,
  ): Promise<CallInfo> {
    return session.answerCall(callId, request?.agent);
  }

  @Post(':callId/reject')
  @SessionApiParam
  @HttpCode(204)
  @ApiOperation({ summary: 'Reject a ringing call taken by the calls engine' })
  async rejectManagedCall(
    @WorkingSessionParam session: WhatsappSession,
    @Param('callId') callId: string,
  ): Promise<void> {
    await session.rejectManagedCall(callId);
  }

  @Post(':callId/hangup')
  @SessionApiParam
  @HttpCode(204)
  @ApiOperation({ summary: 'Hang up a call in any state' })
  async hangupCall(
    @WorkingSessionParam session: WhatsappSession,
    @Param('callId') callId: string,
  ): Promise<void> {
    await session.hangupCall(callId);
  }

  @Post(':callId/mute')
  @SessionApiParam
  @HttpCode(200)
  @ApiOperation({ summary: "Mute or unmute the agent's microphone" })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  muteCall(
    @WorkingSessionParam session: WhatsappSession,
    @Param('callId') callId: string,
    @Body() request: MuteCallRequest,
  ): Promise<CallInfo> {
    return session.muteCall(callId, request.muted);
  }

  @Post(':callId/video')
  @SessionApiParam
  @HttpCode(200)
  @ApiOperation({
    summary: 'Turn our camera on or off (asks to upgrade a voice call)',
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  setCallVideo(
    @WorkingSessionParam session: WhatsappSession,
    @Param('callId') callId: string,
    @Body() request: CallVideoRequest,
  ): Promise<CallInfo> {
    return session.setCallVideo(callId, request.enabled);
  }
}
