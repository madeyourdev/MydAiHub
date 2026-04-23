import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const AI_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'gemma2-9b-it',
  'gemma-7b-it',
  'mixtral-8x7b-32768',
];

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
