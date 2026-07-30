/**
 * @imageryx/providers
 *
 * Phase 1 exposes only provider *identifiers* — the vocabulary the API
 * Worker and dashboard use to report which storage/transformation backend
 * is configured (currently always "local" / "mock", see .env.example).
 * Provider *implementations* (R2, Cloudinary, in-house transform) are
 * introduced in a later phase; this package intentionally contains no
 * client code, network calls, or credentials handling yet.
 */

export type StorageProviderId = 'local' | 'r2';

export type TransformationProviderId = 'mock' | 'cloudinary' | 'in-house';
