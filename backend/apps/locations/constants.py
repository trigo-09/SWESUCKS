AUTH_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"
SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
ROUTE_URL = "https://www.onemap.gov.sg/api/public/routingsvc/route"
REVERSE_GEOCODE_URLS = [
    "https://www.onemap.gov.sg/api/public/revgeocode",
    "https://www.onemap.gov.sg/api/common/elastic/revgeocode",
]
BOUNDARY_URL = "apps/locations/SLALandSurveyDistrict.geojson"


TOKEN_EXPIRY_BUFFER = 60
TOKEN_EXPIRY_THRESHOLD = 300