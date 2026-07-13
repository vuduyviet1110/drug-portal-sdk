import { DrugPortalClient } from '@icare/drug-portal-sdk';

const client = new DrugPortalClient({
  environment: 'sandbox',
  csdlDuoc: {
    username: process.env.CSDL_DUOC_USERNAME ?? '',
    password: process.env.CSDL_DUOC_PASSWORD ?? '',
    storeId: 'STORE-001',
    warehouseCode: 'WH-001',
  },
});

async function main() {
  // Stock-in (nhập kho)
  const result = await client.csdlDuoc.inventory.stockIn({
    items: [
      {
        drugId: 'DRUG-001',
        unitId: 'U-001',
        quantity: 100,
        batchNo: 'LOT-2024-001',
        expiryDate: '2025-12-31',
        price: 5000,
        manufacturer: { id: 'M-001', name: 'Pharma Corp' },
      },
    ],
    reason: 'supplier',
    referenceNumber: 'PO-2024-001',
    supplierId: 'SUP-001',
  });

  console.log('Transaction ID:', result.transactionId);
  console.log('Status:', result.status);
  console.log('Attempts:', result.attempts);

  // Poll existing transaction (if needed)
  // const pollResult = await client.csdlDuoc.inventory.pollTransaction(
  //   'stock-in',
  //   result.transactionId,
  // );
}

main().catch(console.error);
