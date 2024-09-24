from django.urls import path

from . import views

urlpatterns = [
    path('', views.video_call, name='index'),
    path('api/login/', views.CustomAuthToken.as_view(), name='login_view'),
]