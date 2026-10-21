from django.contrib import admin

from .models import Event, Expense, Group, Member


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "credit_limit_cents", "deleted", "updated_at")


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ("name", "group", "user", "invite_username", "deleted")
    list_filter = ("group",)


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("title", "group", "starts_at", "deleted")


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("name", "group", "amount_cents", "spent_at", "deleted")
    list_filter = ("group",)
