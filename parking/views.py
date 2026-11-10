from django.db import transaction
from django.shortcuts import render
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from rest_framework import generics, viewsets
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import (
    AllowAny,
    IsAdminUser,
    IsAuthenticated,
)
from rest_framework.response import Response

from .models import ParkingLot, ParkingSpace, Reservation, Payment
from .serializers import (
    ParkingLotSerializer,
    ParkingSpaceSerializer,
    ReservationSerializer,
    PaymentSerializer,
    RegisterSerializer,
)


class ParkingLotViewSet(viewsets.ModelViewSet):
    queryset = ParkingLot.objects.all()
    serializer_class = ParkingLotSerializer

    def get_permissions(self):
        if self.action in [
            "create",
            "update",
            "partial_update",
            "destroy",
        ]:
            return [IsAdminUser()]

        return [IsAuthenticated()]

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            parking_lot = self.get_object()

            ParkingLot.objects.select_for_update().get(
                pk=parking_lot.pk
            )

            return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            parking_lot = self.get_object()

            ParkingLot.objects.select_for_update().get(
                pk=parking_lot.pk
            )

            return super().partial_update(request, *args, **kwargs)


class ParkingSpaceViewSet(viewsets.ModelViewSet):
    queryset = ParkingSpace.objects.select_related(
        "parking_lot"
    ).all()

    serializer_class = ParkingSpaceSerializer

    def get_permissions(self):
        if self.action in [
            "create",
            "update",
            "partial_update",
            "destroy",
        ]:
            return [IsAdminUser()]

        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        parking_lot_id = request.data.get("parking_lot")

        if parking_lot_id is None:
            return super().create(request, *args, **kwargs)

        with transaction.atomic():
            try:
                ParkingLot.objects.select_for_update().get(
                    pk=parking_lot_id
                )
            except (
                ParkingLot.DoesNotExist,
                ValueError,
                TypeError,
            ):
                pass

            return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            space = self.get_object()
            parking_lot_id = request.data.get(
                "parking_lot",
                space.parking_lot_id,
            )

            try:
                ParkingLot.objects.select_for_update().get(
                    pk=parking_lot_id
                )
            except (
                ParkingLot.DoesNotExist,
                ValueError,
                TypeError,
            ):
                pass

            return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            space = self.get_object()
            parking_lot_id = request.data.get(
                "parking_lot",
                space.parking_lot_id,
            )

            try:
                ParkingLot.objects.select_for_update().get(
                    pk=parking_lot_id
                )
            except (
                ParkingLot.DoesNotExist,
                ValueError,
                TypeError,
            ):
                pass

            return super().partial_update(request, *args, **kwargs)


