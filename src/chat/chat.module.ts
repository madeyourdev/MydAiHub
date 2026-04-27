import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SummaryModule } from '../summary/summary.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), SummaryModule, MemoryModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
