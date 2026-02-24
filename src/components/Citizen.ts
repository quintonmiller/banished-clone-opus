export type PartnerPreference = 'opposite' | 'both' | 'same';

export interface CitizenComponent {
  firstName: string;
  lastName: string;
  originalLastName?: string;
  name: string;
  age: number;
  isMale: boolean;
  isChild: boolean;
  isEducated: boolean;
  partnerPreference: PartnerPreference;
  // Leisure / relationship tracking (optional — safe to be absent on old saves)
  hadLeisureWithPartner?: boolean;           // reset daily; read by PopulationSystem
  leisureStartTick?: number;                 // tick when current leisure activity began
  educationProgress?: number;               // accumulates toward EDUCATION_PROGRESS_NEEDED
  lastBatheTick?: number;                   // game tick of last bathe; read by DiseaseSystem
}
