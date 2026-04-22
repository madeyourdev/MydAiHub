import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const connectionString = process.env.DATABASE_URL!.replace('?pgbouncer=true', '');

    const certBase64 = process.env.SUPABASE_SSL_CERT;
    const ssl = certBase64
      ? { rejectUnauthorized: true, ca: Buffer.from(certBase64, 'base64').toString('utf-8') }
      : { rejectUnauthorized: false };

    if (!certBase64 && process.env.NODE_ENV === 'production') {
      throw new Error('SUPABASE_SSL_CERT environment variable is required in production');
    }

    const adapter = new PrismaPg({ connectionString, ssl });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
