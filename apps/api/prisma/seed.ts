import { PrismaClient, RoleScope } from '@prisma/client';
import { SYSTEM_ROLE_DEFAULTS, SYSTEM_ROLE_LABELS } from '@gstflow/types';
import * as bcrypt from 'bcryptjs';
import { createCipheriv, createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

/**
 * Seeds must store SMS bodies in the same AES-256-GCM envelope the API expects
 * (`iv(12) || tag(16) || ciphertext`, base64), otherwise reads warn and render
 * blank. Mirrors CryptoService key derivation so seeded data decrypts correctly.
 */
function encryptBody(plaintext: string): string {
  const raw = process.env.SMS_ENC_KEY ?? '';
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : createHash('sha256').update(raw || 'gstflow-dev-insecure-key').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

async function ensureSystemRole(key: string): Promise<{ id: string }> {
  const name = SYSTEM_ROLE_LABELS[key] ?? key;
  const existing = await prisma.role.findFirst({ where: { key, firmId: null } });
  const role = existing
    ? await prisma.role.update({
        where: { id: existing.id },
        data: { name, scope: RoleScope.SYSTEM, isSystem: true },
      })
    : await prisma.role.create({
        data: { key, name, scope: RoleScope.SYSTEM, isSystem: true, firmId: null },
      });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  const permissions = SYSTEM_ROLE_DEFAULTS[key] ?? [];
  if (permissions.length) {
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permission })),
    });
  }
  return role;
}

async function main(): Promise<void> {
  const superAdminRole = await ensureSystemRole('SUPER_ADMIN');
  const firmAdminRole = await ensureSystemRole('FIRM_ADMIN');
  const filerRole = await ensureSystemRole('FILER');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@gstflow.local' },
    update: { roleId: superAdminRole.id },
    create: {
      email: 'superadmin@gstflow.local',
      name: 'Platform Owner',
      roleId: superAdminRole.id,
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
    update: { roleId: firmAdminRole.id },
    create: {
      email: 'admin@sharma.local',
      name: 'Priya Sharma',
      roleId: firmAdminRole.id,
      firmId: firm.id,
      phone: '+919876500002',
      passwordHash: await bcrypt.hash('Firm@12345', 10),
    },
  });

  const filer = await prisma.user.upsert({
    where: { email: 'filer@sharma.local' },
    update: { roleId: filerRole.id },
    create: {
      email: 'filer@sharma.local',
      name: 'Rahul Verma',
      roleId: filerRole.id,
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

  const seedSmsBody = encryptBody('GST invoice INV-2026-0001 for Rs.11,800 from Acme Traders.');
  const existingSms = await prisma.smsMessage.findFirst({
    where: { clientId: client.id, hash: 'seed-hash-1' },
  });
  if (!existingSms) {
    await prisma.smsMessage.create({
      data: {
        clientId: client.id,
        sender: 'AD-GSTN',
        bodyEncrypted: seedSmsBody,
        receivedAt: new Date(),
        category: 'GST_INVOICE',
        status: 'RECEIVED',
        hash: 'seed-hash-1',
      },
    });
  } else if (existingSms.bodyEncrypted === 'seed-plaintext') {
    await prisma.smsMessage.update({
      where: { id: existingSms.id },
      data: { bodyEncrypted: seedSmsBody },
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
