import { Test, TestingModule } from '@nestjs/testing';
import { DangerZoneController } from './danger-zone.controller';
import { DangerZoneService } from './danger-zone.service';

describe('DangerZoneController', () => {
  let controller: DangerZoneController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DangerZoneController],
      providers: [
        {
          provide: DangerZoneService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<DangerZoneController>(DangerZoneController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

