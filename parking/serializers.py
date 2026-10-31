
from rest_framework import serializers
from django.utils import timezone

from .models import ParkingLot, ParkingSpace, Reservation, Payment


class ParkingLotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParkingLot
        fields = [
            "id",
            "name",
            "address",
            "description",
            "capacity",
            "opening_time",
            "closing_time",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Kapaciteti i parkingut duhet të jetë së paku 1."
            )
        return value

    def validate(self, attrs):
        opening_time = attrs.get(
            "opening_time",
            getattr(self.instance, "opening_time", None),
        )
        closing_time = attrs.get(
            "closing_time",
            getattr(self.instance, "closing_time", None),
        )

        if opening_time and closing_time and opening_time >= closing_time:
            raise serializers.ValidationError({
                "closing_time": (
                    "Ora e mbylljes duhet të jetë pas orës së hapjes."
                )
            })

        return attrs


class ParkingSpaceSerializer(serializers.ModelSerializer):
    parking_lot_name = serializers.CharField(
        source="parking_lot.name",
        read_only=True,
    )

    class Meta:
        model = ParkingSpace
        fields = [
            "id",
            "parking_lot",
            "parking_lot_name",
            "space_number",
            "space_type",
            "status",
        ]
        read_only_fields = ["id", "parking_lot_name"]
        validators = []

    def validate(self, attrs):
        parking_lot = attrs.get(
            "parking_lot",
            getattr(self.instance, "parking_lot", None),
        )
        space_number = attrs.get(
            "space_number",
            getattr(self.instance, "space_number", None),
        )

        if parking_lot and space_number:
            existing_spaces = ParkingSpace.objects.filter(
                parking_lot=parking_lot,
                space_number=space_number,
            )

            if self.instance:
                existing_spaces = existing_spaces.exclude(
                    pk=self.instance.pk
                )

            if existing_spaces.exists():
                raise serializers.ValidationError({
                    "space_number": (
                        "Ky numër i hapësirës ekziston në këtë parking."
                    )
                })

        return attrs


class ReservationSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        source="user.username",
        read_only=True,
    )
    parking_space_number = serializers.CharField(
        source="parking_space.space_number",
        read_only=True,
    )

    class Meta:
        model = Reservation
        fields = [
            "id",
            "user",
            "username",
            "parking_space",
            "parking_space_number",
            "start_time",
            "end_time",
            "status",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "status",
            "created_at",
        ]

    
    def validate(self, attrs):
        parking_space = attrs.get(
            "parking_space",
            getattr(self.instance, "parking_space", None),
        )

        start_time = attrs.get(
            "start_time",
            getattr(self.instance, "start_time", None),
        )

        end_time = attrs.get(
            "end_time",
            getattr(self.instance, "end_time", None),
        )

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({
                "end_time": (
                    "Koha e përfundimit duhet të jetë pas kohës së fillimit."
                )
            })

        if start_time and start_time <= timezone.now():
            raise serializers.ValidationError({
                "start_time": (
                    "Rezervimi duhet të fillojë në një kohë të ardhshme."
                )
            })

        if parking_space and start_time and end_time:
            overlapping_reservations = Reservation.objects.filter(
                parking_space=parking_space,
                start_time__lt=end_time,
                end_time__gt=start_time,
            ).exclude(
                status__in=[
                    Reservation.ReservationStatus.CANCELLED,
                    Reservation.ReservationStatus.COMPLETED,
                ]
            )

            if self.instance:
                overlapping_reservations = (
                    overlapping_reservations.exclude(
                        pk=self.instance.pk
                    )
                )

            if overlapping_reservations.exists():
                raise serializers.ValidationError({
                    "parking_space": (
                        "Kjo hapësirë është e rezervuar "
                        "gjatë kësaj periudhe kohore."
                    )
                })

        return attrs



class PaymentSerializer(serializers.ModelSerializer):
    reservation = serializers.PrimaryKeyRelatedField(
        queryset=Reservation.objects.all(),
        validators=[],
    )
    reservation_id = serializers.IntegerField(
        source="reservation.id",
        read_only=True,
    )

    class Meta:
        model = Payment
        fields = [
            "id",
            "reservation",
            "reservation_id",
            "amount",
            "payment_method",
            "status",
            "payment_date",
        ]
        read_only_fields = [
            "id",
            "status",
            "payment_date",
        ]

    def validate_reservation(self, value):
        existing_payment = Payment.objects.filter(
            reservation=value
        )

        if self.instance:
            existing_payment = existing_payment.exclude(
                pk=self.instance.pk
            )

        if existing_payment.exists():
            raise serializers.ValidationError(
                "Ky rezervim tashmë ka një pagesë të regjistruar."
            )

        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Shuma e pagesës duhet të jetë më e madhe se zero."
            )
        return value
