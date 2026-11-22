import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdParamSchema } from '../common/dto/id-param.schema';
import type { IdParam } from '../common/dto/id-param.schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ImportListSchema, ImportResourceSchema } from '../openapi/response.schemas';
import { ApiBearer, ApiErrors, ApiZodBody, ApiZodParams, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { ImportCreateSchema } from './dto/import-create.schema';
import type { ImportCreateDto } from './dto/import-create.schema';
import { ImportsQuerySchema } from './dto/imports-query.schema';
import type { ImportsQuery } from './dto/imports-query.schema';
import { importPath, toImportResource } from './import';
import type { ImportList, ImportResource } from './import';
import { ImportsService } from './imports.service';

/**
 * US10-3, US11-1/-2/-3/-4: Importaufträge (asynchron, 03 B3.5). Ohne `@Public()`: Seit Schritt 10 verlangt der
 * globale `JwtAuthGuard` ein gültiges Token (sonst 401, US10-1, US11-5); `@Roles('admin')` folgt in Schritt 11.
 */
@ApiTags('imports')
@ApiBearer()
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  /** R18 (Form, Reihenfolge, Spanne) prüft die Pipe, R02 (`to` nicht in der Zukunft) der Service. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import anlegen (asynchron, 202 mit Location; B3.5)' })
  @ApiZodBody(ImportCreateSchema, 'Zeitraum höchstens 1096 Tage, `from ≤ to`, `to` höchstens heute (R18)')
  @ApiZodResponse(202, ImportResourceSchema, 'Auftrag angenommen (`status = "queued"`), Header `Location`')
  @ApiErrors({
    400: 'VALIDATION_FAILED (Body, kaputtes JSON) oder DATE_IN_FUTURE an `to`',
    409: 'IMPORT_RUNNING: es läuft schon ein Import (`details.runningImportId`, R19)',
    413: 'PAYLOAD_TOO_LARGE: Body über 64 KB',
    415: 'UNSUPPORTED_MEDIA_TYPE: Body nicht `application/json`',
  })
  async create(
    @Body(new ZodValidationPipe(ImportCreateSchema)) dto: ImportCreateDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImportResource> {
    const record = await this.service.create(dto);
    res.setHeader('Location', importPath(record.id));
    return toImportResource(record);
  }

  /** R24 (Pagination) und R22 prüft die Pipe; Sortierung fest nach `requestedAt` absteigend. */
  @Get()
  @ApiOperation({ summary: 'Importprotokoll, nach requestedAt absteigend, mit Pagination (US11-2)' })
  @ApiZodQuery(ImportsQuerySchema)
  @ApiZodResponse(200, ImportListSchema, 'Eine Seite; `meta = { page, limit, total }`')
  @ApiErrors({
    400: 'VALIDATION_FAILED an `status`, `kind`, `page` (≥ 1), `limit` (1–100) oder `unrecognized_keys`',
  })
  findPage(@Query(new ZodValidationPipe(ImportsQuerySchema)) query: ImportsQuery): Promise<ImportList> {
    return this.service.findPage(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ein Import (Polling, B3.5)' })
  @ApiZodParams(IdParamSchema)
  @ApiZodResponse(200, ImportResourceSchema, 'Import mit Status, Zählern, Warnungen')
  @ApiErrors({ 400: 'VALIDATION_FAILED an `id`', 404: 'NOT_FOUND: Import unbekannt' })
  async findOne(@Param(new ZodValidationPipe(IdParamSchema)) { id }: IdParam): Promise<ImportResource> {
    return toImportResource(await this.service.findOne(id));
  }
}
