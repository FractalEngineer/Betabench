export type Segment = {
  id: string;
  kind: "hold" | "linear" | "stop";
  durationMs: number;
  from: number;
  to: number;
  minimum?: boolean;
};
export type Profile = {
  version: 1;
  id: string;
  name: string;
  description: string;
  segments: Segment[];
};
export type Calibration = {
  offset: number;
  countsPerGram: number;
  saved: boolean;
};
export type Identity = {
  build?: string;
  uid?: string;
  name: string;
  version: string;
  api: string;
  motorCount: number;
  enhanced: boolean;
  hx711: boolean;
  simulated: boolean;
  voltageSource: number;
  currentSource: number;
};
export type Sample = {
  t: number;
  fcTime?: number;
  voltage?: number;
  current?: number;
  power?: number;
  rpm?: number[];
  escTemperature?: number[];
  thrustG?: number;
  raw?: number;
  hxSequence?: number;
  hxAgeMs?: number;
  hxValid?: boolean;
  hxStatus?: number;
  calibration?: Calibration;
  outputs: number[];
  requestedOutputs?: number[];
  fcOutputs?: number[];
  throttle: number;
  latencyMs?: number;
};
export type Run = {
  version: 1;
  id: string;
  startedAt: string;
  endedAt?: string;
  state: "running" | "complete" | "aborted" | "interrupted";
  reason?: string;
  profile: Profile;
  selected: number[];
  identity: Identity;
  calibration?: Calibration;
  notes: string;
  samples: Sample[];
};
export interface BenchDevice {
  identity: Identity;
  calibration?: Calibration;
  begin(): Promise<void>;
  motors(values: number[]): Promise<boolean | void>;
  stop(): Promise<void>;
  sample(): Promise<Omit<Sample, "t" | "throttle">>;
  tare(): Promise<void>;
  calibrate(grams: number): Promise<void>;
  saveCalibration(): Promise<void>;
  close(): Promise<void>;
}
