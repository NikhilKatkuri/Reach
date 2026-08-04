````ts
# Data Set
<> stands for key pair type or static type
<s> = string,<n>= number, <b>=boolean, <D> = TimeStamp
 
<seg_type> = “wait” | “walk” | “ride” | “transfer”
<range>=0.0 - 1.0
<s_scale>:”m” | “km”

<weather_condition> = "clear" | "cloudy" | "light_rain" | "rain" | "heavy_rain" | "storm"

<crowd_level> = 0 | 1 | 2 | 3 | 4 | 5
# 0 = empty 
# 1 = seat available 
# 2 = moderate (seat_full and empty_stand)
# 3 = standing comfortable (can_stand)
# 4 = packed (foot_board)
# 5 = difficult to board (full_foot_board)

<traffic_level> =0 | 1 | 2 | 3 | 4 | 5
# 0 = free flow 
# 1 = light 
# 2 = moderate 
# 3 = heavy 
# 4 = severe
# 5 = 5 gridlock / extreme


<Meta>:
	day:<s>
	is_holiday:<b>

<scalar_value><T>:
	scale:<T>
	value:<n>

<Distance>:<scalar_value><s_scale>

<Segment><T extends seg_type>:
    type:<T>
    start:<D>
    end:<D>
    distance?:<Distance>

<WalkSegment>: <Segment><”walk”>
    from:<s>
    to:<s>

<WaitSegment>:<Segment><”wait”>
    stop:<s>
    missed_vehicle:<b>
    route_expected:<s>
    stop_crowd:<crowd_level>
    vehicle_crowd:<crowd_level>

<RideSegment>:<Segment><”ride”>
    from:<s>
    to:<s>
    route:<s>
    traffic_level:<traffic_level>
    boarding_crowd:<crowd_level>
    in_vehicle_peak_crowd:<crowd_level>

<TransferSegment>:<Segment><”transfer”>
    at:<s>
    next_route:<s>
    connection_success:<b>
    crowd_level:<crowd_level>

<Decision>: 
    at: <s> 
    time: <D> 
    chosen_route: <s>
    confidence: <range>


<Trip>:
    trip_id <s>
    trip_type<s>
    meta <Meta>
    segments: Array< WaitSegment | WalkSegment | RideSegment | TransferSegment >
    final_destination:<s>
    decisions:Array<Decision>
    conditions:
        weather: <weather_condition>
        traffic_city:<traffic_level>

<Edge>:
    from:<s>
    to:<s>
    observations: <n> 
    avg_duration_min: <n> 
    p90_duration_min: <n> 
    on_time_rate: <n>


<Graph>:
    nodes: Set<s>
    edges:Dictionary<s,<Edge>>
````