class ReservationViewSet(viewsets.ModelViewSet):
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]

    http_method_names = [
        "get",
        "post",
        "put",
        "patch",
        "head",
        "options",
    ]

    def get_queryset(self):
        queryset = Reservation.objects.select_related(
            "user",
            "parking_space",
            "parking_space__parking_lot",
        )

        if self.request.user.is_staff:
            return queryset.all()

        return queryset.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        parking_space_id = request.data.get("parking_space")

        if parking_space_id is None:
            return super().create(request, *args, **kwargs)

        with transaction.atomic():
            try:
                ParkingSpace.objects.select_for_update().get(
                    pk=parking_space_id
                )
            except (
                ParkingSpace.DoesNotExist,
                ValueError,
                TypeError,
            ):
                pass

            return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def update(self, request, *args, **kwargs):
        if not request.user.is_staff:
            raise PermissionDenied(
                "Vetëm administratori mund të ndryshojë rezervimet."
            )

        with transaction.atomic():
            reservation = self.get_object()

            parking_space_id = request.data.get(
                "parking_space",
                reservation.parking_space_id,
            )

            try:
                ParkingSpace.objects.select_for_update().get(
                    pk=parking_space_id
                )
            except (
                ParkingSpace.DoesNotExist,
                ValueError,
                TypeError,
            ):
                pass

            return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            reservation = self.get_object()

            reservation = Reservation.objects.select_for_update().get(
                pk=reservation.pk
            )

            if set(request.data.keys()) != {"status"}:
                raise ValidationError({
                    "detail": "Lejohet vetëm ndryshimi i statusit."
                })

            if reservation.status in [
                Reservation.ReservationStatus.CANCELLED,
                Reservation.ReservationStatus.COMPLETED,
            ]:
                raise ValidationError({
                    "status": "Ky rezervim nuk mund të ndryshohet më."
                })

            new_status = request.data.get("status")

            if new_status != Reservation.ReservationStatus.CANCELLED:
                raise ValidationError({
                    "status": "Lejohet vetëm anulimi i rezervimit."
                })

            if reservation.start_time <= timezone.now():
                raise ValidationError({
                    "status": (
                        "Rezervimi nuk mund të anulohet pasi ka filluar."
                    )
                })

            reservation.status = Reservation.ReservationStatus.CANCELLED
            reservation.save(update_fields=["status"])

            return Response(self.get_serializer(reservation).data)


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    http_method_names = [
        "get",
        "post",
        "patch",
        "head",
        "options",
    ]

    def get_queryset(self):
        queryset = Payment.objects.select_related(
            "reservation",
            "reservation__user",
            "reservation__parking_space",
            "reservation__parking_space__parking_lot",
        )

        if self.request.user.is_staff:
            return queryset.all()

        return queryset.filter(
            reservation__user=self.request.user
        )

    def get_permissions(self):
        if self.action == "partial_update":
            return [IsAdminUser()]

        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        reservation_id = request.data.get("reservation")

        if reservation_id is None:
            return super().create(request, *args, **kwargs)

        with transaction.atomic():
            try:
                Reservation.objects.select_for_update().get(
                    pk=reservation_id
                )
            except (
                Reservation.DoesNotExist,
                ValueError,
                TypeError,
            ):
                pass

            return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            payment = self.get_object()

            payment = Payment.objects.select_for_update().get(
                pk=payment.pk
            )

            if set(request.data.keys()) != {"status"}:
                raise ValidationError({
                    "detail": (
                        "Lejohet vetëm ndryshimi i statusit të pagesës."
                    )
                })

            new_status = request.data.get("status")

            allowed_transitions = {
                Payment.PaymentStatus.PENDING: [
                    Payment.PaymentStatus.PAID,
                    Payment.PaymentStatus.FAILED,
                ],
                Payment.PaymentStatus.PAID: [
                    Payment.PaymentStatus.REFUNDED,
                ],
                Payment.PaymentStatus.FAILED: [],
                Payment.PaymentStatus.REFUNDED: [],
            }

            if new_status not in [
                Payment.PaymentStatus.PAID,
                Payment.PaymentStatus.FAILED,
                Payment.PaymentStatus.REFUNDED,
            ]:
                raise ValidationError({
                    "status": "Statusi i dhënë nuk është i vlefshëm."
                })

            if new_status not in allowed_transitions.get(
                payment.status,
                [],
            ):
                raise ValidationError({
                    "status": (
                        f"Ndryshimi nga statusi '{payment.status}' "
                        f"në '{new_status}' nuk lejohet."
                    )
                })

            payment.status = new_status

            if (
                new_status == Payment.PaymentStatus.PAID
                and payment.payment_date is None
            ):
                payment.payment_date = timezone.now()

            payment.save(
                update_fields=["status", "payment_date"]
            )

            return Response(self.get_serializer(payment).data)


class LoginView(ObtainAuthToken):
    authentication_classes = []
    permission_classes = [AllowAny]


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


def parking_list_page(request):
    parking_lots = ParkingLot.objects.prefetch_related(
        "spaces"
    ).filter(is_active=True)

    start_time = parse_datetime(
        request.GET.get("start_time", "")
    )

    end_time = parse_datetime(
       request.GET.get("end_time", "")
    )

    if start_time and timezone.is_naive(start_time):
        start_time = timezone.make_aware(start_time)

    if end_time and timezone.is_naive(end_time):
        end_time = timezone.make_aware(end_time)

    valid_interval = (
        start_time is not None
        and end_time is not None
        and end_time > start_time
    )

    if valid_interval:
        reserved_space_ids = set(
            Reservation.objects.filter(
                parking_space__parking_lot__in=parking_lots,
                start_time__lt=end_time,
                end_time__gt=start_time,
            ).exclude(
                status__in=[
                    Reservation.ReservationStatus.CANCELLED,
                    Reservation.ReservationStatus.COMPLETED,
                ]
            ).values_list(
                "parking_space_id",
                flat=True,
            )
        )
    else:
        reserved_space_ids = set()

    parking_lots_data = []

    for parking_lot in parking_lots:
        spaces = list(parking_lot.spaces.all())

        for space in spaces:
            if (
                space.status == ParkingSpace.SpaceStatus.AVAILABLE
                and space.id in reserved_space_ids
            ):
                space.display_status = "reserved"
            else:
                space.display_status = space.status

        middle = (len(spaces) + 1) // 2

        parking_lots_data.append({
            "parking_lot": parking_lot,
            "parking_spaces_top": spaces[:middle],
            "parking_spaces_bottom": spaces[middle:],
            "total_spaces": len(spaces),
            "available_spaces": sum(
                space.display_status == "available"
                for space in spaces
            ),
            "occupied_spaces": sum(
                space.display_status == "occupied"
                for space in spaces
            ),
            "maintenance_spaces": sum(
                space.display_status == "maintenance"
                for space in spaces
            ),
            "reserved_spaces": sum(
                space.display_status == "reserved"
                for space in spaces
            ),
        })

    context = {
        "parking_lots_data": parking_lots_data,
    }

    return render(
        request,
        "parking/parking_list.html",
        context,
    )
