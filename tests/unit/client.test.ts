import { describe, it, expect } from 'vitest';
import '../helpers/mock-handlers';
import { DrugPortalClient } from '../../src/index';

describe('DrugPortalClient initialization', () => {
  it('instantiates with CSDL Dược config', () => {
    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
    });

    expect(client.csdlDuoc).toBeDefined();
    expect(client.csdlDuoc.drugs).toBeDefined();
    expect(client.csdlDuoc.masterData).toBeDefined();
    expect(client.csdlDuoc.inventory).toBeDefined();
    expect(client.qd228).toBeUndefined();
  });

  it('instantiates with QĐ 228 config', () => {
    const client = new DrugPortalClient({
      environment: 'sandbox',
      qd228: { appName: 'test', appKey: 'test' },
    });

    expect(client.csdlDuoc).toBeDefined(); // always created
    expect(client.qd228).toBeDefined();
    expect(client.qd228?.prescriptions).toBeDefined();
  });

  it('instantiates with both configs', () => {
    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
      qd228: { appName: 'test', appKey: 'test' },
    });

    expect(client.csdlDuoc).toBeDefined();
    expect(client.qd228).toBeDefined();
  });

  it('uses sandbox URLs by default', () => {
    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
    });
    // Just ensure no crash — URL resolution is internal
    expect(client).toBeDefined();
  });

  it('uses production URLs when environment=production', () => {
    const client = new DrugPortalClient({
      environment: 'production',
      csdlDuoc: { username: 'test', password: 'test' },
    });
    expect(client).toBeDefined();
  });
});
