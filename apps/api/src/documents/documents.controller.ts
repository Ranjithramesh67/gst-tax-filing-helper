import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Document, PaginatedDocuments } from '@gstflow/types';
import type { Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { DocumentsService } from './documents.service';
import {
  listDocumentsQuerySchema,
  uploadDocumentSchema,
  type ListDocumentsQueryDto,
  type UploadDocumentDto,
  type UploadedDocumentFile,
} from './dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @RequirePermissions('documents:write')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() actor: Actor,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body(new ZodValidationPipe(uploadDocumentSchema)) body: UploadDocumentDto,
  ): Promise<Document> {
    return this.documents.upload(actor, file, body);
  }

  @Get()
  @RequirePermissions('documents:read')
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocuments> {
    return this.documents.list(actor, query);
  }

  @Get(':id')
  @RequirePermissions('documents:read')
  async get(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<Document> {
    return this.documents.get(actor, id);
  }

  @Get(':id/download')
  @RequirePermissions('documents:read')
  async download(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { document, stream } = await this.documents.download(actor, id);
    const filename = document.fileName.replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }
}
