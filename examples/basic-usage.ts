import { DrugPortalClient } from '@icare/drug-portal-sdk';

const client = new DrugPortalClient({
  environment: 'sandbox',
  csdlDuoc: {
    username: process.env.CSDL_DUOC_USERNAME ?? '',
    password: process.env.CSDL_DUOC_PASSWORD ?? '',
  },
});

async function main() {
  // Search for drugs
  const drugs = await client.csdlDuoc.drugs.search('paracetamol');
  console.log('Found', drugs.items.length, 'drugs');

  // Get detail of first drug
  if (drugs.items[0]) {
    const detail = await client.csdlDuoc.drugs.getDetail(drugs.items[0].id);
    console.log('Detail:', detail.name, detail.packagings);
  }

  // Get master data
  const units = await client.csdlDuoc.masterData.getUnits();
  console.log('Units:', units.map(u => u.name).join(', '));
}

main().catch(console.error);
