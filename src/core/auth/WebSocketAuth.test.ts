import { IncomingMessage } from 'http';

import { WebSocketAuth } from './WebSocketAuth';

function request(url: string, headers: Record<string, string> = {}) {
  return { url: url, headers: headers } as unknown as IncomingMessage;
}

describe('WebSocketAuth', () => {
  const strategy = { user: jest.fn(async (key: string) => key ?? null) };
  const auth = new WebSocketAuth(strategy as any);

  it('reads the key from the X-Api-Key header first', async () => {
    await auth.validateRequest(
      request('/ws?x-api-key=query', { 'x-api-key': 'header' }),
    );
    expect(strategy.user).toHaveBeenLastCalledWith('header');
  });

  it('falls back to the query parameter', async () => {
    await auth.validateRequest(request('/ws?X-Api-Key=query'));
    expect(strategy.user).toHaveBeenLastCalledWith('query');
  });
});
