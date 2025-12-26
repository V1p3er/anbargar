from django.urls import path

from . import views

urlpatterns = [
    path('', views.auth_index, name='auth'),
    path('logout/', views.logout_view, name='logout'),
]
