from django.urls import path

from . import views

urlpatterns = [
    path('', views.home_index, name='home'),
    path('dashboard/', views.dashboard, name='dashboard'),
]
