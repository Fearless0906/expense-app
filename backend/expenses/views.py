from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .sync import SyncError, accessible_groups, group_summary, pull, push


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    User = get_user_model()
    if not username:
        return Response({"detail": "Enter a username."}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return Response({"detail": "That username is taken."}, status=400)
    try:
        validate_password(password)
    except ValidationError as e:
        return Response({"detail": " ".join(e.messages)}, status=400)
    user = User.objects.create_user(username=username, password=password)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key}, status=status.HTTP_201_CREATED)


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
def summary(request, pk):
    group = get_object_or_404(accessible_groups(request.user), pk=pk, deleted=False)
    return Response(group_summary(group))
