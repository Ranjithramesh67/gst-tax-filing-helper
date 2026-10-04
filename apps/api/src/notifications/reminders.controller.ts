import { Controller, Post } from '@nestjs/common';

import { RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { RemindersService } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Post('run')
  @RequireSuperAdmin()
  async run(): Promise<{ created: number }> {
    return { created: await this.reminders.generate() };
  }
}
