import { classifySms, isGstRelated, parseGstSms } from './sms-parser';

const SAMPLE_BODY =
  'Your GSTR-3B for 07-2026 is due on 20-08-2026. GSTIN 29ABCDE1234F1Z5. ' +
  'Taxable value Rs 1,00,000 tax Rs 18,000. Invoice INV-2026-001 HSN 8471.';

describe('classifySms', () => {
  it('classifies a GSTR-3B message as GST_RETURN', () => {
    expect(classifySms(SAMPLE_BODY)).toBe('GST_RETURN');
  });

  it('classifies a GSTR-1 message as GST_RETURN', () => {
    expect(classifySms('GSTR-1 filing due on 11-11-2026')).toBe('GST_RETURN');
  });

  it('classifies an e-way bill message as EWAY_BILL', () => {
    expect(classifySms('E-way bill generated for INV-1')).toBe('EWAY_BILL');
  });

  it('classifies a challan payment message as TAX_PAYMENT', () => {
    expect(classifySms('GST challan paid successfully')).toBe('TAX_PAYMENT');
  });

  it('classifies a notice message as GST_NOTICE', () => {
    expect(classifySms('GST notice ASMT-10 issued')).toBe('GST_NOTICE');
  });

  it('classifies an invoice message as GST_INVOICE', () => {
    expect(classifySms('Tax invoice INV-2026-001 raised')).toBe('GST_INVOICE');
  });

  it('returns UNCLASSIFIED for a GST keyword without a specific intent', () => {
    expect(classifySms('GST registration certificate available')).toBe('UNCLASSIFIED');
  });

  it('returns OTHER for a non-GST message', () => {
    expect(classifySms('Your OTP is 123456. Do not share.')).toBe('OTHER');
    expect(classifySms('Your OTP is 123456', 'VM-HDFCBK')).toBe('OTHER');
  });
});

describe('isGstRelated', () => {
  it('matches when the body contains GST (case-insensitive)', () => {
    expect(isGstRelated('gst due')).toBe(true);
    expect(isGstRelated('Gst')).toBe(true);
    expect(isGstRelated('Your GSTR-3B is due')).toBe(true);
    expect(isGstRelated('GSTIN 29ABCDE1234F1Z5')).toBe(true);
  });

  it('matches when only the sender header contains GST', () => {
    expect(isGstRelated('Your return is due', 'AD-GSTN')).toBe(true);
    expect(isGstRelated('Filing acknowledgement', 'VM-GSTIN')).toBe(true);
  });

  it('ignores broad tax/invoice keywords without GST', () => {
    expect(isGstRelated('Tax invoice INV-2026-001 raised')).toBe(false);
    expect(isGstRelated('Your bill of Rs 500 is due')).toBe(false);
    expect(isGstRelated('Payment of Rs 500 received')).toBe(false);
    expect(isGstRelated('Download your monthly statement')).toBe(false);
  });
});

