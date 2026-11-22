import { DaysQuerySchema } from '../days/dto/days-query.schema';
import { ImportsQuerySchema } from '../imports/dto/imports-query.schema';
import { YearParamSchema } from '../summaries/dto/year-param.schema';
import { isDocsPath } from './docs-path';
import { toOpenApiSchema } from './zod-openapi';

describe('Zod → OpenAPI (B3.7)', () => {
  it('Eingabe-Schema: Pflichtfelder, Format date, ohne $schema', () => {
    const json = toOpenApiSchema(DaysQuerySchema, 'input');
    expect(json).not.toHaveProperty('$schema');
    expect(json.required).toEqual(['from', 'to']);
    expect(json.additionalProperties).toBe(false); // .strict()
    expect(json.properties?.['from']).toMatchObject({ type: 'string', format: 'date' });
  });

  it('coerce/default: page und limit als integer mit Grenzen und Standard, nicht Pflicht', () => {
    const json = toOpenApiSchema(ImportsQuerySchema, 'input');
    expect(json.required ?? []).toEqual([]);
    expect(json.properties?.['limit']).toMatchObject({ type: 'integer', minimum: 1, maximum: 100, default: 20 });
    expect(json.properties?.['page']).toMatchObject({ type: 'integer', minimum: 1, default: 1 });
    expect(json.properties?.['page']).not.toHaveProperty('maximum'); // MAX_SAFE_INTEGER weggelassen
    expect(json.properties?.['status']).toMatchObject({ enum: ['queued', 'running', 'succeeded', 'partial', 'failed'] });
  });

  it('transform: Pfadparameter year als Text im Format JJJJ (Eingabeseite)', () => {
    const json = toOpenApiSchema(YearParamSchema, 'input');
    expect(json.properties?.['year']).toMatchObject({ type: 'string', pattern: '^\\d{4}$' });
  });

  it.each([
    ['/api/docs', true],
    ['/api/docs/', true],
    ['/api/docs/swagger-ui-bundle.js', true],
    ['/api/docs-json', true],
    ['/api/docs-yaml', true],
    ['/api/docsx', false],
    ['/api/days', false],
    ['/docs', false],
  ])('isDocsPath(%s) → %p', (path, expected) => {
    expect(isDocsPath(path)).toBe(expected);
  });
});
