import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import Omise from 'omise';
import { PrismaService } from '../prisma/prisma.service';
import { PACKAGES } from './dto/create-charge.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly omise: ReturnType<typeof Omise>;

  constructor(private prisma: PrismaService) {
    const secretKey = process.env.OMISE_SECRET_KEY;
    if (!secretKey) throw new Error('OMISE_SECRET_KEY environment variable is required');
    this.omise = Omise({ secretKey, publicKey: process.env.OMISE_PUBLIC_KEY || '' });
  }

  async createCharge(userId: string, credits: number) {
    const amount = PACKAGES[credits];
    if (!amount) throw new BadRequestException('Invalid package');

    let charge: any;
    try {
      charge = await (this.omise.charges as any).create({
        amount: amount * 100,
        currency: 'thb',
        source: { type: 'promptpay' },
      });
    } catch (err: any) {
      this.logger.error('Omise createCharge failed', err?.message);
      throw new InternalServerErrorException('Failed to create payment');
    }

    await this.prisma.order.create({
      data: { userId, credits, amount: amount * 100, chargeId: charge.id, status: 'PENDING' },
    });

    return {
      chargeId: charge.id,
      qrUrl: charge.source?.scannable_code?.image?.download_uri ?? null,
      amount,
      credits,
    };
  }

  async getChargeStatus(userId: string, chargeId: string) {
    const order = await this.prisma.order.findUnique({ where: { chargeId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException();

    if (order.status === 'PAID') return { status: 'PAID', credits: order.credits };
    if (order.status === 'FAILED') return { status: 'FAILED' };

    let charge: any;
    try {
      charge = await this.omise.charges.retrieve(chargeId);
    } catch (err: any) {
      this.logger.error('Omise retrieve failed', err?.message);
      throw new InternalServerErrorException('Failed to check payment status');
    }

    this.logger.log(`Omise charge ${chargeId} status: "${charge.status}" paid: ${charge.paid} authorized: ${charge.authorized}`);

    if (charge.status === 'successful') {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({ where: { chargeId }, data: { status: 'PAID' } });
          this.logger.log(`Order ${chargeId} → PAID`);

          const updated = await tx.user.update({
            where: { id: userId },
            data: { credits: { increment: order.credits } },
            select: { id: true, credits: true },
          });
          this.logger.log(`User ${userId} credits → ${updated.credits} (+${order.credits})`);
        });
      } catch (err: any) {
        this.logger.error(`Transaction failed for charge ${chargeId}: ${err?.message}`);
        throw new InternalServerErrorException('Payment confirmed but failed to update credits — contact support');
      }
      return { status: 'PAID', credits: order.credits };
    }

    if (charge.status === 'failed' || charge.status === 'expired') {
      await this.prisma.order.update({ where: { chargeId }, data: { status: 'FAILED' } });
      return { status: 'FAILED' };
    }

    return { status: 'PENDING' };
  }

  async handleWebhook(body: any) {
    if (body?.key !== 'charge.complete') return;
    const chargeId = body?.data?.id;
    if (!chargeId) return;

    const order = await this.prisma.order.findUnique({ where: { chargeId } });
    if (!order || order.status !== 'PENDING') return;

    // Verify by retrieving charge directly from Omise (don't trust webhook body)
    let charge: any;
    try {
      charge = await this.omise.charges.retrieve(chargeId);
    } catch {
      return;
    }

    if (charge.status === 'successful') {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { chargeId }, data: { status: 'PAID' } });
        await tx.user.update({ where: { id: order.userId }, data: { credits: { increment: order.credits } } });
      });
      this.logger.log(`Webhook: Order ${order.id} paid — +${order.credits} credits for user ${order.userId}`);
    } else if (charge.status === 'failed' || charge.status === 'expired') {
      await this.prisma.order.update({ where: { chargeId }, data: { status: 'FAILED' } });
    }
  }

  async devCompleteCharge(chargeId: string) {
    const order = await this.prisma.order.findUnique({ where: { chargeId } });
    if (!order || order.status !== 'PENDING') {
      return { message: `Order not found or already ${order?.status ?? 'not found'}` };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { chargeId }, data: { status: 'PAID' } });
      const updated = await tx.user.update({
        where: { id: order.userId },
        data: { credits: { increment: order.credits } },
        select: { id: true, credits: true },
      });
      this.logger.log(`[DEV] Simulated payment: user ${order.userId} credits → ${updated.credits} (+${order.credits})`);
    });

    return { status: 'PAID', credits: order.credits };
  }

  async getOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, credits: true, amount: true, status: true, createdAt: true },
    });
  }
}
