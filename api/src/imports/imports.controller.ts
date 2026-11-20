import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IdParamSchema } from '../common/dto/id-param.schema';
import type { IdParam } from '../common/dto/id-param.schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ImportCreateSchema } from './dto/import-create.schema';
import type { ImportCreateDto } from './dto/import-create.schema';
import { importPath, toImportResource } from './import';
import type { ImportResource } from './import';
import { ImportsService } from './imports.service';

/** US10-3, US11-1/-3: Importaufträge (asynchron, 03 B3.5). Schutz per Login/Rolle folgt in Schritt 10/11. */
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  /** R18 (Form, Reihenfolge, Spanne) prüft die Pipe, R02 (`to` nicht in der Zukunft) der Service. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @Body(new ZodValidationPipe(ImportCreateSchema)) dto: ImportCreateDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImportResource> {
    const record = await this.service.create(dto);
    res.setHeader('Location', importPath(record.id));
    return toImportResource(record);
  }

  @Get(':id')
  async findOne(@Param(new ZodValidationPipe(IdParamSchema)) { id }: IdParam): Promise<ImportResource> {
    return toImportResource(await this.service.findOne(id));
  }
}
