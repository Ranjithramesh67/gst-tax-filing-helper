// Enum values are declared as const objects with companion string-literal union
// types. This keeps them compatible with Prisma's generated string unions while
// still allowing `Role.CLIENT`-style member access.

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FIRM_ADMIN: 'FIRM_ADMIN',
  FILER: 'FILER',
  CLIENT: 'CLIENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const RoleScope = {
  SYSTEM: 'SYSTEM',
  FIRM: 'FIRM',
} as const;
export type RoleScope = (typeof RoleScope)[keyof typeof RoleScope];

export const FirmStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING: 'PENDING',
} as const;
export type FirmStatus = (typeof FirmStatus)[keyof typeof FirmStatus];

export const ClientStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus];

export const LinkStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED',
} as const;
export type LinkStatus = (typeof LinkStatus)[keyof typeof LinkStatus];

export const DevicePlatform = {
  ANDROID: 'ANDROID',
  IOS: 'IOS',
} as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const SmsCategory = {
  GST_INVOICE: 'GST_INVOICE',
  GST_RETURN: 'GST_RETURN',
  EWAY_BILL: 'EWAY_BILL',
  TAX_PAYMENT: 'TAX_PAYMENT',
  GST_NOTICE: 'GST_NOTICE',
  UNCLASSIFIED: 'UNCLASSIFIED',
  OTHER: 'OTHER',
} as const;
export type SmsCategory = (typeof SmsCategory)[keyof typeof SmsCategory];

export const SmsStatus = {
  RECEIVED: 'RECEIVED',
  REVIEWED: 'REVIEWED',
  FILED: 'FILED',
  IGNORED: 'IGNORED',
  FAILED: 'FAILED',
} as const;
export type SmsStatus = (typeof SmsStatus)[keyof typeof SmsStatus];

export const DocumentType = {
  BILL: 'BILL',
  TAX_FILED_COPY: 'TAX_FILED_COPY',
  INVOICE_COPY: 'INVOICE_COPY',
  GST_CERTIFICATE: 'GST_CERTIFICATE',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const ReturnType = {
  GSTR1: 'GSTR1',
  GSTR3B: 'GSTR3B',
  GSTR9: 'GSTR9',
  OTHER: 'OTHER',
} as const;
export type ReturnType = (typeof ReturnType)[keyof typeof ReturnType];

export const FilingStatus = {
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  FILED: 'FILED',
  REJECTED: 'REJECTED',
} as const;
export type FilingStatus = (typeof FilingStatus)[keyof typeof FilingStatus];

export const ReleaseChannel = {
  STABLE: 'STABLE',
  BETA: 'BETA',
} as const;
export type ReleaseChannel = (typeof ReleaseChannel)[keyof typeof ReleaseChannel];

export const OtpPurpose = {
  CLIENT_ONBOARDING: 'CLIENT_ONBOARDING',
  DEVICE_PAIRING: 'DEVICE_PAIRING',
  LOGIN: 'LOGIN',
} as const;
export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

export const PaymentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  UPI: 'UPI',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
