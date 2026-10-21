from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import accounts, invites
from .sync import SyncError, accessible_groups, group_summary, normalize_username, pull, push


def _account_call(fn, *args, status_ok=200):
    """Runs a sign-in style call and answers {token, username} (the app needs the username even
    when someone signed in with their email)."""
    try:
        key = fn(*args)
    except accounts.AccountError as e:
        return Response({"detail": str(e)}, status=400)
    user = Token.objects.select_related("user").get(key=key).user
    return Response({"token": key, "username": user.get_username()}, status=status_ok)


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    d = request.data
    return _account_call(
        accounts.register, d.get("username"), d.get("email"), d.get("password") or "",
        status_ok=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    """Username or email, plus password. ("username" is accepted for older app versions.)"""
    d = request.data
    return _account_call(accounts.login, d.get("identifier") or d.get("username"), d.get("password"))


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    accounts.request_reset(request.data.get("identifier"))
    return Response({"detail": accounts.FORGOT_MESSAGE})


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    d = request.data
    return _account_call(accounts.reset_password, d.get("identifier"), d.get("code"), d.get("password") or "")


@api_view(["GET", "POST"])
def me(request):
    """GET: who am I. POST {email}: add or change the email used for password resets."""
    if request.method == "POST":
        try:
            accounts.set_email(request.user, request.data.get("email"))
        except accounts.AccountError as e:
            return Response({"detail": str(e)}, status=400)
    return Response(_me(request.user))


def _me(user):
    return {"username": user.get_username(), "email": user.email, "avatar": accounts.avatar_path(user)}


@api_view(["POST", "DELETE"])
def avatar(request):
    """POST multipart {avatar: file}: set the profile photo. DELETE: back to initials."""
    try:
        if request.method == "POST":
            accounts.set_avatar(request.user, request.FILES.get("avatar"))
        else:
            accounts.remove_avatar(request.user)
    except accounts.AccountError as e:
        return Response({"detail": str(e)}, status=400)
    return Response(_me(request.user))


@api_view(["POST"])
def change_password(request):
    d = request.data
    return _account_call(accounts.change_password, request.user, d.get("current_password"), d.get("password") or "")


@api_view(["POST"])
def sign_out_other_phones(request):
    return _account_call(accounts.sign_out_other_phones, request.user)


@api_view(["POST"])
def delete_account(request):
    try:
        accounts.delete_account(request.user, request.data.get("password"))
    except accounts.AccountError as e:
        return Response({"detail": str(e)}, status=400)
    return Response({"ok": True})


@api_view(["GET"])
def sync_pull(request):
    raw = request.query_params.get("last_pulled_at")
    last = parse_datetime(raw) if raw else None
    if raw and last is None:
        return Response({"detail": "last_pulled_at must be an ISO date-time."}, status=400)
    return Response(pull(request.user, last))


@api_view(["POST"])
def sync_push(request):
    try:
        push(request.user, request.data.get("changes", {}))
    except SyncError as e:
        return Response({"detail": str(e)}, status=400)
    return Response({"ok": True})


@api_view(["GET"])
def user_exists(request):
    """Lets the app catch a mistyped username before sending an invite."""
    username = normalize_username(request.query_params.get("username"))
    exists = bool(username) and get_user_model().objects.filter(username__iexact=username).exists()
    return Response({"exists": exists})


@api_view(["GET"])
def invitations(request):
    return Response(invites.pending_invitations(request.user))


@api_view(["POST"])
def join_member(request, pk):
    try:
        member = invites.join(request.user, pk)
    except invites.InviteError as e:
        return Response({"detail": str(e)}, status=e.status)
    return Response({"group_id": str(member.group_id)})


@api_view(["POST"])
def decline_member(request, pk):
    try:
        invites.decline(request.user, pk)
    except invites.InviteError as e:
        return Response({"detail": str(e)}, status=e.status)
    return Response({"ok": True})


@api_view(["GET"])
def summary(request, pk):
    group = get_object_or_404(accessible_groups(request.user), pk=pk, deleted=False)
    return Response(group_summary(group))
