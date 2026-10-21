"""Accounts: sign up with an email, sign in with username or email, and reset a forgotten password.

Reset flow:
  1. POST /api/auth/password/forgot/ {identifier}  → emails a 6-digit code (if the account has an
     email). The answer is the same either way, so it never reveals which accounts exist.
  2. POST /api/auth/password/reset/ {identifier, code, password} → sets the new password, signs
     out every other phone (their tokens are deleted) and returns a fresh token.

In development the email is printed in the Django terminal (console email backend; see settings).
"""

import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .models import Member, PasswordResetCode, Profile

CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5
RESEND_AFTER = timedelta(seconds=60)

FORGOT_MESSAGE = (
    "If that account has an email address, we sent it a 6-digit code. "
    "It works for 15 minutes."
)
BAD_CODE = "That code is wrong or has expired. Request a new one."


class AccountError(Exception):
    pass


def _clean_email(raw):
    email = (raw or "").strip()
    try:
        validate_email(email)
    except ValidationError:
        raise AccountError("Enter a valid email address, like ana@example.com.")
    return email


def find_user(identifier):
    """A username or an email address (case-insensitive)."""
    identifier = (identifier or "").strip().lstrip("@")
    if not identifier:
        return None
    User = get_user_model()
    field = "email__iexact" if "@" in identifier else "username__iexact"
    return User.objects.filter(**{field: identifier}).first()


def token_for(user):
    token, _ = Token.objects.get_or_create(user=user)
    return token.key


def register(username, email, password):
    User = get_user_model()
    username = (username or "").strip()
    if not username:
        raise AccountError("Enter a username.")
    if "@" in username:
        raise AccountError("A username can't contain @. Use letters, numbers, dots or dashes.")
    if User.objects.filter(username__iexact=username).exists():
        raise AccountError("That username is taken.")
    email = _clean_email(email)
    if User.objects.filter(email__iexact=email).exists():
        raise AccountError("That email is already used by another account.")
    try:
        validate_password(password, user=User(username=username, email=email))
    except ValidationError as e:
        raise AccountError(" ".join(e.messages))
    user = User.objects.create_user(username=username, email=email, password=password)
    return token_for(user)


def login(identifier, password):
    user = find_user(identifier)
    if not user or not user.is_active or not user.check_password(password or ""):
        raise AccountError("That username or email and password don't match.")
    return token_for(user)


def set_email(user, raw):
    email = _clean_email(raw)
    User = get_user_model()
    if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
        raise AccountError("That email is already used by another account.")
    user.email = email
    user.save(update_fields=["email"])
    return email


def request_reset(identifier):
    """Emails a code if the account exists and has an email. Silent otherwise."""
    user = find_user(identifier)
    if not user or not user.email:
        return
    now = timezone.now()
    recent = PasswordResetCode.objects.filter(user=user, used=False, created_at__gt=now - RESEND_AFTER)
    if recent.exists():
        return  # one code a minute; the last one still works
    PasswordResetCode.objects.filter(user=user, used=False).update(used=True)  # only the newest works
    code = f"{secrets.randbelow(10**6):06d}"
    PasswordResetCode.objects.create(user=user, code_hash=make_password(code))
    send_mail(
        subject="Your Hati password reset code",
        message=(
            f"Hi {user.get_username()},\n\n"
            f"Your code to reset your Hati password is {code}.\n"
            "It works for 15 minutes. If you didn't ask for this, you can ignore this email.\n"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )


def reset_password(identifier, code, password):
    user = find_user(identifier)
    if not user:
        raise AccountError(BAD_CODE)
    # Raise only *after* the transaction: raising inside it would roll back the wrong-attempt
    # count, and then a code could be guessed forever.
    error = None
    with transaction.atomic():
        entry = (
            PasswordResetCode.objects.select_for_update()
            .filter(user=user, used=False, created_at__gt=timezone.now() - CODE_TTL)
            .first()
        )
        if not entry:
            error = BAD_CODE
        elif not check_password((code or "").strip(), entry.code_hash):
            entry.attempts += 1
            entry.used = entry.attempts >= MAX_ATTEMPTS
            entry.save(update_fields=["attempts", "used"])
            error = BAD_CODE
        else:
            try:
                validate_password(password, user=user)
            except ValidationError as e:
                error = " ".join(e.messages)  # code stays valid: fix the password and retry
            else:
                entry.used = True
                entry.save(update_fields=["used"])
                user.set_password(password)
                user.save(update_fields=["password"])
                Token.objects.filter(user=user).delete()  # sign out every other phone
    if error:
        raise AccountError(error)
    return token_for(user)


# ---- signed-in account settings ----

MAX_AVATAR_BYTES = 3 * 1024 * 1024


def avatar_path(user):
    """Relative media path of the user's photo ("avatars/…jpg"), or "" for initials."""
    profile = Profile.objects.filter(user=user).first()
    return profile.avatar.name if profile and profile.avatar else ""


def _touch_memberships(user):
    # Bump the person rows linked to this account so other phones' next pull sends the new photo.
    Member.objects.filter(user=user).update(updated_at=timezone.now())


def set_avatar(user, upload):
    if upload is None:
        raise AccountError("Choose a photo to upload.")
    if upload.size > MAX_AVATAR_BYTES:
        raise AccountError("That photo is too big. Choose one under 3 MB.")
    from PIL import Image, UnidentifiedImageError

    try:
        Image.open(upload).verify()  # really an image?
    except (UnidentifiedImageError, OSError):
        raise AccountError("That file isn't a photo we can use. Try a JPG or PNG.")
    upload.seek(0)
    profile, _ = Profile.objects.get_or_create(user=user)
    old = profile.avatar.name if profile.avatar else None
    profile.avatar.save(upload.name or "avatar.jpg", upload, save=True)
    if old:
        profile.avatar.storage.delete(old)
    _touch_memberships(user)
    return profile.avatar.name


def remove_avatar(user):
    profile = Profile.objects.filter(user=user).first()
    if profile and profile.avatar:
        profile.avatar.delete(save=True)
        _touch_memberships(user)


def change_password(user, current, new):
    if not user.check_password(current or ""):
        raise AccountError("Your current password isn't right.")
    if current == new:
        raise AccountError("Choose a password that's different from your current one.")
    try:
        validate_password(new, user=user)
    except ValidationError as e:
        raise AccountError(" ".join(e.messages))
    user.set_password(new)
    user.save(update_fields=["password"])
    Token.objects.filter(user=user).delete()  # other phones must sign in with the new password
    return token_for(user)


def sign_out_other_phones(user):
    """Every phone shares the account's one token: replace it, and only this phone gets the new one."""
    Token.objects.filter(user=user).delete()
    return token_for(user)


def delete_account(user, password):
    """Deletes the account. Budgets it owns are deleted for everyone; in other budgets its
    person stays (so past splits still add up) but is no longer linked to an account."""
    if not user.check_password(password or ""):
        raise AccountError("That password isn't right, so the account wasn't deleted.")
    remove_avatar(user)
    user.delete()
