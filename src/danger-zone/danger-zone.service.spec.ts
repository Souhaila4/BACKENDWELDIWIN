import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DangerZoneService } from './danger-zone.service';
import { DangerZone } from './schemas/danger-zone.schema';
import { DangerZoneEvent } from './schemas/danger-zone-event.schema';
import { Child } from '../child/schemas/child.schema';

describe('DangerZoneService', () => {
  let service: DangerZoneService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DangerZoneService,
        {
          provide: getModelToken(DangerZone.name),
          useValue: {},
        },
        {
          provide: getModelToken(DangerZoneEvent.name),
          useValue: {},
        },
        {
          provide: getModelToken(Child.name),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<DangerZoneService>(DangerZoneService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

