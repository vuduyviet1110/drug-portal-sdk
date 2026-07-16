import { DrugPortalClient } from '../client.js';
import type { DrugSearchItem, DrugDetail, DrugSearchResult } from '../types/drugs.js';
import type { Prescription } from '../types/prescriptions.js';
import type { TransactionResult } from '../types/inventory.js';

/**
 * Mock Client for DrugPortalClient.
 * Use this in your unit/integration tests to simulate API responses.
 */
export class MockDrugPortalClient extends DrugPortalClient {
  constructor() {
    // Call super with dummy configs so it initializes without error
    super({
      environment: 'sandbox',
      csdlDuoc: { username: 'mock_user', password: 'mock_password' },
      qd228: { appName: 'mock_app', appKey: 'mock_key' },
    });

    // Mock CSDL Dược sub-client methods
    this.csdlDuoc.drugs.search = async (keyword: string) => this.mockSearchDrugs(keyword);
    this.csdlDuoc.drugs.getDetail = async (id: string) => this.mockGetDrugDetail(id);
    this.csdlDuoc.inventory.stockIn = async () => this.mockStockIn();
    this.csdlDuoc.inventory.stockOut = async () => this.mockStockOut();

    // Mock QĐ 228 sub-client methods
    if (this.qd228) {
      this.qd228.prescriptions.get = async (code: string) => this.mockGetPrescription(code);
      this.qd228.prescriptions.updateSaleQty = async () => ({
        success: true,
        status: 200,
        data: {},
      });
    }
  }

  // Pre-configured mock data stores that you can modify in tests
  public mockDrugs: DrugSearchItem[] = [
    {
      id: '1',
      name: 'Paracetamol 500mg',
      registrationNumber: 'VD-12345-20',
      baseUnit: 'Viên',
      source: 'pos',
    },
    {
      id: '2',
      name: 'Ibuprofen 400mg',
      registrationNumber: 'VD-67890-21',
      baseUnit: 'Viên',
      source: 'master',
    },
  ];

  public mockPrescriptions: Record<string, Prescription> = {
    'DT-001': {
      maDonThuoc: 'DT-001',
      patientName: 'Nguyen Van A',
      patientBirthDate: '1990-01-01',
      diagnosis: 'Cảm cúm',
      doctorName: 'Dr. John Doe',
      facilityName: 'Bệnh viện Bạch Mai',
      items: [
        {
          drugCode: '1',
          drugName: 'Paracetamol 500mg',
          unitName: 'Viên',
          prescribedQuantity: 10,
          price: 1000,
        },
      ],
      raw: {},
    },
  };

  private async mockSearchDrugs(keyword: string): Promise<DrugSearchResult> {
    const items = this.mockDrugs.filter((d) =>
      d.name.toLowerCase().includes(keyword.toLowerCase()),
    );
    return { items, total: items.length };
  }

  private async mockGetDrugDetail(id: string): Promise<DrugDetail> {
    const drug = this.mockDrugs.find((d) => d.id === id);
    if (!drug) throw new Error(`Drug with ID ${id} not found in mock store`);
    return {
      id: drug.id,
      name: drug.name,
      registrationNumber: drug.registrationNumber,
      packagings: [],
      activeIngredients: [],
      conversionRate: 1,
      raw: {},
    };
  }

  private async mockStockIn(): Promise<TransactionResult> {
    return {
      transactionId: 'tx-mock-in-' + Date.now(),
      status: 'completed',
      attempts: 1,
      timedOut: false,
    };
  }

  private async mockStockOut(): Promise<TransactionResult> {
    return {
      transactionId: 'tx-mock-out-' + Date.now(),
      status: 'completed',
      attempts: 1,
      timedOut: false,
    };
  }

  private async mockGetPrescription(code: string): Promise<Prescription> {
    const rx = this.mockPrescriptions[code];
    if (!rx) throw new Error(`Prescription ${code} not found in mock store`);
    return rx;
  }
}
