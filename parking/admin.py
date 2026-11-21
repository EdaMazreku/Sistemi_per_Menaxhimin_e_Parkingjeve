from django.contrib import admin
from django.utils import timezone

from .models import ParkingLot, ParkingSpace, Reservation, Payment


@admin.register(ParkingLot)
class ParkingLotAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "address",
        "capacity",
        "opening_time",
        "closing_time",
        "is_active",
    )

    list_filter = ("is_active",)

    search_fields = ("name", "address")

    readonly_fields = ("created_at",)


@admin.register(ParkingSpace)
class ParkingSpaceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "parking_lot",
        "space_number",
        "space_type",
        "status",
    )

    list_filter = (
        "space_type",
        "status",
        "parking_lot",
    )

    search_fields = (
        "space_number",
        "parking_lot__name",
    )


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

    list_filter = (
        "status",
        "start_time",
        "parking_space__parking_lot",
    )

    search_fields = (
        "user__username",
        "parking_space__space_number",
        "parking_space__parking_lot__name",
    )

    readonly_fields = ("created_at",)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reservation",
        "get_username",
        "get_parking",
        "amount",
        "payment_method",
        "status",
        "payment_date",
    )

    list_filter = (
        "status",
        "payment_method",
        "payment_date",
    )

    search_fields = (
        "reservation__id",
        "reservation__user__username",
        "reservation__parking_space__parking_lot__name",
    )

    readonly_fields = ("payment_date",)

    @admin.display(description="Përdoruesi", ordering="reservation__user__username")
    def get_username(self, obj):
        return obj.reservation.user.username

    @admin.display(description="Parking", ordering="reservation__parking_space__parking_lot__name")
    def get_parking(self, obj):
        return obj.reservation.parking_space.parking_lot.name

    def save_model(self, request, obj, form, change):
        if (
            obj.status == Payment.PaymentStatus.PAID
            and obj.payment_date is None
        ):
            obj.payment_date = timezone.now()

        super().save_model(request, obj, form, change)
