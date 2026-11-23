import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { IdParamSchema } from '../common/dto/id-param.schema';
import type { IdParam } from '../common/dto/id-param.schema';
import { etagOf, ifMatchVersions } from '../common/etag';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CorrectionHistorySchema, ObservationResourceSchema } from '../openapi/response.schemas';
import { ApiBearer, ApiErrors, ApiIfMatch, ApiZodBody, ApiZodParams, ApiZodResponse } from '../openapi/zod-openapi';
import { ADMIN_ROLE } from '../users/role.entity';
import type { AuthUser } from '../users/user';
import type { CorrectionHistory } from './correction';
import { CorrectionsService } from './corrections.service';
import { CorrectionParamSchema } from './dto/correction-param.schema';
import type { CorrectionParam } from './dto/correction-param.schema';
import { ObservationPatchSchema } from './dto/observation-patch.schema';
import type { ObservationPatch } from './dto/observation-patch.schema';
import { ReversalSchema } from './dto/reversal.schema';
import type { Reversal } from './dto/reversal.schema';
import type { ObservationResource } from './observation-resource';

const ETAG_HEADER = { ETag: 'Version der Stunde als starkes ETag, z. B. "4"' };

/**
 * US13 (N03): eine Stunde lesen (Gast, mit `ETag`) und als Admin korrigieren bzw. eine Korrektur zurücknehmen
 * (03 B3.4, B4.7). Der Controller prüft nur, ob `If-Match` da ist (R17, 428); Version, Vorhersage (R08) und
 * Rücknahme (R33) prüft der `CorrectionsService`. Jede Route hat genau `@Public()` oder `@Roles('admin')`.
 */
@ApiTags('observations')
@Controller('observations')
export class ObservationsController {
  constructor(private readonly service: CorrectionsService) {}

  /** US13-1: `ETag: "<version>"`; mit passendem `If-None-Match` antwortet Express mit 304. */
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Eine Stunde mit Version (ETag) für die Korrektur (US13-1)' })
  @ApiZodParams(IdParamSchema)
  @ApiZodResponse(200, ObservationResourceSchema, 'Stunde, Werte ungerundet; 304 bei passendem If-None-Match', ETAG_HEADER)
  @ApiErrors({ 400: 'VALIDATION_FAILED an `id`', 404: 'NOT_FOUND: Stunde unbekannt' })
  async findOne(
    @Param(new ZodValidationPipe(IdParamSchema)) { id }: IdParam,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ObservationResource> {
    const observation = await this.service.findObservation(id);
    res.setHeader('ETag', etagOf(observation.version));
    return observation;
  }

  /** US13-2 bis -10 (R16, R17, R08): JSON Merge Patch mit Begründung; Antwort mit neuem `ETag`. */
  @Patch(':id')
  @Roles(ADMIN_ROLE)
  @ApiBearer()
  @ApiOperation({ summary: 'Messwerte einer Stunde korrigieren (If-Match Pflicht, ein Protokolleintrag je Feld; US13-2)' })
  @ApiZodParams(IdParamSchema)
  @ApiIfMatch()
  @ApiConsumes('application/merge-patch+json', 'application/json')
  @ApiZodBody(ObservationPatchSchema, 'Fehlendes Feld = unverändert, `null` = unbekannt (R14, R16); `reason` Pflicht')
  @ApiZodResponse(200, ObservationResourceSchema, 'Geänderte Stunde (`correctedAt` gesetzt, `version + 1`)', ETAG_HEADER)
  @ApiErrors({
    400: 'VALIDATION_FAILED (Grenzen R16, `unrecognized_keys`, `missing_measurement` an `field: null`, `reason`)',
    404: 'NOT_FOUND: Stunde unbekannt',
    409: 'OBSERVATION_IS_PREDICTION: die Stunde ist eine Vorhersage (R08)',
    412: 'PRECONDITION_FAILED: If-Match passt nicht zur aktuellen Version (R17)',
    413: 'PAYLOAD_TOO_LARGE: Body über 64 KB',
    415: 'UNSUPPORTED_MEDIA_TYPE: Body nicht `application/merge-patch+json` bzw. `application/json`',
    428: 'PRECONDITION_REQUIRED: If-Match fehlt (R17)',
  })
  async correct(
    @Param(new ZodValidationPipe(IdParamSchema)) { id }: IdParam,
    @Body(new ZodValidationPipe(ObservationPatchSchema)) patch: ObservationPatch,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ObservationResource> {
    const versions = ifMatchVersions(ifMatch);
    const observation = await this.service.correct(id, versions, patch, user.sub);
    res.setHeader('ETag', etagOf(observation.version));
    return observation;
  }

  /** US13-11: Historie einer Stunde. */
  @Get(':id/corrections')
  @Roles(ADMIN_ROLE)
  @ApiBearer()
  @ApiOperation({ summary: 'Korrekturhistorie einer Stunde, neueste zuerst (US13-11)' })
  @ApiZodParams(IdParamSchema)
  @ApiZodResponse(200, CorrectionHistorySchema, 'Einträge mit `field`, `oldValue`, `newValue`, `reason`, `correctedBy`')
  @ApiErrors({ 400: 'VALIDATION_FAILED an `id`', 404: 'NOT_FOUND: Stunde unbekannt' })
  history(@Param(new ZodValidationPipe(IdParamSchema)) { id }: IdParam): Promise<CorrectionHistory> {
    return this.service.history(id);
  }

  /** US13-16 bis -18 (R33): Rücknahme; antwortet wie PATCH mit 200, der Stunde und dem neuen `ETag`. */
  @Post(':id/corrections/:correctionId/reversal')
  @HttpCode(HttpStatus.OK)
  @Roles(ADMIN_ROLE)
  @ApiBearer()
  @ApiOperation({ summary: 'Korrektur zurücknehmen (If-Match Pflicht, neuer Protokolleintrag; R33, US13-16)' })
  @ApiZodParams(CorrectionParamSchema)
  @ApiIfMatch()
  @ApiZodBody(ReversalSchema, 'Nur `reason` (3 bis 500 Zeichen)')
  @ApiZodResponse(200, ObservationResourceSchema, 'Stunde mit dem alten Wert (`version + 1`)', ETAG_HEADER)
  @ApiErrors({
    400: 'VALIDATION_FAILED an `id`, `correctionId`, `reason` oder `unrecognized_keys`',
    404: 'NOT_FOUND: Stunde unbekannt oder Korrektur gehört nicht zur Stunde',
    409: 'CORRECTION_NOT_REVERSIBLE: schon zurückgenommen, nicht die jüngste Korrektur des Felds oder selbst eine Rücknahme',
    412: 'PRECONDITION_FAILED: If-Match passt nicht zur aktuellen Version',
    413: 'PAYLOAD_TOO_LARGE: Body über 64 KB',
    415: 'UNSUPPORTED_MEDIA_TYPE: Body nicht `application/json`',
    428: 'PRECONDITION_REQUIRED: If-Match fehlt',
  })
  async revert(
    @Param(new ZodValidationPipe(CorrectionParamSchema)) { id, correctionId }: CorrectionParam,
    @Body(new ZodValidationPipe(ReversalSchema)) { reason }: Reversal,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ObservationResource> {
    const versions = ifMatchVersions(ifMatch);
    const observation = await this.service.revert(id, correctionId, versions, reason, user.sub);
    res.setHeader('ETag', etagOf(observation.version));
    return observation;
  }
}
