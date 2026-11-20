import { Controller, Get } from '@nestjs/common';
import type { Status } from './status';
import { StatusService } from './status.service';

/** US07-1/-2: Datenstand. */
@Controller('status')
export class StatusController {
  constructor(private readonly service: StatusService) {}

  @Get()
  find(): Promise<Status> {
    return this.service.find();
  }
}
