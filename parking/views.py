from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from .models import ParkingLot, ParkingSpace, Reservation, Payment
from .serializers import (
    ParkingLotSerializer,
    ParkingSpaceSerializer,
    ReservationSerializer,
    PaymentSerializer,
)
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.response import Response
from django.utils import timezone


class ParkingLotViewSet(viewsets.ModelViewSet):
    queryset = ParkingLot.objects.all()
    serializer_class = ParkingLotSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]


class ParkingSpaceViewSet(viewsets.ModelViewSet):
    queryset = ParkingSpace.objects.select_related("parking_lot").all()
    serializer_class = ParkingSpaceSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

class ReservationViewSet(viewsets.ModelViewSet):
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]

    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        queryset = Reservation.objects.select_related(
            "user",
            "parking_space",
            "parking_space__parking_lot",
        )

        if self.request.user.is_staff:
            return queryset.all()

        return queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def update(self, request, *args, **kwargs):
        if not request.user.is_staff:
            raise PermissionDenied(
                "Vetëm administratori mund të ndryshojë rezervimet."
            )

        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        reservation = self.get_object()

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

        reservation.status = Reservation.ReservationStatus.CANCELLED
        reservation.save(update_fields=["status"])

        return Response(self.get_serializer(reservation).data)


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    # Lejohen vetëm GET, POST dhe PATCH
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = Payment.objects.select_related(
            "reservation",
            "reservation__user",
        )

        if self.request.user.is_staff:
            return queryset.all()

        return queryset.filter(reservation__user=self.request.user)

    def get_permissions(self):
        if self.action in ["create", "partial_update"]:
            return [IsAdminUser()]

        return [IsAuthenticated()]

    def partial_update(self, request, *args, **kwargs):
        payment = self.get_object()

        # Lejohet ndryshimi vetëm i statusit
        if set(request.data.keys()) != {"status"}:
            raise ValidationError({
                "detail": "Lejohet vetëm ndryshimi i statusit të pagesës."
            })

        new_status = request.data.get("status")

        # Kontrollo statusin e ri
        allowed_statuses = [
            Payment.PaymentStatus.PAID,
            Payment.PaymentStatus.FAILED,
            Payment.PaymentStatus.REFUNDED,
        ]

        if new_status not in allowed_statuses:
            raise ValidationError({
                "status": "Statusi i dhënë nuk është i vlefshëm."
            })

        # Përcakto kalimet e lejuara ndërmjet statuseve
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

        if new_status not in allowed_transitions.get(payment.status, []):
            raise ValidationError({
                "status": (
                    f"Ndryshimi nga statusi '{payment.status}' "
                    f"në '{new_status}' nuk lejohet."
                )
            })

        payment.status = new_status

        # Regjistro datën kur pagesa shënohet si e paguar
        if (
            new_status == Payment.PaymentStatus.PAID
            and payment.payment_date is None
        ):
            payment.payment_date = timezone.now()

        payment.save(update_fields=["status", "payment_date"])

        return Response(self.get_serializer(payment).data)

class LoginView(ObtainAuthToken):
    pass