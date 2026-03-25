from django.urls import path
from apps.video_call_swapper.views import *

urlpatterns = [
    path('', test_view, name='test_view'),
]
