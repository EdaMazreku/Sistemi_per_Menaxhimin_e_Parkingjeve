
from django.conf import settings
from django.db import models
from django.db.models import F, Q


class ParkingLot(models.Model):
    name = models.CharField(max_length=150)
    address = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    capacity = models.PositiveIntegerField(default=0)
    opening_time = models.TimeField()
    closing_time = models.TimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Parking"
        verbose_name_plural = "Parkingjet"

    def __str__(self):
        return self.name


class ParkingSpace(models.Model):

    class SpaceType(models.TextChoices):
        STANDARD = "standard", "Standard"
        DISABLED = "disabled", "Për persona me aftësi të kufizuara"
        ELECTRIC = "electric", "Për automjete elektrike"

    class SpaceStatus(models.TextChoices):
        AVAILABLE = "available", "I lirë"
        OCCUPIED = "occupied", "I zënë"
        MAINTENANCE = "maintenance", "Në mirëmbajtje"

    parking_lot = models.ForeignKey(
        ParkingLot,
        on_delete=models.CASCADE,
        related_name="spaces",
    )

    space_number = models.CharField(max_length=20)

    space_type = models.CharField(
        max_length=20,
        choices=SpaceType.choices,
        default=SpaceType.STANDARD,
    )

    status = models.CharField(
        max_length=20,
        choices=SpaceStatus.choices,
        default=SpaceStatus.AVAILABLE,
    )

    class Meta:
        ordering = ["parking_lot", "space_number"]
        verbose_name = "Hapësira e parkingut"
        verbose_name_plural = "Hapësirat e parkingut"
        constraints = [
            models.UniqueConstraint(
                fields=["parking_lot", "space_number"],
                name="unique_space_number_per_lot",
            )
        ]

    def __str__(self):
        return f"{self.parking_lot.name} - {self.space_number}"


class Reservation(models.Model):

    class ReservationStatus(models.TextChoices):
        PENDING = "pending", "Në pritje"
        CONFIRMED = "confirmed", "E konfirmuar"
        CANCELLED = "cancelled", "E anuluar"
        COMPLETED = "completed", "E përfunduar"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reservations",
    )

    parking_space = models.ForeignKey(
        ParkingSpace,
        on_delete=models.PROTECT,
        related_name="reservations",
    )

    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    status = models.CharField(
        max_length=20,
        choices=ReservationStatus.choices,
        default=ReservationStatus.PENDING,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_time"]
        verbose_name = "Rezervimi"
        verbose_name_plural = "Rezervimet"
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gt=F("start_time")),
                name="reservation_end_after_start",
            )
        ]

    def __str__(self):
        return f"Rezervimi #{self.pk}"


class Payment(models.Model):

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Para në dorë"
        CARD = "card", "Kartelë"

    class PaymentStatus(models.TextChoices):
        PENDING = "pending", "Në pritje"
        PAID = "paid", "E paguar"
        FAILED = "failed", "Dështoi"
        REFUNDED = "refunded", "E rimbursuar"

    reservation = models.OneToOneField(
        Reservation,
        on_delete=models.CASCADE,
        related_name="payment",
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
    )

    status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
    )

    payment_date = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-payment_date"]
        verbose_name = "Pagesa"
        verbose_name_plural = "Pagesat"
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="payment_amount_non_negative",
            )
        ]

    def __str__(self):
        return f"Pagesa për rezervimin #{self.reservation_id}"
