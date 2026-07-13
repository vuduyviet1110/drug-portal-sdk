import { describe, it, expect } from 'vitest';
import {
  resolveCsdlDuocBaseUrl,
  resolvePortalApiRoot,
  resolveNationalRxBaseUrl,
} from '../../src/types/config';

describe('resolveCsdlDuocBaseUrl', () => {
  it('returns sandbox URL for sandbox environment', () => {
    const url = resolveCsdlDuocBaseUrl({ environment: 'sandbox' });
    expect(url).toBe('https://api-sandbox.csdlduoc.com.vn/v2');
  });

  it('returns production URL for production environment', () => {
    const url = resolveCsdlDuocBaseUrl({ environment: 'production' });
    expect(url).toBe('https://api.csdlduoc.com.vn/v2');
  });

  it('uses custom URL when provided', () => {
    const url = resolveCsdlDuocBaseUrl({
      environment: 'sandbox',
      csdlDuocBaseUrl: 'https://custom.example.com/v2',
    });
    expect(url).toBe('https://custom.example.com/v2');
  });
});

describe('resolvePortalApiRoot', () => {
  it('strips /v2 suffix', () => {
    expect(resolvePortalApiRoot('https://api.example.com/v2')).toBe('https://api.example.com');
  });

  it('strips /v2/ with trailing slash', () => {
    expect(resolvePortalApiRoot('https://api.example.com/v2/')).toBe('https://api.example.com');
  });

  it('leaves URLs without /v2 unchanged', () => {
    expect(resolvePortalApiRoot('https://api.example.com')).toBe('https://api.example.com');
  });
});

describe('resolveNationalRxBaseUrl', () => {
  it('returns default URL', () => {
    const url = resolveNationalRxBaseUrl({ environment: 'sandbox' });
    expect(url).toBe('https://donthuocquocgia.vn');
  });

  it('uses custom URL when provided', () => {
    const url = resolveNationalRxBaseUrl({
      environment: 'sandbox',
      nationalRxBaseUrl: 'https://custom-rx.example.com',
    });
    expect(url).toBe('https://custom-rx.example.com');
  });
});
