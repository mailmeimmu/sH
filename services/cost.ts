export type SectorKey = 'residential' | 'commercial';

export type SectorConfig = {
  label: string;
  minRateHalala: number;
  maxRateHalala: number;
};

export const sectorConfigs: Record<SectorKey, SectorConfig> = {
  residential: {
    label: 'Residential',
    minRateHalala: 18,
    maxRateHalala: 30,
  },
  commercial: {
    label: 'Commercial/Industrial',
    minRateHalala: 22,
    maxRateHalala: 32,
  },
};

export function computeCost(kWh: number, rateHalala: number): number {
  const energyUsed = Number.isFinite(kWh) ? kWh : 0;
  const rateSar = rateHalala / 100;
  const costSar = energyUsed * rateSar;
  return Number(costSar.toFixed(2));
}

export function formatSar(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `SAR ${safeAmount.toFixed(2)}`;
}

export function validateUsage(kWh: number): string | null {
  if (!Number.isFinite(kWh)) {
    return 'Enter a valid energy usage value in kWh.';
  }
  if (kWh < 0) {
    return 'Energy usage must be zero or a positive number.';
  }
  return null;
}

export function validateRate(rateHalala: number, sector: SectorKey): string | null {
  const config = sectorConfigs[sector];
  if (!Number.isFinite(rateHalala)) {
    return 'Enter a valid rate in halalas.';
  }
  if (rateHalala < config.minRateHalala || rateHalala > config.maxRateHalala) {
    return `${config.label} rates must be between ${config.minRateHalala} and ${config.maxRateHalala} halalas per kWh.`;
  }
  return null;
}

export function validateCalculatorInputs(kWh: number, rateHalala: number, sector: SectorKey): string | null {
  return validateUsage(kWh) || validateRate(rateHalala, sector);
}
