import { DrugPortalClient } from '@icare1/drug-portal-sdk';

const client = new DrugPortalClient({
  environment: 'sandbox',
  qd228: {
    appName: process.env.QD228_APP_NAME ?? '',
    appKey: process.env.QD228_APP_KEY ?? '',
  },
});

async function main() {
  // Lookup prescription
  const rx = await client.qd228!.prescriptions.get('DH001');

  console.log('Prescription code:', rx.maDonThuoc);
  console.log('Diagnosis:', rx.diagnosis);
  console.log('Doctor:', rx.doctorName);
  console.log('Facility:', rx.facilityName);
  console.log('Patient birth:', rx.patientBirthDate);

  console.log('\nDrugs:');
  rx.items.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.drugName} (${item.unitName}) — qty: ${item.prescribedQuantity}, usage: ${item.usageInstruction}`);
  });

  // Update sale quantity (UC05) — called after invoice is posted+paid
  const updateResult = await client.qd228!.prescriptions.updateSaleQty({
    maDonThuoc: 'DH001',
    items: [
      {
        drugId: rx.items[0]?.drugCode,
        drugName: rx.items[0]?.drugName,
        unitName: rx.items[0]?.unitName,
        prescribedQuantity: rx.items[0]?.prescribedQuantity,
        soldQuantity: 10,
        usageInstruction: rx.items[0]?.usageInstruction,
      },
    ],
  });

  console.log('\nUpdate result:', updateResult.success ? '✓ Success' : '✗ Failed');
}

main().catch(console.error);
