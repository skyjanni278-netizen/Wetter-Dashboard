import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { parseCreateImportBody } from './create-import.input';
import { importPath, toImportResource } from './import';
import type { ImportResource } from './import';
import { ImportsService } from './imports.service';

/** US10-3, US11-1/-3: Importaufträge (asynchron, 03 B3.5). Schutz per Login/Rolle folgt in Schritt 10/11. */
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<ImportResource> {
    const record = await this.service.create(parseCreateImportBody(body));
    res.setHeader('Location', importPath(record.id));
    return toImportResource(record);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<ImportResource> {
    return toImportResource(await this.service.findOne(id));
  }
}
