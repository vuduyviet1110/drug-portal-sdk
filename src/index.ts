import { CsdlDuocAuth } from './auth/csdl-duoc-auth.js';
import { Qd228Auth } from './auth/qd228-auth.js';
import { StructuredLogger } from './http/logger.js';
import { CsdlDuocClient } from './csdl-duoc/index.js';
import { Qd228Client } from './qd228/index.js';
import { DrugPortalError } from './http/http-client.js';
import { MockDrugPortalClient } from './testing/mock-client.js';
import { DrugPortalClient } from './client.js';

export {
  DrugPortalClient,
  DrugPortalError,
  CsdlDuocAuth,
  Qd228Auth,
  StructuredLogger,
  CsdlDuocClient,
  Qd228Client,
  MockDrugPortalClient,
};

// Re-export all types
export * from './auth/token-store.js';
export type * from './types/config.js';
export type * from './types/auth.js';
export type * from './types/common.js';
export type * from './types/drugs.js';
export type * from './types/inventory.js';
export type * from './types/prescriptions.js';

// Default export for convenience
export default DrugPortalClient;
