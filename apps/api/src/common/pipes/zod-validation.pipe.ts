import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(formatZodError(result.error));
    }
    return result.data;
  }
}

function formatZodError(error: ZodError): string[] {
  return error.errors.map((e) => `${e.path.join('.') || 'body'}: ${e.message}`);
}
