import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@gstflow.local' },
    update: {},
    create: {
      email: 'superadmin@gstflow.local',
      name: 'Platform Owner',
      role: Role.SUPER_ADMIN,
      passwordHash: await bcrypt.hash('Admin@12345', 10),
      isActive: true,
    },
  });

  const firm = await prisma.firm.upsert({
    where: { slug: 'sharma-associates' },
    update: {},
    create: {
      name: 'Sharma & Associates',
      slug: 'sharma-associates',
      gstin: '29ABCDE1234F1Z5',
      email: 'hello@sharma.local',
      phone: '+919876500001',
    },
  });

  const firmAdmin = await prisma.user.upsert({
    where: { email: 'admin@sharma.local' },
    update: {},
    create: {
      email: 'admin@sharma.local',
      name: 'Priya Sharma',
      role: Role.FIRM_ADMIN,
      firmId: firm.id,
      phone: '+919876500002',
      passwordHash: await bcrypt.hash('Firm@12345', 10),
    },
  });

  const filer = await prisma.user.upsert({
    where: { email: 'filer@sharma.local' },
    update: {},
    create: {
      email: 'filer@sharma.local',
      name: 'Rahul Verma',
      role: Role.FILER,
      firmId: firm.id,
      phone: '+919876500003',
      passwordHash: await bcrypt.hash('Filer@12345', 10),
    },
  });

  const client = await prisma.client.upsert({
    where: { id: 'seed-client-acme' },
    update: {},
    create: {
      id: 'seed-client-acme',
      firmId: firm.id,
      name: 'Acme Traders Pvt Ltd',
      phone: '+919876543210',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      email: 'accounts@acme.local',
      address: '42 MG Road, Bengaluru, Karnataka',
      stateCode: '29',
      consentGranted: true,
    },
  });

  const client2 = await prisma.client.upsert({
    where: { id: 'seed-client-beta' },
    update: {},
    create: {
      id: 'seed-client-beta',
      firmId: firm.id,
      name: 'Beta Enterprises',
      phone: '+919812345678',
      gstin: '07PQRSX5678K1Z2',
      pan: 'PQRSX5678K',
      address: '11 Nehru Place, New Delhi',
      stateCode: '07',
    },
  });

  const existingSms = await prisma.smsMessage.findFirst({
    where: { clientId: client.id, hash: 'seed-hash-1' },
  });
  if (!existingSms) {
    await prisma.smsMessage.create({
      data: {
        clientId: client.id,
        sender: 'AD-GSTN',
        bodyEncrypted: 'seed-plaintext',
        receivedAt: new Date(),
        category: 'GST_INVOICE',
        status: 'RECEIVED',
        hash: 'seed-hash-1',
      },
    });
  }

  await prisma.appRelease.upsert({
    where: {
      platform_versionCode_channel: {
        platform: 'ANDROID',
        versionCode: 1,
        channel: 'STABLE',
      },
    },
    update: {},
    create: {
      platform: 'ANDROID',
      version: '1.0.0',
      versionCode: 1,
      channel: 'STABLE',
      url: 'https://example.com/gstflow-1.0.0.apk',
      changelog: 'Initial release',
      mandatory: false,
    },
  });

  console.log('Seed complete:');
  console.table([
    { role: 'SUPER_ADMIN', email: superAdmin.email, password: 'Admin@12345' },
    { role: 'FIRM_ADMIN', email: firmAdmin.email, password: 'Firm@12345' },
    { role: 'FILER', email: filer.email, password: 'Filer@12345' },
  ]);
  console.log(`Firm: ${firm.name} (${firm.slug})`);
  console.log(`Clients: ${client.name} ${client.phone}, ${client2.name} ${client2.phone}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
