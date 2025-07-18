import { Module } from '@nestjs/common';
import { DefiService } from './defi.service';
import { DefiController } from './defi.controller';

@Module({
  providers: [DefiService],
  controllers: [DefiController]
})
export class DefiModule {}
