import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import '../helpers/mock-handlers';
import { server } from '../helpers/mock-handlers';
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

  it('searches master catalog when source=master', async () => {
    const result = await client.csdlDuoc.drugs.search('paracetamol', { source: 'master' });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.source).toBe('master');
    expect(result.items[0]?.id).toBe('DRUG-001');
  });

  it('falls back to master when POS returns empty', async () => {
    server.use(
      http.post('*/api/pos/product/get-paged', () =>
        HttpResponse.json({ result: { items: [], total: 0 } }),
      ),
    );

    const result = await client.csdlDuoc.drugs.search('paracetamol', { source: 'auto' });
    expect(result.items[0]?.source).toBe('master');
    expect(result.total).toBe(2);
  });

  it('falls back to master when POS request fails', async () => {
    server.use(
      http.post('*/api/pos/product/get-paged', () => new HttpResponse('err', { status: 500 })),
    );

    const noRetryClient = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
      retry: { maxRetries: 0 },
    });

    const result = await noRetryClient.csdlDuoc.drugs.search('paracetamol', {
      source: 'auto',
    });
    expect(result.items[0]?.source).toBe('master');
  });

  it('returns empty when source=pos and POS is empty', async () => {
    server.use(
      http.post('*/api/pos/product/get-paged', () =>
        HttpResponse.json({ result: { items: [], total: 0 } }),
      ),
    );
    const result = await client.csdlDuoc.drugs.search('x', { source: 'pos' });
    expect(result.items).toHaveLength(0);
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

  it('fetches countries, drug groups, manufacturers, and active ingredients', async () => {
    const countries = await client.csdlDuoc.masterData.getCountries('Việt');
    const groups = await client.csdlDuoc.masterData.getDrugGroups();
    const manufacturers = await client.csdlDuoc.masterData.getManufacturers();
    const ingredients = await client.csdlDuoc.masterData.getActiveIngredients();

    expect(countries).toHaveLength(2);
    expect(groups[0]?.name).toBe('Giảm đau');
    expect(manufacturers[0]?.name).toBe('Pharma Corp');
    expect(ingredients[0]?.name).toBe('Paracetamol');
  });
});
