/** Public surface of the Reach prediction engine. */
export {
  type CommuteGraph,
  type GraphValidationIssue,
  type RoutePath,
  analyzeTemplate,
  buildGraph,
  countTransfers,
  describeRoute,
  enumerateRoutes,
  findBranchPoints,
  findDeadEnds,
  findDestination,
  findOrigin,
  validateGraph,
} from './graph';

export {
  type DistributionSummary,
  assumedCoefficientOfVariation,
  buildDurationSample,
  fractionAtOrBelow,
  iqr,
  mad,
  mean,
  median,
  percentile,
  shrinkPercentileToPrior,
  shrinkToPrior,
  stddev,
  summarizeDurations,
  synthesizeDistribution,
  totalDurations,
} from './statistics';

export {
  type WeatherPenalty,
  type WeatherPenaltyTable,
  DEFAULT_WEATHER_PENALTY,
  WEATHER_SEVERITY,
  routeWeatherPenalty,
  weatherAffectsCommute,
  weatherLabel,
  weatherPenalty,
  weatherSeverity,
} from './weatherPenalty';

export {
  type TrafficPenalty,
  type TrafficPenaltyTable,
  DEFAULT_TRAFFIC_PENALTY,
  TRAFFIC_SEVERITY,
  routeTrafficPenalty,
  trafficLabel,
  trafficPenalty,
  trafficSeverity,
  trafficShortLabel,
} from './trafficPenalty';

export {
  type CrowdPenalty,
  BOARDING_DELAY_MINUTES,
  TRANSFER_DELAY_MINUTES,
  crowdAffectsCommute,
  crowdLabel,
  crowdPenalty,
  crowdShortLabel,
  transferCrowdDispersion,
} from './crowdPenalty';

export {
  type TransferModelOptions,
  type TransferRisk,
  DEFAULT_HEADWAY_MINUTES,
  evaluateRouteTransfers,
  evaluateTransfer,
  summarizeTransferRisk,
  worstTransfer,
} from './transferRisk';

export {
  type ReliabilityInputs,
  type ReliabilityScore,
  type ReliabilityWeights,
  DEFAULT_WEIGHTS,
  computeReliability,
  confidenceFromObservations,
  crowdScore,
  suggestedBufferMinutes,
  trafficScore,
  varianceScore,
  weatherScore,
} from './reliability';

export {
  type RandomSource,
  createRandom,
  createSeededRandom,
  hashString,
  pick,
  pickWeighted,
  sampleLogNormal,
  sampleNormal,
} from './random';

export {
  type ConditionInput,
  type HistoryInput,
  type PredictOptions,
  type PredictionResult,
  EMPTY_HISTORY,
  predict,
} from './prediction';
