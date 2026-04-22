import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  async findOneByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username, status: 'ACTIVE' },
    });
  }

  async findOneByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, status: 'ACTIVE' },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, status: 'ACTIVE' },
    });
  }

  async softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }

  async updateLastLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async findOrCreateByGoogle(data: { googleId: string; email: string; username: string }) {
    let user = await this.prisma.user.findFirst({
      where: { googleId: data.googleId, status: 'ACTIVE' },
    });
    if (user) return user;

    user = await this.prisma.user.findFirst({
      where: { email: data.email, status: 'ACTIVE' },
    });
    if (user) {
      return this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: data.googleId },
      });
    }

    return this.prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        googleId: data.googleId,
      },
    });
  }
}
