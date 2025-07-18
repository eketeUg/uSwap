import { Test, TestingModule } from '@nestjs/testing';
import { DefiController } from './defi.controller';

describe('DefiController', () => {
  let controller: DefiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DefiController],
    }).compile();

    controller = module.get<DefiController>(DefiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
