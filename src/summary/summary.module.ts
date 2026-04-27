import { Module } from '@nestjs/common';
import { SummaryService } from './summary.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SummaryService],
  exports: [SummaryService],
})
export class SummaryModule {}
