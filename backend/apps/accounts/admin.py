from django.contrib import admin

from .models import FavouriteLocation, OTPToken, Profile, RecommendationHistory, User


admin.site.register(User)
admin.site.register(Profile)
admin.site.register(OTPToken)
admin.site.register(FavouriteLocation)
admin.site.register(RecommendationHistory)
