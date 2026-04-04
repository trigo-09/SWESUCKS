LTA_CARPARK_URL = "https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2"
LTA_TAXI_URL = "https://datamall2.mytransport.sg/ltaodataservice/Taxi-Availability"
LTA_TRAFFIC_URL = "https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2"
WEATHER_2HR_URL = "https://api.data.gov.sg/v1/environment/2-hour-weather-forecast"


# Scoring weights
WEATHER_PENALTY_BAD = -20
WEATHER_BONUS_BAD = 20
TRAFFIC_PENALTY_BAD_WEATHER = -15
TRAFFIC_PENALTY_GOOD_WEATHER = -5
PT_BASE_SCORE = 75

# Distance discounting
DISTANCE_BUCKET_METERS = 200
DISTANCE_DECAY_FACTOR = 0.9

# Taxi scoring thresholds
TAXI_COUNT_HIGH = 5
TAXI_SCORE_HIGH = 90
TAXI_COUNT_MEDIUM = 2
TAXI_SCORE_MEDIUM = 60
TAXI_SCORE_LOW = 30

# Radius limits for LTA data fetching
TAXI_SEARCH_RADIUS_M = 3000
TRAFFIC_SEARCH_RADIUS_M = 2500

# Cache TTLs
SNAPSHOT_CACHE_TTL_SUCCESS = 300  # 5 min
SNAPSHOT_CACHE_TTL_FAILURE = 60   # 1 min cooldown