import math
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone

from rest_framework import serializers

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

        capacity = attrs.get(
            "capacity",
            getattr(self.instance, "capacity", None),
        )

        if self.instance and capacity is not None:
            existing_spaces_count = self.instance.spaces.count()

            if capacity < existing_spaces_count:
                raise serializers.ValidationError({
                    "capacity": (
                        f"Kapaciteti nuk mund të jetë më i vogël se "
                        f"numri aktual i vendparkimeve ({existing_spaces_count})."
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

        # Kontrollo kapacitetin kur krijohet një vendparkim i ri
        # ose kur një vendparkim zhvendoset në parking tjetër.
        is_new_space = self.instance is None

        is_moving_to_another_lot = (
            self.instance is not None
            and parking_lot is not None
            and parking_lot.pk != self.instance.parking_lot_id
        )

        if parking_lot and (is_new_space or is_moving_to_another_lot):
            existing_spaces_count = parking_lot.spaces.count()

            if existing_spaces_count >= parking_lot.capacity:
                raise serializers.ValidationError({
                    "parking_lot": (
                        "Ky parking e ka arritur kapacitetin maksimal "
                        "të vendparkimeve."
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

    parking_lot_name = serializers.CharField(
        source="parking_space.parking_lot.name",
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
            "parking_lot_name",
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

        if parking_space:
            if parking_space.status == ParkingSpace.SpaceStatus.MAINTENANCE:
                raise serializers.ValidationError({
                    "parking_space": (
                        "Kjo hapësirë është në mirëmbajtje dhe nuk mund të rezervohet."
                    )
                })

            if not parking_space.parking_lot.is_active:
                raise serializers.ValidationError({
                    "parking_space": (
                        "Ky parking është joaktiv dhe nuk mund të bëhen rezervime."
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
            "amount",
            "status",
            "payment_date",
        ]

    def validate_reservation(self, value):
        request = self.context.get("request")

        # Kontrollo nëse rezervimi i përket përdoruesit
        if request and not request.user.is_staff:
            if value.user != request.user:
                raise serializers.ValidationError(
                    "Nuk mund të regjistroni pagesë për rezervimin e një përdoruesi tjetër."
                )

        # Nuk lejohet pagesa për rezervime të anuluara
        if value.status == Reservation.ReservationStatus.CANCELLED:
            raise serializers.ValidationError(
                "Nuk mund të regjistrohet pagesë për një rezervim të anuluar."
            )

        # Kontrollo nëse ekziston një pagesë aktive
        existing_payment = Payment.objects.filter(
            reservation=value,
            status__in=[
                Payment.PaymentStatus.PENDING,
                Payment.PaymentStatus.PAID,
            ],
        )

        if self.instance:
            existing_payment = existing_payment.exclude(
                pk=self.instance.pk
            )

        if existing_payment.exists():
            raise serializers.ValidationError(
                "Ky rezervim ka tashmë një pagesë në pritje ose të paguar."
            )

        return value

    def create(self, validated_data):
        reservation = validated_data["reservation"]

        duration = reservation.end_time - reservation.start_time
        total_minutes = duration.total_seconds() / 60

        if total_minutes <= 0:
            raise serializers.ValidationError({
                "reservation": (
                    "Kohëzgjatja e rezervimit nuk është e vlefshme."
                )
            })

        hours_blocks = math.ceil(total_minutes / 90)

        validated_data["amount"] = Decimal(hours_blocks)

        return super().create(validated_data)

User = get_user_model()

class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=150
    )

    email = serializers.EmailField(
        required=True
    )

    password = serializers.CharField(
        write_only=True,
        min_length=8
    )

    password_confirm = serializers.CharField(
        write_only=True
    )

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "Ky username tashmë është në përdorim."
            )

        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "Ky email tashmë është në përdorim."
            )

        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({
                "password_confirm": "Fjalëkalimet nuk përputhen."
            })

        try:
            validate_password(attrs["password"])
        except DjangoValidationError as error:
            raise serializers.ValidationError({
                "password": error.messages
            })

        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")

        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"]
        )

        return user
    