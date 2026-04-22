import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const AI_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'];

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async findAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        credits: true,
        aiModel: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.aiModel && !AI_MODELS.includes(dto.aiModel)) {
      throw new BadRequestException(`aiModel must be one of: ${AI_MODELS.join(', ')}`);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.credits !== undefined && { credits: dto.credits }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.aiModel !== undefined && { aiModel: dto.aiModel }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        credits: true,
        aiModel: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
  }
}
