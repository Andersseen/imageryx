import { Hono } from 'hono';
import type { HealthCheckResponse } from '@imageryx/contracts';
import type { StorageProviderId, TransformationProviderId } from '@imageryx/providers';
import type { RequestIdVariables } from '../middleware/request-id';
import { VERSION } from '../version';

export interface ServiceInfoResponse extends HealthCheckResponse {
  product: 'Imageryx';
  storageProvider: StorageProviderId;
  transformationProvider: TransformationProviderId;
}

export const infoRoute = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

infoRoute.get('/', (c) => {
  const body: ServiceInfoResponse = {
    product: 'Imageryx',
    service: 'api-worker',
    status: 'healthy',
    environment: c.env.APP_ENV,
    version: VERSION,
    timestamp: new Date().toISOString(),
    storageProvider: c.env.STORAGE_PROVIDER as StorageProviderId,
    transformationProvider: c.env.TRANSFORMATION_PROVIDER as TransformationProviderId,
  };

  return c.json(body);
});
