import process from 'node:process';
import { routeApiRequest, type ApiEnv } from '../../src/utils/mercadoPagoApi.ts';

interface NetlifyGlobal {
  Netlify?: {
    env?: {
      get?: (key: string) => string | undefined;
    };
  };
}

function readNetlifyEnv(): ApiEnv {
  const netlifyGet = (globalThis as unknown as NetlifyGlobal).Netlify?.env?.get;
  const pick = (key: string): string | undefined => {
    const fromNetlify = typeof netlifyGet === 'function' ? netlifyGet(key) : undefined;
    if (fromNetlify && fromNetlify.trim()) return fromNetlify;
    return process.env[key];
  };

  return {
    MERCADO_PAGO_ACCESS_TOKEN: pick('MERCADO_PAGO_ACCESS_TOKEN'),
    APP_URL: pick('APP_URL'),
    URL: pick('URL'),
    DEPLOY_PRIME_URL: pick('DEPLOY_PRIME_URL'),
  };
}

export default async function handler(req: Request): Promise<Response> {
  return routeApiRequest(req, readNetlifyEnv());
}

export const config = {
  path: '/api/*',
};