describe('parseGstSms', () => {
  it('parses the sample GSTR-3B body completely', () => {
    const parsed = parseGstSms(SAMPLE_BODY);

    expect(parsed.gstin).toBe('29ABCDE1234F1Z5');
    expect(parsed.invoiceNo).toBe('INV-2026-001');
    expect(parsed.taxableValue).toBe(100000);
    expect(parsed.taxAmount).toBe(18000);
    expect(parsed.hsn).toBe('8471');
    expect(parsed.dueDate).toEqual(new Date(Date.UTC(2026, 7, 20)));
    expect(parsed.confidence).toBeGreaterThan(0);
    expect(parsed.confidence).toBeLessThanOrEqual(1);
  });

  it('parses DD/MM/YYYY due dates', () => {
    const parsed = parseGstSms('GSTR-3B due 31/03/2027 GSTIN 29ABCDE1234F1Z5');
    expect(parsed.dueDate).toEqual(new Date(Date.UTC(2027, 2, 31)));
  });

  it('handles Indian comma grouping and decimals for taxable and tax', () => {
    const parsed = parseGstSms(
      'Taxable value Rs 12,34,567.50 tax Rs 1,23,456.78',
    );
    expect(parsed.taxableValue).toBe(1234567.5);
    expect(parsed.taxAmount).toBe(123456.78);
  });

  it('extracts a labelled total as the generic amount', () => {
    const parsed = parseGstSms('Tax invoice INV-2026-001 total Rs 5,000');
    expect(parsed.amount).toBe(5000);
  });

  it('extracts a grand total with INR currency', () => {
    const parsed = parseGstSms('Grand total INR 1,23,456.78');
    expect(parsed.amount).toBe(123456.78);
  });

  it('supports the rupee sign for taxable value', () => {
    const parsed = parseGstSms('Taxable value ₹ 5,000.25');
    expect(parsed.taxableValue).toBe(5000.25);
  });

  it('returns nulls and zero confidence when no fields are present', () => {
    const parsed = parseGstSms('Hello world, nothing relevant here');
    expect(parsed.gstin).toBeNull();
    expect(parsed.invoiceNo).toBeNull();
    expect(parsed.amount).toBeNull();
    expect(parsed.taxableValue).toBeNull();
    expect(parsed.taxAmount).toBeNull();
    expect(parsed.hsn).toBeNull();
    expect(parsed.dueDate).toBeNull();
    expect(parsed.confidence).toBe(0);
  });

  it('returns a null due date for an invalid calendar date', () => {
    const parsed = parseGstSms('GST return due 31-02-2026');
    expect(parsed.dueDate).toBeNull();
  });
});

describe('parseGstSms compliance detail', () => {
  it('extracts the return type', () => {
    expect(parseGstSms('Your GSTR-3B is due').returnType).toBe('GSTR3B');
    expect(parseGstSms('GSTR 1 filed for Jan 2026').returnType).toBe('GSTR1');
    expect(parseGstSms('GSTR-9 annual return due').returnType).toBe('GSTR9');
    expect(parseGstSms('GSTR acknowledgement received').returnType).toBe('OTHER');
    expect(parseGstSms('Your return is due').returnType).toBeNull();
  });

  it('normalises a month-name period to YYYY-MM', () => {
    expect(parseGstSms('GSTR-3B for Jan 2026 is due').period).toBe('2026-01');
    expect(parseGstSms('GSTR-1 for December 2025 filed').period).toBe('2025-12');
  });

  it('normalises a labelled numeric period', () => {
    expect(parseGstSms('GSTR-3B for 07-2026 is due').period).toBe('2026-07');
    expect(parseGstSms('Return period: 11/2026').period).toBe('2026-11');
  });

  it('maps an Indian FY quarter to its ending month', () => {
    expect(parseGstSms('GSTR-1 Q3 FY2025-26 filed').period).toBe('2025-12');
    expect(parseGstSms('GSTR-1 Q4 FY2025-26 filed').period).toBe('2026-03');
  });

  it('extracts a labelled ARN', () => {
    const parsed = parseGstSms('GSTR-3B 07-2026 filed successfully. ARN: AA290621000123F');
    expect(parsed.arn).toBe('AA290621000123F');
    expect(parsed.filed).toBe(true);
  });

  it('does not mistake the GSTIN for an ARN', () => {
    const parsed = parseGstSms('GSTIN 29ABCDE1234F1Z5 return due');
    expect(parsed.arn).toBeNull();
  });

  it('extracts a late fee', () => {
    expect(parseGstSms('Late fee Rs 1,000 due').lateFee).toBe(1000);
    expect(parseGstSms('Penalty INR 250.50 applicable').lateFee).toBe(250.5);
  });

  it('detects a filed signal without an ARN', () => {
    expect(parseGstSms('Your GSTR-3B has been filed successfully').filed).toBe(true);
    expect(parseGstSms('Your GSTR-3B is due for filing').filed).toBe(false);
  });

  it('keeps confidence within bounds with the expanded field set', () => {
    const parsed = parseGstSms(SAMPLE_BODY);
    expect(parsed.confidence).toBeGreaterThan(0);
    expect(parsed.confidence).toBeLessThanOrEqual(1);
  });
});
