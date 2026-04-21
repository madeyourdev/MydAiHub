import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
    });
  }

  async findOneByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findOneByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async updateLastLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async findOrCreateByGoogle(data: { googleId: string; email: string; username: string }) {
    let user = await this.prisma.user.findUnique({ where: { googleId: data.googleId } });
    if (user) return user;

    user = await this.prisma.user.findUnique({ where: { email: data.email } });
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
