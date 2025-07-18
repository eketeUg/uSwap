import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DefiModule } from './defi/defi.module';

@Module({
  imports: [DefiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
