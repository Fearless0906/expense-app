from django.urls import path
from rest_framework.authtoken.views import obtain_auth_token

from . import views

urlpatterns = [
    path("auth/register/", views.register),
    path("auth/login/", obtain_auth_token),
    path("sync/pull/", views.sync_pull),
    path("sync/push/", views.sync_push),
    path("groups/<uuid:pk>/summary/", views.summary),
]
