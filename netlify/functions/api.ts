import process from 'node:process';
import { routeApiRequest } from '../../src/utils/mercadoPagoApi.ts';

export default async function handler(req: Request): Promise<Response> {
  return routeApiRequest(req, process.env);
}

export const config = {
  path: '/api/*',
};
