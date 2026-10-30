
from django.contrib import admin
from .models import ParkingLot, ParkingSpace, Reservation, Payment


@admin.register(ParkingLot)
class ParkingLotAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "address", "capacity", "is_active")
    search_fields = ("name", "address")
    list_filter = ("is_active",)


@admin.register(ParkingSpace)
class ParkingSpaceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "parking_lot",
        "space_number",
        "space_type",
        "status",
    )
    list_filter = ("space_type", "status", "parking_lot")
    search_fields = ("space_number", "parking_lot__name")


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "parking_space",
        "start_time",
        "end_time",
        "status",
    )
    list_filter = ("status",)
    search_fields = ("user__username", "parking_space__space_number")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reservation",
        "amount",
        "payment_method",
        "status",
        "payment_date",
    )
    list_filter = ("status", "payment_method")
