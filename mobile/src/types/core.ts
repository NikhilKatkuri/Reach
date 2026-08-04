export type Day =
  'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface Meta {
  day: Day;
  is_holiday: false;
}

export type SegmentType = 'wait' | 'walk' | 'ride' | 'transfer';
export type s_scale = 'm' | 'km';

//  0 = empty
//  1 = seat available
//  2 = moderate (seat_full and empty_stand)
//  3 = standing comfortable (can_stand)
//  4 = packed (foot_board)
//  5 = difficult to board (full_foot_board)
export type crowd_level = 0 | 1 | 2 | 3 | 4 | 5;

//  0 = free flow
//  1 = light
//  2 = moderate
//  3 = heavy
//  4 = severe
//  5 = 5 gridlock / extreme
export type traffic_level = 0 | 1 | 2 | 3 | 4 | 5;

export type weather_condition = 'clear' | 'cloudy' | 'light_rain';
export type Timestamp = number;
export type UnitInterval = number & { readonly __brand: unique symbol };

interface BaseSegment<T> {
  type: T;
  start: string;
  end: string;
  distance?: {
    value: number;
    scale: s_scale;
  };
}

export interface WalkSegment extends BaseSegment<'walk'> {
  from: string;
  to: string;
}

export interface WaitSegment extends BaseSegment<'wait'> {
  stop: string;
  missed_vechile: string;
  route_expected: string;
  stop_crowd: crowd_level;
  vehicle_crowd: crowd_level;
}

export interface RideSegment extends BaseSegment<'ride'> {
  from: string;
  to: string;
  route: string;
  traffic_level: traffic_level;
  boarding_crowd: crowd_level;
  in_vehicle_peak_crowd: crowd_level;
}

export interface TransferSegment extends BaseSegment<'transfer'> {
  at: string;
  next_route: string;
  connection_success: string;
  crowd_level: crowd_level;
}

export interface Decision {
  at: string;
  ime: Timestamp;
  hosen_route: string;
  confidence: UnitInterval;
}

export type Segment = WaitSegment | WalkSegment | RideSegment | TransferSegment;

export interface Trip {
  trip_id: string;
  trip_type: string;
  meta: Meta;
  segments: Segment[];
  decisions: Decision[];
  final_destination: string;
  condition: {
    weather: weather_condition;
    traffic_city: traffic_level;
  };
}

export interface Edge {
  from: string;
  to: string;
  observations: string;
  avg_duration_min: number;
  p90_duration_min: number;
  on_time_rate: number;
}

export interface EdgeDictionary {
  [key: string]: Edge;
}

export interface Graph {
  nodes: string[];
  edges: EdgeDictionary;
}
