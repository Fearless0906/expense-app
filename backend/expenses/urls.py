from django.urls import path

from . import views

urlpatterns = [
    path("", views.api_root),
    path("auth/register/", views.register),
    path("auth/login/", views.login),
    path("auth/password/forgot/", views.forgot_password),
    path("auth/password/reset/", views.reset_password),
    path("auth/me/", views.me),
    path("auth/avatar/", views.avatar),
    path("auth/password/change/", views.change_password),
    path("auth/sessions/others/", views.sign_out_other_phones),
    path("auth/delete/", views.delete_account),
    path("sync/pull/", views.sync_pull),
    path("sync/push/", views.sync_push),
    path("groups/<uuid:pk>/summary/", views.summary),
    path("users/exists/", views.user_exists),
    path("invitations/", views.invitations),
    path("members/<uuid:pk>/join/", views.join_member),
    path("members/<uuid:pk>/decline/", views.decline_member),
]
