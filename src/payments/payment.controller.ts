import { Controller, Post, Get, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateChargeDto } from './dto/create-charge.dto';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('charge')
  createCharge(@Request() req: any, @Body() dto: CreateChargeDto) {
    return this.paymentService.createCharge(req.user.userId, dto.credits);
  }

  @Get('charge/:chargeId/status')
  getChargeStatus(@Request() req: any, @Param('chargeId') chargeId: string) {
    return this.paymentService.getChargeStatus(req.user.userId, chargeId);
  }

  @Get('orders')
  getOrders(@Request() req: any) {
    return this.paymentService.getOrders(req.user.userId);
  }

  @SkipThrottle()
  @UseGuards()
  @Post('webhook')
  webhook(@Body() body: any) {
    return this.paymentService.handleWebhook(body);
  }

  @SkipThrottle()
  @UseGuards()
  @Post('dev/complete/:chargeId')
  devComplete(@Param('chargeId') chargeId: string) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException();
    return this.paymentService.devCompleteCharge(chargeId);
  }
}
