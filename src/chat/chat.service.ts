import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CREDIT_COST = 1;

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) { }

  async sendMessage(userId: string, _message: string, _model: string): Promise<{ reply: string; credits: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (user.credits < CREDIT_COST) throw new BadRequestException('Insufficient credits');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: CREDIT_COST } },
    });

    return { reply: 'Test', credits: updated.credits };
    // return { reply, credits: updated.credits }; 
  }
}
