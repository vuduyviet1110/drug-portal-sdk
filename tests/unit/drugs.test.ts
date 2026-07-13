import { describe, it, expect } from 'vitest';
import '../helpers/mock-handlers';
import { DrugPortalClient } from '../../src/index';

describe('Drug search', () => {
  const client = new DrugPortalClient({
    environment: 'sandbox',
    csdlDuoc: { username: 'test', password: 'test' },
  });

  it('searches drugs via POS portal and returns normalized results', async () => {
    const result = await client.csdlDuoc.drugs.search('paracetamol');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe('DRUG-001');
    expect(result.items[0]?.name).toBe('Paracetamol 500mg');
    expect(result.items[0]?.source).toBe('pos');
    expect(result.total).toBe(2);
  });

  it('fetches drug detail by ID', async () => {
    const detail = await client.csdlDuoc.drugs.getDetail('DRUG-001');

    expect(detail.id).toBe('DRUG-001');
    expect(detail.name).toBe('Paracetamol 500mg');
    expect(detail.packagings).toHaveLength(2);
    expect(detail.basicUnitName).toBe('Viên');
    expect(detail.conversionRate).toBe(10);
  });
});

describe('Master data', () => {
  const client = new DrugPortalClient({
    environment: 'sandbox',
    csdlDuoc: { username: 'test', password: 'test' },
  });

  it('fetches units', async () => {
    const units = await client.csdlDuoc.masterData.getUnits();
    expect(units).toHaveLength(3);
    expect(units[0]?.name).toBe('Viên');
  });

  it('fetches routes', async () => {
    const routes = await client.csdlDuoc.masterData.getRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.name).toBe('Uống');
  });
});
