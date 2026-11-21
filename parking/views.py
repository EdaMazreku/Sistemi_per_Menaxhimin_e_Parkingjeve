from django.db import transaction
from django.shortcuts import render
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.contrib.auth import get_user_model
from django.db.models import Count

from rest_framework import generics, viewsets
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import (
    AllowAny,
    IsAdminUser,
    IsAuthenticated,
)
from rest_framework.response import Response
from rest_framework.views import APIView

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


    def list(self, request, *args, **kwargs):
        self.complete_expired_reservations()
        return super().list(request, *args, **kwargs)


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
        if self.request.user.is_staff:
            serializer.save()
        else:
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

            new_status = request.data.get("status")

            if reservation.status in [
                Reservation.ReservationStatus.CANCELLED,
                Reservation.ReservationStatus.COMPLETED,
            ]:
                raise ValidationError({
                    "status": "Ky rezervim nuk mund të ndryshohet më."
                })

            elif new_status == Reservation.ReservationStatus.CANCELLED:

                if not request.user.is_staff and reservation.start_time <= timezone.now():
                    raise ValidationError({
                        "status": "Rezervimi nuk mund të anulohet pasi ka filluar."
                    })

                if (
                    reservation.status == Reservation.ReservationStatus.CONFIRMED
                    and reservation.start_time <= timezone.now()
                ):
                    raise ValidationError({
                        "status": "Rezervimi i konfirmuar nuk mund të anulohet pasi ka filluar."
                    })

                reservation.status = Reservation.ReservationStatus.CANCELLED

            if new_status == Reservation.ReservationStatus.CONFIRMED:

                if not request.user.is_staff:
                    raise PermissionDenied(
                        "Vetëm administratori mund të konfirmojë rezervimet."
                    )

                if reservation.status != Reservation.ReservationStatus.PENDING:
                    raise ValidationError({
                        "status": (
                            "Vetëm rezervimet në pritje mund të konfirmohen."
                        )
                    })

                parking_space = ParkingSpace.objects.select_for_update().get(
                    pk=reservation.parking_space_id
                )

                overlapping_reservations = Reservation.objects.filter(
                    parking_space=parking_space,
                    start_time__lt=reservation.end_time,
                    end_time__gt=reservation.start_time,
                ).exclude(
                    pk=reservation.pk
                ).exclude(
                    status__in=[
                        Reservation.ReservationStatus.CANCELLED,
                        Reservation.ReservationStatus.COMPLETED,
                    ]
                )

                if overlapping_reservations.exists():
                    raise ValidationError({
                        "status": (
                            "Ky vend ka një rezervim tjetër "
                            "gjatë kësaj periudhe."
                        )
                    })

                reservation.status = (
                    Reservation.ReservationStatus.CONFIRMED
                )

            elif new_status == Reservation.ReservationStatus.CANCELLED:

                reservation.status = (
                    Reservation.ReservationStatus.CANCELLED
                )

            else:
                raise ValidationError({
                    "status": (
                        "Lejohet vetëm konfirmimi ose anulimi i rezervimit."
                    )
                })

            reservation.save(update_fields=["status"])

            return Response(self.get_serializer(reservation).data)

    
    def complete_expired_reservations(self):
        expired_reservations = Reservation.objects.filter(
            status=Reservation.ReservationStatus.CONFIRMED,
            end_time__lte=timezone.now(),
        )

        if not self.request.user.is_staff:
            expired_reservations = expired_reservations.filter(
                user=self.request.user
            )

        return expired_reservations.update(
            status=Reservation.ReservationStatus.COMPLETED
        )


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
                    Payment.PaymentStatus.CANCELLED,
                ],
                Payment.PaymentStatus.PAID: [
                    Payment.PaymentStatus.REFUNDED,
                ],
                Payment.PaymentStatus.FAILED: [],
                Payment.PaymentStatus.REFUNDED: [],
                Payment.PaymentStatus.CANCELLED: [],
            }

            if new_status not in [
                Payment.PaymentStatus.PAID,
                Payment.PaymentStatus.FAILED,
                Payment.PaymentStatus.REFUNDED,
                Payment.PaymentStatus.CANCELLED,
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

class AdminUserCountView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        User = get_user_model()

        total_users = User.objects.filter(
            is_staff=False,
            is_superuser=False
        ).count()

        return Response({
            "total_users": total_users
        })

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

class AdminCheckView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({
            "is_admin": True,
            "username": request.user.username
        })

class AdminUserListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        User = get_user_model()

        users = User.objects.filter(
            is_staff=False,
            is_superuser=False
        ).order_by("username")

        data = [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
            }
            for user in users
        ]

        return Response(data)



class AdminUserManagementListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk=None):
        User = get_user_model()

        if pk is not None:
            try:
                user = User.objects.get(pk=pk)
            except User.DoesNotExist:
                return Response(
                    {"detail": "Përdoruesi nuk u gjet."},
                    status=404
                )

            if user.is_superuser and not request.user.is_superuser:
                raise PermissionDenied(
                    "Nuk keni leje për të parë këtë llogari."
                )

            return Response(self.serialize_user(user))

        users = User.objects.annotate(
            reservation_count=Count(
                "reservations",
                distinct=True
            ),
            payment_count=Count(
                "reservations__payments",
                distinct=True
            )
        ).order_by("username")

        return Response([
            self.serialize_user(user)
            for user in users
        ])

    def serialize_user(self, user):
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": (
                "admin"
                if user.is_staff or user.is_superuser
                else "user"
            ),
            "date_joined": user.date_joined,
            "reservation_count": user.reservations.count(),
            "payment_count": Payment.objects.filter(
                reservation__user=user
            ).count(),
            "status": "active" if user.is_active else "inactive",
        }

    def post(self, request):
        from .serializers import AdminUserCreateSerializer

        serializer = AdminUserCreateSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(
            self.serialize_user(user),
            status=201
        )

    def patch(self, request, pk=None):
        User = get_user_model()

        if pk is None:
            return Response(
                {"detail": "ID e përdoruesit mungon."},
                status=400
            )

        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"detail": "Përdoruesi nuk u gjet."},
                status=404
            )

        if user.is_superuser:
            raise PermissionDenied(
                "Llogaria superuser nuk mund të ndryshohet këtu."
            )

        if "password" in request.data:
            return Response(
                {"detail": "Ndryshimi i fjalëkalimit nuk lejohet këtu."},
                status=400
            )

        username = request.data.get("username", user.username)
        email = request.data.get("email", user.email)
        role = request.data.get("role")
        status_value = request.data.get("status")

        if User.objects.filter(username=username).exclude(pk=pk).exists():
            return Response(
                {"username": "Ky username është në përdorim."},
                status=400
            )

        if User.objects.filter(
            email__iexact=email
        ).exclude(pk=pk).exists():
            return Response(
                {"email": "Ky email është në përdorim."},
                status=400
            )

        if role is not None and role not in ["admin", "user"]:
            return Response(
                {"role": "Roli nuk është i vlefshëm."},
                status=400
            )

        if status_value is not None and status_value not in ["active", "inactive"]:
            return Response(
                {"status": "Statusi nuk është i vlefshëm."},
                status=400
            )

        if user.pk == request.user.pk:
            if status_value == "inactive":
                return Response(
                    {"detail": "Nuk mund ta çaktivizoni llogarinë tuaj."},
                    status=400
                )

            if role == "user":
                return Response(
                    {"detail": "Nuk mund ta hiqni rolin tuaj administrativ."},
                    status=400
                )

        user.username = username
        user.email = email

        if role is not None:
            user.is_staff = (role == "admin")

        if status_value is not None:
            user.is_active = (status_value == "active")

        user.save()

        return Response(self.serialize_user(user))
