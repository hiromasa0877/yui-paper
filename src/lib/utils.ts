import { ZipCloudResponse } from '@/types/database';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDateOnly(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function clsx(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ');
}

const ZIPCLOUD_API_URL =
  process.env.NEXT_PUBLIC_ZIPCLOUD_API_URL ||
  'https://zipcloud.ibsnet.co.jp/api/search';

export async function lookupZipcode(zipcode: string): Promise<string | null> {
  const cleanZipcode = normalizeZipcode(zipcode);

  if (cleanZipcode.length !== 7) {
    return null;
  }

  try {
    const response = await fetch(
      `${ZIPCLOUD_API_URL}?zipcode=${cleanZipcode}`,
      {
        method: 'GET',
        // ZipCloud API does not allow custom headers; omit Content-Type.
      }
    );

    if (!response.ok) {
      return null;
    }

    const data: ZipCloudResponse = await response.json();

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
    return `${result.address1}${result.address2}${result.address3}`;
  } catch (error) {
    console.error('Zipcode lookup error:', error);
    return null;
  }
}

/** Format koden management number as zero-padded 3-digit string (e.g. 1 -> "001"). */
export function formatKodenNumber(n: number | null | undefined): string {
  if (n == null) return '-';
  return String(n).padStart(3, '0');
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePhoneNumber(phone: string): boolean {
  const re = /^[\d\s\-+()]*$/;
  return re.test(phone) && phone.replace(/[^\d]/g, '').length >= 10;
}

export function validateZipcode(zipcode: string): boolean {
  const cleaned = normalizeZipcode(zipcode);
  return cleaned.length === 7;
}

/**
 * Normalize a zipcode input to a 7-digit string.
 * Accepts hyphens, full-width digits, and whitespace and strips them out.
 */
export function normalizeZipcode(zipcode: string): string {
  if (!zipcode) return '';
  // Convert full-width digits to half-width and keep only digits.
  return zipcode
    .replace(/[０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    )
    .replace(/[^\d]/g, '');
}
