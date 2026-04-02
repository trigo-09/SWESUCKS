from django.contrib import admin

from apps.locations.models import FavouriteLocation
from apps.recommendations.models import RecommendationHistory
from .models import OTPToken, Profile, User


admin.site.register(User)
admin.site.register(Profile)
admin.site.register(OTPToken)
admin.site.register(FavouriteLocation)
admin.site.register(RecommendationHistory)
