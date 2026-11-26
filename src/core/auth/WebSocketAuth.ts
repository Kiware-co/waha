import { Injectable } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { ApiKeyStrategy } from '@waha/core/auth/apiKey.strategy';

@Injectable()
export class WebSocketAuth {
  constructor(private strategy: ApiKeyStrategy) {}

  async validateRequest(request: IncomingMessage) {
    // Server-side clients can send the key as a header, keeping it out of access logs.
    const apikey =
      this.getKeyFromHeaders('x-api-key', request) ??
      this.getKeyFromQueryParams('x-api-key', request);
    return await this.strategy.user(apikey);
  }

  private getKeyFromHeaders(name: string, request: IncomingMessage) {
    const value = request.headers?.[name];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value || undefined;
  }

  private getKeyFromQueryParams(name: string, request: IncomingMessage) {
    // Case-insensitive
    name = name.toLowerCase();
    const query = new URL(request.url || '', 'http://localhost').searchParams;
    const matches: string[] = [];

    for (const [key, value] of query.entries()) {
      if (key.toLowerCase() === name) {
        matches.push(value);
      }
    }

    if (matches.length === 0) {
      return undefined;
    }
    return matches[0];
  }
}
