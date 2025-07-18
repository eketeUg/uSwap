import { Body, Controller, Post } from '@nestjs/common';
import { DefiService } from './defi.service';

@Controller('defi')
export class DefiController {
  constructor(private readonly defiService: DefiService) {}

  @Post()
  swap(@Body() payload: { tokenIn: any; tokenOut: any; swapAmount: string }) {
    console.log(payload);
    return this.defiService.swap(
      payload.swapAmount,
      payload.tokenIn,
      payload.tokenOut,
    );
  }
}
