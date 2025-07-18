import { Test, TestingModule } from '@nestjs/testing';
import { DefiService } from './defi.service';

describe('DefiService', () => {
  let service: DefiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DefiService],
    }).compile();

    service = module.get<DefiService>(DefiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
