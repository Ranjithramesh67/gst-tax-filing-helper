import { BadRequestException } from '@nestjs/common';

export const RESERVED_SLUGS = new Set([
  'login',
  'logout',
  'api',
  'admin',
  '_next',
  'public',
  'static',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'health',
]);

export function assertSlugAllowed(slug: string): void {
  if (RESERVED_SLUGS.has(slug.trim().toLowerCase())) {
    throw new BadRequestException(`"${slug}" is a reserved path and cannot be used as a firm slug`);
  }
}
