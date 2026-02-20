import { Profession, ResourceType } from '../constants';
import { EntityId } from '../types';

export interface WorkerComponent {
  profession: Profession;
  workplaceId: EntityId | null;
  carrying: ResourceType | null;
  carryAmount: number;
  task: string | null;
  manuallyAssigned: boolean;
}
