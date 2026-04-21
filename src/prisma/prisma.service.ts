import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const connectionString = process.env.DATABASE_URL!.replace('?pgbouncer=true', '');
    const adapter = new PrismaPg({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
